import { useState, useRef, useEffect, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useCPU } from "./hooks/useCPU";
import { blitToCanvas, exportPNG } from "./core/framebuffer";
import { DEMOS } from "./demos";
import { FB_WIDTH, FB_HEIGHT } from "./core/cpu";

type Status = "idle" | "running" | "success" | "error";

const REG_NAMES = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
];

const SYSCALLS = [
  ["10", "exit"],
  ["200", "set_pixel"],
  ["201", "fill_rect"],
  ["202", "clear"],
  ["203", "draw_line"],
  ["204", "draw_circle"],
];

const lightEditor = EditorView.theme({
  "&": { backgroundColor: "white !important", color: "#000000" },
  ".cm-gutters": {
    backgroundColor: "#e0e0e0 !important",
    color: "#808080",
    border: "none",
    borderRight: "1px solid #c0c0c0",
  },
  ".cm-activeLineGutter": { backgroundColor: "#c0c0c0 !important" },
  ".cm-activeLine": { backgroundColor: "#f0f0f0 !important" },
  ".cm-cursor": { borderLeftColor: "#000000" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#000080 !important",
  },
});

export default function App() {
  const [activeDemo, setActiveDemo] = useState(0);
  const [code, setCode] = useState(DEMOS[0].source);
  const [statusMsg, setStatusMsg] = useState("Ready");
  const [cycles, setCycles] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { status, cpuState, fb, run, reset } = useCPU();

  useEffect(() => {
    if (fb && canvasRef.current) blitToCanvas(fb, canvasRef.current);
  }, [fb]);

  useEffect(() => {
    switch (status.kind) {
      case "idle":
        setStatusMsg("Ready");
        setCycles(0);
        break;
      case "running":
        setStatusMsg("Assembling and executing...");
        break;
      case "ok":
        setStatusMsg(status.message);
        setCycles(status.cycles);
        break;
      case "error":
        setStatusMsg(status.message);
        break;
    }
  }, [status]);

  const handleRun = useCallback(() => run(code), [run, code]);

  const handleDemo = (i: number) => {
    setActiveDemo(i);
    setCode(DEMOS[i].source);
    reset();
  };

  const handleReset = () => {
    reset();
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, FB_WIDTH, FB_HEIGHT);
    }
  };

  const handleExport = () => {
    if (canvasRef.current) exportPNG(canvasRef.current);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#c0c0c0] font-mono select-none">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-2 py-1 bg-[#000080] text-white text-xs shrink-0">
        <span className="text-[10px]">🖥</span>
        <span className="font-bold tracking-wider">
          PIXELV — RV32I Graphics Runtime
        </span>
        <div className="flex-1" />
        <WinButton>_</WinButton>
        <WinButton>□</WinButton>
        <WinButton>✕</WinButton>
      </div>

      {/* Menu bar */}
      <div className="flex items-center gap-1 px-2 py-0.5 bg-[#c0c0c0] text-xs border-b-2 border-[#808080] shrink-0">
        <button
          className="px-2 py-0.5 hover:bg-[#000080] hover:text-white text-[11px]"
          onClick={() =>
            window.open("https://github.com/riscv/riscv-isa-manual", "_blank")
          }
        >
          About
        </button>
        <button
          className="px-2 py-0.5 hover:bg-[#000080] hover:text-white text-[11px]"
          onClick={handleRun}
        >
          Run
        </button>
        <button
          className="px-2 py-0.5 hover:bg-[#000080] hover:text-white text-[11px]"
          onClick={() => setDarkMode((d) => !d)}
        >
          View
        </button>
        <button
          className="px-2 py-0.5 hover:bg-[#000080] hover:text-white text-[11px]"
          onClick={() =>
            window.open("https://github.com/riscv/riscv-isa-manual", "_blank")
          }
        >
          Help
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#c0c0c0] border-b-2 border-[#808080] shrink-0">
        <button
          className="btn-raised px-4 py-1 text-xs font-bold active:translate-y-px disabled:opacity-50"
          onClick={handleRun}
          disabled={status.kind === "running"}
        >
          ▶ RUN
        </button>
        <button
          className="btn-raised px-3 py-1 text-xs active:translate-y-px"
          onClick={handleReset}
        >
          ■ RESET
        </button>
      </div>

      {/* Main */}
      <div className="flex flex-1 gap-2 p-2 overflow-hidden">
        {/* Sidebar */}
        <div className="panel-raised w-52 flex flex-col bg-[#c0c0c0] shrink-0 overflow-hidden">
          <GroupBox className="flex flex-col gap-1">
            {DEMOS.map((d, i) => (
              <button
                key={d.name}
                className={`btn-raised w-full text-left px-2 py-1 text-[11px] active:translate-y-px
                  ${activeDemo === i ? "bg-[#000080] text-white" : "hover:bg-[#000080] hover:text-white"}`}
                onClick={() => handleDemo(i)}
              >
                {d.name}
              </button>
            ))}
          </GroupBox>

          <GroupBox>
            {SYSCALLS.map(([num, name]) => (
              <div key={num} className="flex gap-2 text-[10px] py-0.5">
                <span className="text-[#000080] font-bold w-12">a7={num}</span>
                <span>{name}</span>
              </div>
            ))}
          </GroupBox>
        </div>

        {/* Editor */}
        <div className="panel-raised flex flex-col flex-1 overflow-hidden min-w-0 bg-[#c0c0c0]">
          <div className="text-[10px] font-bold px-2 py-1 border-b-2 border-[#808080] tracking-wider flex justify-between items-center">
            <span>ASM EDITOR</span>
            <span className="text-[#808080]">
              {darkMode ? "DARK" : "LIGHT"}
            </span>
          </div>
          <div className="panel-sunken flex-1 m-2 overflow-hidden">
            <CodeMirror
              value={code}
              onChange={setCode}
              theme={darkMode ? oneDark : lightEditor}
              height="100%"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                autocompletion: false,
                highlightActiveLine: true,
              }}
              style={{
                height: "100%",
                fontSize: "12px",
                fontFamily: "Courier New, monospace",
              }}
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="panel-raised w-80 flex flex-col shrink-0 overflow-hidden bg-[#c0c0c0]">
          {/* Stats bar — sits above the canvas */}
          <div className="flex justify-around items-center px-2 py-1.5 border-b-2 border-[#808080]">
            <div className="flex flex-col items-center">
              <span className="text-[9px] tracking-widest mb-0.5">CYCLES</span>
              <div className="panel-sunken px-2 py-0.5 bg-black text-[#ff0000] font-mono text-xs tracking-widest min-w-[90px] text-right">
                {String(cycles).padStart(7, "0")}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] tracking-widest mb-0.5">
                FINAL PC
              </span>
              <div className="panel-sunken px-2 py-0.5 bg-black text-[#ff0000] font-mono text-xs tracking-widest min-w-[90px] text-right">
                {cpuState
                  ? `0x${cpuState.pc.toString(16).padStart(6, "0").toUpperCase()}`
                  : "0x000000"}
              </div>
            </div>
          </div>

          {/* Canvas */}
          <GroupBox>
            <div className="panel-sunken p-0 bg-black overflow-hidden">
              <canvas
                ref={canvasRef}
                width={FB_WIDTH}
                height={FB_HEIGHT}
                style={{ imageRendering: "pixelated", display: "block" }}
                className="w-full h-full"
              />
            </div>
            <div className="flex justify-end mt-1">
              <button
                className="btn-raised px-2 py-0.5 text-[10px] active:translate-y-px"
                onClick={handleExport}
              >
                ↓ EXPORT PNG
              </button>
            </div>
          </GroupBox>

          {/* Registers */}
          <GroupBox className="flex-1 overflow-hidden flex flex-col">
            <div className="panel-sunken flex-1 overflow-y-auto bg-white p-1">
              <div className="grid grid-cols-2 gap-px">
                {REG_NAMES.map((name, i) => {
                  const val = cpuState?.registers[i] ?? null;
                  const nonzero = val !== null && val !== 0;
                  return (
                    <div
                      key={name}
                      className={`flex justify-between px-1.5 py-px text-[10px]
                        ${nonzero ? "bg-[#000080] text-white" : "hover:bg-[#000080] hover:text-white"}`}
                    >
                      <span
                        className={`w-7 font-bold ${nonzero ? "text-white" : "text-[#000080]"}`}
                      >
                        {name}
                      </span>
                      <span
                        className={
                          nonzero ? "text-[#ffff00]" : "text-[#808080]"
                        }
                      >
                        {val !== null
                          ? nonzero
                            ? `0x${(val >>> 0).toString(16).padStart(8, "0")}`
                            : "—"
                          : "·"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </GroupBox>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-2 py-0.5 border-t-2 border-[#808080] text-[10px] shrink-0">
        <div className="panel-sunken px-2 py-px flex-1 truncate">
          {statusMsg}
        </div>
        <div className="panel-sunken px-2 py-px w-28 text-center">
          RV32I + M-ext
        </div>
        <div className="panel-sunken px-2 py-px w-20 text-center">
          256×256 FB
        </div>
      </div>
    </div>
  );
}

function WinButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="btn-raised w-5 h-5 text-[10px] flex items-center justify-center font-bold">
      {children}
    </button>
  );
}

function GroupBox({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-2 border-[#808080] mx-2 mb-2 p-2 ${className}`}>
      {children}
    </div>
  );
}
