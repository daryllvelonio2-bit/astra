/**
 * Prepare a project for hosting — everything that must exist before its server
 * can start: dependencies, .env, app key, database.
 *
 * WHY THIS IS ITS OWN MODULE: the one long step (composer install) is detached
 * and polled, and that poll is exactly where a run used to hang forever. It is
 * isolated here so the rule lives in one place — every step checks its exit
 * code, and the detached step carries a hard wall-clock deadline and reports
 * its OWN exit code from a marker file, so a stalled download kills itself
 * instead of holding the guest for hours and the panel on "working".
 */
import {
  HostProjectKind,
  HOST_PLANS,
  PrepareStep,
  COMPOSER_INSTALL_DEADLINE_S,
  PREP_LOG,
} from "./hostingPlans";

/** The one status/step/error surface the panel reads. */
export interface PrepareDeps {
  /** One command in the guest; never throws. */
  run: (command: string) => Promise<{ code: number; out: string }>;
  /** Sets the visible status. */
  set: (patch: { status?: "installing" | "error"; step?: string; error?: string | null }) => void;
  /** Appends one line to the panel's log. */
  log: (line: string) => void;
}

type Verdict = { state: "ok" } | { state: "failed"; rc: number } | { state: "timeout" };

/**
 * Run every prepare step for `guestDir`. Returns true when the project is ready
 * to serve; false after setting a plain-language error the panel shows.
 */
export async function prepareProject(
  kind: HostProjectKind,
  guestDir: string,
  deps: PrepareDeps
): Promise<boolean> {
  const plan = HOST_PLANS[kind];
  if (!plan.prepare) return true;

  deps.set({ status: "installing", step: "Preparing the project (first run only)…" });
  const steps = plan.prepare(guestDir);

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    deps.log(`prep ${i + 1}/${steps.length}: ${st.cmd.slice(0, 70)}`);
    const res = await deps.run(st.cmd);

    // A step that FAILED must never look like one that worked: an ignored exit
    // code is what made an earlier attempt sit on "working" with no error.
    if (res.code !== 0) {
      deps.log(`step failed (exit ${res.code}): ${res.out.trim().slice(-160) || "(no output)"}`);
      deps.set({
        status: "error",
        step: "",
        error: `Preparing the project failed at step ${i + 1} of ${steps.length}. Its output is in the log below.`,
      });
      return false;
    }

    if (!st.detached) continue;

    // vendor/ is already on disk from a previous run: redoing the install costs
    // minutes for no change. The artifact IS the readiness signal.
    if (st.waitFor) {
      const already = await deps.run(`[ -f ${st.waitFor} ] && echo YES || echo NO`);
      if (already.out.includes("YES")) {
        deps.log("already installed — skipping the dependency step");
        continue;
      }
    }

    // The poll budget only has to outlast the step's OWN deadline plus a grace
    // for the marker write; because the step stops itself, this cannot spin
    // forever even if composer never returns.
    const verdict = await waitForStep(st, deps, COMPOSER_INSTALL_DEADLINE_S + 120);
    if (verdict.state !== "ok") {
      const tail = await deps.run(`tail -n 8 ${PREP_LOG}`);
      tail.out.split("\n").forEach(deps.log);
      deps.set({ status: "error", step: "", error: prepareError(verdict) });
      return false;
    }
  }

  deps.log("project prepared");
  return true;
}

/** The panel's words for a failed detached step: a cause and a next step, never a raw command. */
function prepareError(v: Verdict): string {
  const tail = " Its last lines are below.";
  if (v.state === "timeout") {
    return `Preparing the project took too long and was stopped.${tail} Check the network, then try again.`;
  }
  if (v.state === "failed" && (v.rc === 124 || v.rc === 137)) {
    const mins = Math.round(COMPOSER_INSTALL_DEADLINE_S / 60);
    return `Composer ran past its ${mins}-minute limit and was stopped.${tail} A large dependency tree on a slow connection can exceed it — try again, or run composer yourself in the Terminal.`;
  }
  return `Composer could not install the project's dependencies in that folder.${tail} A missing composer.json, no network, or a PHP extension the packages need are the usual causes.`;
}

/**
 * Poll a detached step for its artifact OR its exit-code marker. ONE guest
 * command per batch — spawning a guest process is the expensive part under
 * PRoot — so a wait never looks like a loop of its own.
 */
async function waitForStep(st: PrepareStep, deps: PrepareDeps, seconds: number): Promise<Verdict> {
  const artifact = st.waitFor ? `[ -f ${st.waitFor} ] && { echo ARTIFACT; break; }; ` : "";
  const exit = st.exitFile
    ? `[ -f ${st.exitFile} ] && { echo RC:$(cat ${st.exitFile}); break; }; `
    : "";
  // ~50s of in-guest checking per call, so `seconds` of wall time is `batches` calls.
  const batches = Math.ceil(seconds / 50);
  for (let i = 0; i < batches; i++) {
    const res = await deps.run(
      `for i in 1 2 3 4 5 6 7 8 9 10; do ${artifact}${exit}sleep 5; done; echo CHECKED`
    );
    if (res.out.includes("ARTIFACT")) return { state: "ok" };
    const rc = res.out.match(/RC:(\d+)/);
    if (rc) return Number(rc[1]) === 0 ? { state: "ok" } : { state: "failed", rc: Number(rc[1]) };
    // The step's own words, so a slow install names itself instead of spinning.
    const last = await deps.run(`tail -n 1 ${PREP_LOG} 2>/dev/null`);
    const line = last.out.trim();
    if (line && line !== "CHECKED" && !/^RC:/.test(line)) deps.set({ step: line.slice(0, 80) });
  }
  return { state: "timeout" };
}
