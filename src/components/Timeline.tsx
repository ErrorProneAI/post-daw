import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { AudioEngine } from "../audio/AudioEngine";
import { ClipView } from "./Clip";
import { clamp, formatTime } from "../utils/format";
import type { ID } from "../types";

interface Props {
  engine: AudioEngine;
}

const TRACK_HEIGHT = 96;
const HEADER_HEIGHT = 28;

export function Timeline({ engine }: Props) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const clips = useProjectStore((s) => s.project.clips);
  const pxPerSec = useProjectStore((s) => s.project.pxPerSec);
  const setPxPerSec = useProjectStore((s) => s.setPxPerSec);
  const position = useProjectStore((s) => s.transport.position);
  const loop = useProjectStore((s) => s.project.loop);
  const setLoop = useProjectStore((s) => s.setLoop);
  const addClip = useProjectStore((s) => s.addClip);
  const addTrack = useProjectStore((s) => s.addTrack);
  const assets = useProjectStore((s) => s.assets);
  const selectedClipId = useProjectStore((s) => s.project.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const splitClip = useProjectStore((s) => s.splitClip);
  const removeClip = useProjectStore((s) => s.removeClip);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1000);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const totalDuration = Math.max(
    60,
    ...clips.map((c) => c.start + c.duration + 8),
  );
  const contentWidth = Math.max(viewportWidth, totalDuration * pxPerSec);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setPxPerSec(pxPerSec * factor);
    }
  };

  const rulerClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (viewportRef.current?.scrollLeft ?? 0);
    engine.seek(x / pxPerSec);
  };

  const [loopDrag, setLoopDrag] = useState<{ startT: number } | null>(null);
  const rulerMouseDown = (e: React.MouseEvent) => {
    if (!e.shiftKey) {
      rulerClick(e);
      return;
    }
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (viewportRef.current?.scrollLeft ?? 0);
    const t = x / pxPerSec;
    setLoopDrag({ startT: t });
    setLoop({ enabled: true, start: t, end: t });
  };

  useEffect(() => {
    if (!loopDrag) return;
    const onMove = (e: MouseEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x =
        e.clientX - rect.left + (viewportRef.current?.scrollLeft ?? 0);
      const t = x / pxPerSec;
      const a = Math.min(loopDrag.startT, t);
      const b = Math.max(loopDrag.startT, t);
      setLoop({ start: Math.max(0, a), end: Math.max(a + 0.05, b) });
    };
    const onUp = () => setLoopDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [loopDrag, pxPerSec, setLoop]);

  const handleDropOnTrack = useCallback(
    (e: React.DragEvent, trackId: ID) => {
      e.preventDefault();
      const assetId = e.dataTransfer.getData("application/x-postdaw-asset");
      if (!assetId) return;
      const asset = assets[assetId];
      if (!asset) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const start = Math.max(0, x / pxPerSec);
      addClip({
        trackId,
        assetId,
        start,
        offset: 0,
        duration: asset.duration,
        gainDb: 0,
        name: asset.name,
      });
    },
    [assets, pxPerSec, addClip],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (!selectedClipId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeClip(selectedClipId);
      } else if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        splitClip(selectedClipId, position);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedClipId, removeClip, splitClip, position]);

  return (
    <div className="flex-1 flex flex-col min-w-0" onWheel={onWheel}>
      <div className="flex items-center px-3 py-1 border-b border-edge bg-panel text-xs text-neutral-400 gap-3">
        <span>Zoom:</span>
        <input
          type="range"
          min={10}
          max={400}
          step={1}
          value={pxPerSec}
          onChange={(e) => setPxPerSec(Number(e.target.value))}
          className="w-48"
        />
        <span className="tabular-nums">{pxPerSec.toFixed(0)} px/s</span>
        <span className="ml-4">Playhead: {formatTime(position)}</span>
        <span className="ml-auto text-neutral-500">
          Shift+drag ruler = loop region · Ctrl+wheel = zoom · S = split · Del = delete
        </span>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 overflow-auto relative"
        style={{ overscrollBehavior: "contain" }}
      >
        <div style={{ width: contentWidth, position: "relative" }}>
          <div
            onMouseDown={rulerMouseDown}
            className="sticky top-0 z-20 bg-neutral-900 border-b border-edge cursor-pointer select-none"
            style={{ height: HEADER_HEIGHT, width: contentWidth }}
          >
            <RulerTicks
              pxPerSec={pxPerSec}
              duration={contentWidth / pxPerSec}
              height={HEADER_HEIGHT}
            />
            {loop.enabled && (
              <div
                className="absolute top-0 bottom-0 bg-accent/20 border-x border-accent/60 pointer-events-none"
                style={{
                  left: loop.start * pxPerSec,
                  width: (loop.end - loop.start) * pxPerSec,
                }}
              />
            )}
          </div>

          <div className="relative">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-edge"
                style={{ height: TRACK_HEIGHT }}
                onClick={() => selectTrack(track.id)}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes(
                      "application/x-postdaw-asset",
                    )
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={(e) => handleDropOnTrack(e, track.id)}
              >
                <div
                  className="absolute inset-0 opacity-20"
                  style={{ background: gridStripes(pxPerSec) }}
                />
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      trackColor={track.color}
                      pxPerSec={pxPerSec}
                      selected={selectedClipId === c.id}
                      onSelect={() => selectClip(c.id)}
                      heightPx={TRACK_HEIGHT - 4}
                    />
                  ))}
                <div className="absolute left-2 top-1 text-[10px] text-neutral-500 uppercase tracking-wider pointer-events-none">
                  {track.name}
                </div>
              </div>
            ))}

            <div className="p-2">
              <button
                className="text-xs bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded"
                onClick={() => addTrack()}
              >
                + Add track
              </button>
            </div>
          </div>

          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[1px] bg-red-400 z-10"
            style={{ left: position * pxPerSec }}
          />
        </div>
      </div>
    </div>
  );
}

function RulerTicks({
  pxPerSec,
  duration,
  height,
}: {
  pxPerSec: number;
  duration: number;
  height: number;
}) {
  const majorInterval = pickTickInterval(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += majorInterval) ticks.push(t);
  return (
    <>
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 text-[10px] text-neutral-500"
          style={{ left: t * pxPerSec, height }}
        >
          <div
            className="w-[1px] bg-neutral-700 absolute left-0"
            style={{ top: height - 6, height: 6 }}
          />
          <div className="pl-1 leading-none pt-1">{formatSecShort(t)}</div>
        </div>
      ))}
    </>
  );
}

function pickTickInterval(pxPerSec: number): number {
  const desiredPx = 80;
  const seconds = desiredPx / pxPerSec;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300];
  for (const s of steps) if (s >= seconds) return s;
  return 600;
}

function formatSecShort(sec: number): string {
  if (sec < 60) return `${sec.toFixed(sec % 1 === 0 ? 0 : 1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function gridStripes(pxPerSec: number): string {
  const interval = pickTickInterval(pxPerSec);
  const w = interval * pxPerSec;
  return `repeating-linear-gradient(to right, transparent 0 ${w - 1}px, rgba(255,255,255,0.06) ${w - 1}px ${w}px)`;
}

// keep import used (clamp used elsewhere in components only)
void clamp;
