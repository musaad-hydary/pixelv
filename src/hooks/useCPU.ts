import { useState, useRef, useCallback } from "react";
import { assemble, AssemblyError } from "../core/assembler";
import { RV32CPU, CPUState } from "../core/cpu";

export type RunStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; cycles: number; message: string }
  | { kind: "error"; message: string; line?: number };

export interface CPUHookResult {
  status: RunStatus;
  cpuState: CPUState | null;
  fb: Uint32Array | null;
  run: (source: string) => void;
  reset: () => void;
}

export function useCPU(): CPUHookResult {
  const [status, setStatus] = useState<RunStatus>({ kind: "idle" });
  const [cpuState, setCpuState] = useState<CPUState | null>(null);
  const [fb, setFb] = useState<Uint32Array | null>(null);

  // useRef stores the CPU instance without triggering re-renders
  const cpuRef = useRef<RV32CPU | null>(null);

  const run = useCallback((source: string) => {
    setStatus({ kind: "running" });

    // setTimeout(0) yields to the browser for one frame so
    setTimeout(() => {
      try {
        // Step 1: assemble source text → binary
        const result = assemble(source);

        // Step 2: create CPU and load program
        const cpu = new RV32CPU(result.binary, result.base);
        cpuRef.current = cpu;

        // Step 3: run up to 5M cycles
        const MAX = 5_000_000;
        const cycles = cpu.run(MAX);

        // Step 4: copy results into React state
        setCpuState(cpu.getState());
        setFb(new Uint32Array(cpu.fb));

        setStatus({
          kind: "ok",
          cycles,
          message: cpu.halted
            ? `✓ ${cycles.toLocaleString()} cycles — ${result.lineCount} instructions`
            : `⚠ cycle limit hit (${MAX.toLocaleString()}) - partial render`,
        });
      } catch (e) {
        const err = e as AssemblyError;
        setStatus({
          kind: "error",
          message: err.message ?? String(e),
          line: err.line,
        });
      }
    }, 0);
  }, []);

  const reset = useCallback(() => {
    cpuRef.current = null;
    setCpuState(null);
    setFb(null);
    setStatus({ kind: "idle" });
  }, []);

  return { status, cpuState, fb, run, reset };
}
