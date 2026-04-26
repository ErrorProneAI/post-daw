import { useProjectStore } from "../store/projectStore";
import type { AudioEngine } from "../audio/AudioEngine";
import { clamp } from "../utils/format";

interface Props {
  engine: AudioEngine;
}

export function Mixer({ engine }: Props) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const selectedTrackId = useProjectStore((s) => s.project.selectedTrackId);
  const selectTrack = useProjectStore((s) => s.selectTrack);

  const patch = (id: string, p: Partial<(typeof tracks)[number]>) => {
    updateTrack(id, p);
    engine.rescheduleIfPlaying();
  };

  return (
    <div className="flex gap-1 p-2 overflow-x-auto border-t border-edge bg-panel">
      {tracks.map((t) => (
        <div
          key={t.id}
          className={`w-28 shrink-0 rounded border ${
            selectedTrackId === t.id ? "border-accent" : "border-edge"
          } bg-neutral-900 p-2 flex flex-col gap-1`}
          onClick={() => selectTrack(t.id)}
        >
          <input
            value={t.name}
            onChange={(e) => updateTrack(t.id, { name: e.target.value })}
            className="bg-transparent text-xs border-b border-edge focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-1">
            <button
              className={`text-[10px] px-1 rounded ${
                t.mute ? "bg-red-500/80" : "bg-neutral-800 hover:bg-neutral-700"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                patch(t.id, { mute: !t.mute });
              }}
            >
              M
            </button>
            <button
              className={`text-[10px] px-1 rounded ${
                t.solo ? "bg-yellow-500/80 text-black" : "bg-neutral-800 hover:bg-neutral-700"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                patch(t.id, { solo: !t.solo });
              }}
            >
              S
            </button>
            <div
              className="ml-auto w-3 h-3 rounded"
              style={{ background: t.color }}
            />
          </div>
          <label className="text-[10px] text-neutral-400">Volume</label>
          <input
            type="range"
            min={-60}
            max={12}
            step={0.1}
            value={t.volumeDb}
            onChange={(e) => patch(t.id, { volumeDb: Number(e.target.value) })}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="text-[10px] text-neutral-500">
            {t.volumeDb.toFixed(1)} dB
          </div>
          <label className="text-[10px] text-neutral-400">Pan</label>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={t.pan}
            onChange={(e) =>
              patch(t.id, { pan: clamp(Number(e.target.value), -1, 1) })
            }
            onClick={(e) => e.stopPropagation()}
          />
          <div className="text-[10px] text-neutral-500">
            {t.pan === 0 ? "C" : t.pan < 0 ? `L${Math.abs(t.pan * 100).toFixed(0)}` : `R${(t.pan * 100).toFixed(0)}`}
          </div>
          <button
            className="mt-auto text-[10px] text-neutral-500 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove track "${t.name}"?`)) removeTrack(t.id);
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
