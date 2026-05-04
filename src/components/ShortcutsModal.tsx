interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "Space", desc: "Play / Pause" },
  { keys: "Enter", desc: "Stop" },
  { keys: "S", desc: "Split selected clip at playhead" },
  { keys: "Delete / Backspace", desc: "Remove selected clip" },
  { keys: "Ctrl+Z", desc: "Undo" },
  { keys: "Ctrl+Y / Ctrl+Shift+Z", desc: "Redo" },
  { keys: "Ctrl+E", desc: "Open Export modal" },
  { keys: "Ctrl+/", desc: "Toggle this overlay" },
  { keys: "Ctrl+B", desc: "Open AI Assistant" },
  { keys: "Shift+drag in ruler", desc: "Set loop region" },
  { keys: "Ctrl+wheel over timeline", desc: "Zoom horizontally" },
];

export function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[420px] bg-panel border border-edge rounded p-4 space-y-2 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <div className="font-medium">Keyboard shortcuts</div>
          <button
            className="ml-auto text-neutral-500 hover:text-neutral-100"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-y-1 text-xs">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <div className="font-mono text-neutral-300">{s.keys}</div>
              <div className="text-neutral-400">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
