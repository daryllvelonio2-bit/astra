# AI Engine

`src/ai/` holds the agent, the Astra CLI bridge, the code-execution gateway,
background-task tracking, and all chat UI.

## Agent core (`agent/`)

- `agentTypes.ts` — turn statuses (`idle | thinking | executing_tool |
  waiting_approval | verifying | done | error`), steps (`thought | tool_call
  | tool_result | approval_request | message`), tool calls/results, sessions,
  skills.
- `agentCore.ts` — thin `processAgentQuery()` facade: reports status, then
  delegates the entire turn to `streamAstraCliChat()`. There is no JS-side
  planning loop; all agency lives in the CLI.

## Astra CLI bridge (`astra/`)

The bundled Gemini-CLI fork in `astra-cli/` is provisioned into the guest at
`/usr/local/share/astra-cli` and run as `/bin/astra`:

- `astraCliService.ts` — resolves keys/model/mode from config, resolves the
  working directory from the active workspace, builds the prompt, and runs
  `astra -p … -o stream-json` via `executeCommandStream`, fanning output
  lines into the stream parser. Always non-interactive (YOLO); abort kills
  the command and cancels pending approvals.
- `astraPromptBuilder.ts` — injects workspace context, live background
  tasks, IDE auto-open/browser directives, root-install and background-server
  rules; escapes the prompt for shell transport.
- `astraStreamParser.ts` — NDJSON event machine: session ids, thoughts,
  tool calls (with a read-only tool gate and an interactive-approval path
  via `/tmp/astra-approval.json`), file writes (which open in the editor via
  `ideActionService`), background commands (registered as tasks, terminal
  triggered, browser opened), streamed message deltas, early resolve, and a
  tolerant plain-text fallback that maps noise (`proot…`, rate limits, key
  rolling) to readable messages.
- `astraModes.ts` — cognitive modes/efforts (`--fast/--medium/--slow/--spec/--godot*`).
- `astraFormatters.ts` — human-readable tool titles/details/icons and
  `[IDE_ACTION:…]` execution.

## Code-execution gateway (`runner/`)

`executeCode()` dispatches by language (`runner/index.ts`):

| Tier | Implementation | Use |
|---|---|---|
| Client sandbox | `clientRunner.ts` (`new Function` with captured `console`) | Instant offline JS |
| Interactive Terminal | `terminalRunner.ts` & `ideActionService.runInTerminal` | Interactive user session |
| Native / guest sandbox | PRoot shell, `PRootService.runCommand`, `PhpEngineService` | Full Debian Linux toolchain, Python, Node, PHP/Laravel |

## Chat UI (`components/`)

- `AstraChatScreen.tsx` — integrated Astra AI assistant tab in workspace navbar.
- `useChatSession.ts` — shared state machine: ref-mirrored input (no stale
  sends), abortable turns, optimistic messages, text deltas, steps, live
  status, approvals, sessions, snippet run/apply (client tier), clipboard.
- `ChatHeader.tsx` — session, model, and mode pickers plus navigation.
  `CognitiveModeBar.tsx` + `CognitiveModeModal.tsx` — quick and full mode/effort
  pickers. `ModelPickerModal.tsx`, `ChatSessionsModal.tsx` — models and saved sessions.
- `AgentMessageItem.tsx`, `StepCard.tsx`, `MarkdownMessageView.tsx` —
  message bubbles with thoughts, collapsible tool steps, and code blocks
  with Run/Apply/Copy. `DirectoryListRenderer.tsx` — pretty 📁/📄 listings.
- `LiveAgentStatusBar.tsx`, `RunningTasksBar.tsx` — turn progress with
  elapsed timer + Stop, and the killable background-task list.
- `ActionApprovalModal.tsx` — approve-once/session, reject, stop (kept as
  safety plumbing; normal turns auto-approve). `ExecutionResultModal.tsx` —
  snippet stdout/stderr viewer. `sessionReconcile.ts` — settles stale
  `thinking/executing/pending` messages after restarts.

## Voice input

Empty chat boxes swap send → mic. `useVoiceInput.ts` prefers on-device
`SpeechRecognizer` (`modules/voice-input`); on devices without a recognizer
service it records audio and transcribes via `voiceTranscribe.ts` using the
`gemini-3.1-flash-lite` model and the user's own key, then deletes the clip.

## Background tasks (`services/`)

- `runningTasksService.ts` — singleton registry of dev servers with
  dedupe/merge, terminal triggering, and a 5s `verifyProcesses()` poll.
- `runningTasksInspect.ts` — pure output parser that spots servers
  (`artisan`, Vite, Expo, `http.server`, port URLs) and seeds task entries
  with sensible default ports.
- `processTreeKill.ts` — pid-tree collection and killing (native-first;
  guest fallback), port-PID lookup, server liveness checks.
- `conversationService.ts` — per-workspace JSON sessions with change
  subscriptions and legacy `.ai/` migration.
