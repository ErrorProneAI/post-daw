import { useCallback, useRef, useState } from "react";
import { useProjectStore, EFFECT_CATALOG } from "../store/projectStore";
import type { AudioEngine } from "../audio/AudioEngine";
import { computePeaks } from "../audio/waveform";
import { newId } from "../utils/id";
import type { AudioAsset } from "../types";
import { formatTime } from "../utils/format";

interface Props {
  engine: AudioEngine;
}

export function Sidebar({ engine }: Props) {
  const assets = useProjectStore((s) => s.assets);
  const addAsset = useProjectStore((s) => s.addAsset);
  const addClip = useProjectStore((s) => s.addClip);
  const addEffect = useProjectStore((s) => s.addEffect);
  const tracks = useProjectStore((s) => s.project.tracks);
  const selectedTrackId = useProjectStore((s) => s.project.selectedTrackId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      setLoading(true);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("audio") && !/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(file.name)) {
            continue;
          }
          try {
            const buffer = await engine.decodeFile(file);
            const peaks = computePeaks(buffer, 200);
            const asset: AudioAsset = {
              id: newId("ast"),
              name: file.name,
              duration: buffer.duration,
              sampleRate: buffer.sampleRate,
              channels: buffer.numberOfChannels,
              buffer,
              peaks,
              peaksPerSecond: 200,
            };
            addAsset(asset);
          } catch (err) {
            console.error("Failed to import", file.name, err);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [engine, addAsset],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      void importFiles(e.dataTransfer.files);
    }
  };

  const dragStartAsset = (e: React.DragEvent, assetId: string) => {
    e.dataTransfer.setData("application/x-postdaw-asset", assetId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const addToSelectedTrack = (assetId: string) => {
    const targetTrack = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0];
    if (!targetTrack) return;
    const asset = assets[assetId];
    if (!asset) return;
    addClip({
      trackId: targetTrack.id,
      assetId,
      start: 0,
      offset: 0,
      duration: asset.duration,
      gainDb: 0,
      name: asset.name,
    });
  };

  const targetTrackForEffect =
    tracks.find((t) => t.id === selectedTrackId) ?? tracks[0];

  return (
    <aside
      className="w-64 shrink-0 border-r border-edge bg-panel flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <div className="p-3 border-b border-edge">
        <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
          Audio files
        </div>
        <button
          className="w-full bg-neutral-800 hover:bg-neutral-700 rounded px-2 py-1 text-sm"
          onClick={() => fileRef.current?.click()}
        >
          {loading ? "Loading…" : "Import…"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-[11px] text-neutral-500 mt-2">
          Drag files into this panel or the timeline.
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {Object.values(assets).length === 0 && (
          <div className="p-3 text-xs text-neutral-500">
            No audio imported yet.
          </div>
        )}
        {Object.values(assets).map((a) => (
          <div
            key={a.id}
            className="group px-3 py-2 border-b border-edge hover:bg-neutral-900 cursor-grab"
            draggable
            onDragStart={(e) => dragStartAsset(e, a.id)}
            onDoubleClick={() => addToSelectedTrack(a.id)}
            title="Drag onto timeline, or double-click to add to selected track"
          >
            <div className="text-sm truncate">{a.name}</div>
            <div className="text-[11px] text-neutral-500">
              {formatTime(a.duration)} · {a.channels}ch · {a.sampleRate}Hz
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-edge">
        <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
          Add effect
          {targetTrackForEffect ? (
            <span className="text-neutral-500 normal-case ml-1">
              → {targetTrackForEffect.name}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {EFFECT_CATALOG.map((e) => (
            <button
              key={e.kind}
              className="text-xs bg-neutral-800 hover:bg-neutral-700 rounded px-2 py-1 disabled:opacity-50"
              disabled={!targetTrackForEffect}
              onClick={() =>
                targetTrackForEffect &&
                addEffect(targetTrackForEffect.id, e.kind)
              }
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
