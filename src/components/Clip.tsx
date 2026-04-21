import { useEffect, useRef, useState } from "react";
import type { Clip } from "../types";
import { useProjectStore } from "../store/projectStore";
import { Waveform } from "./Waveform";
import clsx from "clsx";

interface Props {
  clip: Clip;
  trackColor: string;
  pxPerSec: number;
  selected: boolean;
  heightPx: number;
  onSelect: () => void;
}

type DragMode = "move" | "left" | "right" | null;

const EDGE_ZONE_PX = 6;

export function ClipView({
  clip,
  trackColor,
  pxPerSec,
  selected,
  heightPx,
  onSelect,
}: Props) {
  const asset = useProjectStore((s) => s.assets[clip.assetId]);
  const tracks = useProjectStore((s) => s.project.tracks);
  const moveClip = useProjectStore((s) => s.moveClip);
  const resizeClipLeft = useProjectStore((s) => s.resizeClipLeft);
  const resizeClipRight = useProjectStore((s) => s.resizeClipRight);

  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    mode: DragMode;
    startX: number;
    startY: number;
    originStart: number;
    originEnd: number;
    originTrackIdx: number;
  } | null>(null);

  const width = Math.max(2, clip.duration * pxPerSec);
  const left = clip.start * pxPerSec;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    const rect = ref.current!.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    let mode: DragMode = "move";
    if (localX < EDGE_ZONE_PX) mode = "left";
    else if (localX > rect.width - EDGE_ZONE_PX) mode = "right";
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const trackIdx = tracks.findIndex((t) => t.id === clip.trackId);
    setDrag({
      mode,
      startX: e.clientX,
      startY: e.clientY,
      originStart: clip.start,
      originEnd: clip.start + clip.duration,
      originTrackIdx: trackIdx,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dySec = dx / pxPerSec;
      if (drag.mode === "move") {
        const dy = e.clientY - drag.startY;
        const trackDelta = Math.round(dy / 96);
        const targetTrackIdx = Math.max(
          0,
          Math.min(tracks.length - 1, drag.originTrackIdx + trackDelta),
        );
        const targetTrack = tracks[targetTrackIdx];
        moveClip(clip.id, drag.originStart + dySec, targetTrack.id);
      } else if (drag.mode === "left") {
        resizeClipLeft(clip.id, drag.originStart + dySec);
      } else if (drag.mode === "right") {
        resizeClipRight(clip.id, drag.originEnd + dySec);
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, pxPerSec, tracks, moveClip, resizeClipLeft, resizeClipRight, clip.id]);

  const cursorStyle: React.CSSProperties = {};
  if (drag?.mode === "left" || drag?.mode === "right") {
    cursorStyle.cursor = "ew-resize";
  } else if (drag?.mode === "move") {
    cursorStyle.cursor = "grabbing";
  }

  return (
    <div
      ref={ref}
      className={clsx(
        "absolute top-1 rounded overflow-hidden shadow-sm",
        "border",
        selected ? "border-white" : "border-black/30",
      )}
      style={{
        left,
        width,
        height: heightPx,
        background: `linear-gradient(180deg, ${hexToRgba(trackColor, 0.85)}, ${hexToRgba(trackColor, 0.55)})`,
        ...cursorStyle,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        const rect = ref.current!.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        if (localX < EDGE_ZONE_PX || localX > rect.width - EDGE_ZONE_PX) {
          (e.currentTarget as HTMLElement).style.cursor = "ew-resize";
        } else {
          (e.currentTarget as HTMLElement).style.cursor = "grab";
        }
      }}
    >
      <div className="absolute inset-x-1 top-0.5 text-[11px] text-white/95 font-medium truncate pointer-events-none">
        {clip.name}
      </div>
      <div className="absolute inset-x-0 top-4 bottom-0 pointer-events-none">
        {asset && (
          <Waveform
            asset={asset}
            offsetSec={clip.offset}
            durationSec={clip.duration}
            pxPerSec={pxPerSec}
            color="rgba(255,255,255,0.85)"
            height={heightPx - 16}
          />
        )}
      </div>
      <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-white/10 hover:bg-white/40" />
      <div className="absolute right-0 top-0 bottom-0 w-[4px] bg-white/10 hover:bg-white/40" />
    </div>
  );
}

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
