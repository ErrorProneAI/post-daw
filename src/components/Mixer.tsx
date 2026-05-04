import { useCallback } from "react";
import { useProjectStore } from "../store/projectStore";
import type { AudioEngine } from "../audio/AudioEngine";
import { clamp } from "../utils/format";
import { MeterBar } from "./MeterBar";

interface Props {
  engine: AudioEngine;
}

export function Mixer({ engine }: Props) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const master = useProjectStore((s) => s.project.master);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const selectedTrackId = useProjectStore((s) => s.project.selectedTrackId);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setMasterVolumeDb = useProjectStore((s) => s.setMasterVolumeDb);

  const patch = (id: string, p: Partial<(typeof tracks)[number]>) => {
    updateTrack(id, p);
    engine.rescheduleIfPlaying();
  };

  return (
    <div className="flex gap-1 p-2 overflow-x-auto border-t border-edge bg-panel">
      {tracks.map((t) => (
        <TrackStrip
          key={t.id}
          engine={engine}
          track={t}
          selected={selectedTrackId === t.id}
          onSelect={() => selectTrack(t.id)}
          onPatch={(p) => patch(t.id, p)}
          onRemove={() => removeTrack(t.id)}
        />
      ))}

      <div
        className="w-32 shrink-0 rounded border border-cyan-700 bg-neutral-900 p-2 flex flex-col gap-1"
        title="Master bus"
      >
        <div className="text-[11px] uppercase tracking-wider text-cyan-300">
          Master
        </div>
        <MasterMeter engine={engine} />
        <label className="text-[10px] text-neutral-400">Volume</label>
        <input
          type="range"
          min={-60}
          max={12}
          step={0.1}
          value={master.volumeDb}
          onChange={(e) => setMasterVolumeDb(Number(e.target.value))}
        />
        <div className="text-[10px] text-neutral-500">
          {master.volumeDb.toFixed(1)} dB
        </div>
      </div>
    </div>
  );
}

function TrackStrip({
  engine,
  track,
  selected,
  onSelect,
  onPatch,
  onRemove,
}: {
  engine: AudioEngine;
  track: ReturnType<typeof useProjectStore.getState>["project"]["tracks"][number];
  selected: boolean;
  onSelect: () => void;
  onPatch: (p: Partial<typeof track>) => void;
  onRemove: () => void;
}) {
  const getAnalyzer = useCallback(
    () => engine.getTrackAnalyzer(track.id),
    [engine, track.id],
  );
  return (
    <div
      className={`w-28 shrink-0 rounded border ${
        selected ? "border-accent" : "border-edge"
      } bg-neutral-900 p-2 flex flex-col gap-1`}
      onClick={onSelect}
    >
      <input
        value={track.name}
        onChange={(e) => onPatch({ name: e.target.value })}
        className="bg-transparent text-xs border-b border-edge focus:outline-none focus:border-accent"
        onClick={(e) => e.stopPropagation()}
      />
      <div onClick={(e) => e.stopPropagation()}>
        <MeterBar getAnalyzer={getAnalyzer} height={14} showText={false} />
      </div>
      <div className="flex items-center gap-1">
        <button
          className={`text-[10px] px-1 rounded ${
            track.mute ? "bg-red-500/80" : "bg-neutral-800 hover:bg-neutral-700"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onPatch({ mute: !track.mute });
          }}
        >
          M
        </button>
        <button
          className={`text-[10px] px-1 rounded ${
            track.solo
              ? "bg-yellow-500/80 text-black"
              : "bg-neutral-800 hover:bg-neutral-700"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onPatch({ solo: !track.solo });
          }}
        >
          S
        </button>
        <div
          className="ml-auto w-3 h-3 rounded"
          style={{ background: track.color }}
        />
      </div>
      <label className="text-[10px] text-neutral-400">Volume</label>
      <input
        type="range"
        min={-60}
        max={12}
        step={0.1}
        value={track.volumeDb}
        onChange={(e) => onPatch({ volumeDb: Number(e.target.value) })}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="text-[10px] text-neutral-500">
        {track.volumeDb.toFixed(1)} dB
      </div>
      <label className="text-[10px] text-neutral-400">Pan</label>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={track.pan}
        onChange={(e) =>
          onPatch({ pan: clamp(Number(e.target.value), -1, 1) })
        }
        onClick={(e) => e.stopPropagation()}
      />
      <div className="text-[10px] text-neutral-500">
        {track.pan === 0
          ? "C"
          : track.pan < 0
            ? `L${Math.abs(track.pan * 100).toFixed(0)}`
            : `R${(track.pan * 100).toFixed(0)}`}
      </div>
      <button
        className="mt-auto text-[10px] text-neutral-500 hover:text-red-400"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Remove track "${track.name}"?`)) onRemove();
        }}
      >
        Delete
      </button>
    </div>
  );
}

function MasterMeter({ engine }: { engine: AudioEngine }) {
  const getAnalyzer = useCallback(
    () => engine.getMasterAnalyzer(),
    [engine],
  );
  return <MeterBar getAnalyzer={getAnalyzer} height={20} showText={false} />;
}
