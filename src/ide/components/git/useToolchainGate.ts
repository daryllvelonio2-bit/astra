import { useEffect, useState } from "react";
import { GateStatus, subscribeToolchainGate } from "../../services/toolchainGate";

const INITIAL: GateStatus = {
  ready: false,
  provisioning: false,
  pct: 0,
  message: "",
  gitEssentialsReady: false,
  settled: false,
};

/** Subscribe a component to the toolchain gate (polls while mounted). */
export function useToolchainGate(): GateStatus {
  const [gate, setGate] = useState<GateStatus>(INITIAL);
  useEffect(() => subscribeToolchainGate(setGate), []);
  return gate;
}
