import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { AudioEngine } from "../audio/AudioEngine";
import { formatTime } from "../utils/format";
import { renderProject } from "../audio/Renderer";
import { encodeWav } from "../utils/wav";

interface Props {
  engine: AudioEngine;
}

export function TransportBar({ engine }: Props) {
  const playing = useProjectStore((s) => s.transport.playing);
  const position = useProjectStore((s) => s.transport.position);
  const loop = useProjectStore((s) => s.project.loop);
  const setLoop = useProjectStore((s) => s.setLoop);
  const projectName = useProjectStore((s) => s.project.name);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const setExportState = useProjectStore((s) => s.setExportState);
  const exportInProgress = useProjectStore((s) => s.export.inProgress);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        playing ? engine.pause() : engine.play();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "Home") {
        engine.seek(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, engine, undo, redo]);

  const doExport = async () => {
    setExportState(true, 0);
    try {
      const state = useProjectStore.getState();
      const buf = await renderProject(state, (p) =>
        useProjectStore.getState().setExportState(true, p),
      );
      const blob = encodeWav(buf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "project"}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExportState(false, 0);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-edge bg-panel">
      <input
        className="bg-transparent border border-edge rounded px-2 py-1 text-sm w-48 focus:outline-none focus:border-accent"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
      />

      <div className="flex items-center gap-1">
        <button
          className="px-3 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
          onClick={() => engine.seek(0)}
          title="Rewind (Home)"
        >
          ⏮
        </button>
        {playing ? (
          <button
            className="px-3 py-1 bg-accent rounded hover:opacity-90"
            onClick={() => engine.pause()}
            title="Pause (Space)"
          >
            ⏸
          </button>
        ) : (
          <button
            className="px-3 py-1 bg-accent rounded hover:opacity-90"
            onClick={() => engine.play()}
            title="Play (Space)"
          >
            ▶
          </button>
        )}
        <button
          className="px-3 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
          onClick={() => engine.stop()}
          title="Stop"
        >
          ⏹
        </button>
      </div>

      <div className="font-mono text-sm tabular-nums px-3 py-1 bg-neutral-900 rounded border border-edge">
        {formatTime(position)}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={loop.enabled}
          onChange={(e) => setLoop({ enabled: e.target.checked })}
        />
        Loop
      </label>
      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <span>{formatTime(loop.start)}</span>
        <span>–</span>
        <span>{formatTime(loop.end)}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="px-2 py-1 text-sm bg-neutral-800 rounded hover:bg-neutral-700"
          onClick={undo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="px-2 py-1 text-sm bg-neutral-800 rounded hover:bg-neutral-700"
          onClick={redo}
          title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
        >
          Redo
        </button>
        <button
          className="px-3 py-1 text-sm bg-emerald-600 rounded hover:bg-emerald-500 disabled:opacity-50"
          onClick={doExport}
          disabled={exportInProgress}
        >
          {exportInProgress ? "Rendering…" : "Export WAV"}
        </button>
      </div>
    </div>
  );
}
