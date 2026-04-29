import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { AudioEngine } from "../audio/AudioEngine";
import { formatTime } from "../utils/format";

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
  const exportInProgress = useProjectStore((s) => s.export.inProgress);
  const setShowExportModal = useProjectStore((s) => s.setShowExportModal);
  const setShowShortcuts = useProjectStore((s) => s.setShowShortcuts);
  const setShowAssistant = useProjectStore((s) => s.setShowAssistant);
  const removeClip = useProjectStore((s) => s.removeClip);
  const splitClip = useProjectStore((s) => s.splitClip);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      const meta = e.ctrlKey || e.metaKey;

      if (e.code === "Space") {
        e.preventDefault();
        if (playing) engine.pause();
        else engine.play();
      } else if (e.key === "Enter" && !meta) {
        engine.stop();
      } else if (e.key === "z" && meta && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === "y" && meta) ||
        (e.key === "z" && meta && e.shiftKey)
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "Home") {
        engine.seek(0);
      } else if (e.key === "e" && meta) {
        e.preventDefault();
        setShowExportModal(true);
      } else if (e.key === "/" && meta) {
        e.preventDefault();
        const cur = useProjectStore.getState().ui.showShortcuts;
        setShowShortcuts(!cur);
      } else if (e.key === "b" && meta) {
        e.preventDefault();
        setShowAssistant(true);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !meta
      ) {
        const sid = useProjectStore.getState().project.selectedClipId;
        if (sid) {
          e.preventDefault();
          removeClip(sid);
          engine.rescheduleIfPlaying();
        }
      } else if ((e.key === "s" || e.key === "S") && !meta) {
        const sid = useProjectStore.getState().project.selectedClipId;
        if (sid) {
          const pos = useProjectStore.getState().transport.position;
          splitClip(sid, pos);
          engine.rescheduleIfPlaying();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    playing,
    engine,
    undo,
    redo,
    setShowExportModal,
    setShowShortcuts,
    setShowAssistant,
    removeClip,
    splitClip,
  ]);

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
          title="Stop (Enter)"
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
          className="px-2 py-1 text-sm bg-neutral-800 rounded hover:bg-neutral-700"
          onClick={() => setShowAssistant(true)}
          title="Assistant (Ctrl+B)"
        >
          Assistant
        </button>
        <button
          className="px-2 py-1 text-sm bg-neutral-800 rounded hover:bg-neutral-700"
          onClick={() => setShowShortcuts(true)}
          title="Shortcuts (Ctrl+/)"
        >
          ?
        </button>
        <button
          className="px-3 py-1 text-sm bg-emerald-600 rounded hover:bg-emerald-500 disabled:opacity-50"
          onClick={() => setShowExportModal(true)}
          disabled={exportInProgress}
        >
          {exportInProgress ? "Rendering…" : "Export"}
        </button>
      </div>
    </div>
  );
}
