import { useState } from "react";
import { useProjectStore } from "../store/projectStore";
import type { AudioEngine } from "../audio/AudioEngine";
import type { Effect, Track } from "../types";
import { CHAIN_PRESETS } from "../audio/chainPresets";
import {
  loadUserChainPresets,
  saveUserChainPresets,
} from "../store/autosave";
import { newId } from "../utils/id";
import { EffectCard } from "./EffectCard";
import { SpectrumAnalyzer } from "./SpectrumAnalyzer";
import { MeterBar } from "./MeterBar";

interface Props {
  engine: AudioEngine;
}

export function Inspector({ engine }: Props) {
  const selectedClipId = useProjectStore((s) => s.project.selectedClipId);
  const selectedTrackId = useProjectStore((s) => s.project.selectedTrackId);
  const tracks = useProjectStore((s) => s.project.tracks);
  const clips = useProjectStore((s) => s.project.clips);
  const assets = useProjectStore((s) => s.assets);
  const updateClip = useProjectStore((s) => s.updateClip);
  const setClipFade = useProjectStore((s) => s.setClipFade);
  const toggleClipReverse = useProjectStore((s) => s.toggleClipReverse);

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const track =
    tracks.find((t) => t.id === (selectedTrackId ?? clip?.trackId)) ?? null;

  return (
    <aside className="w-full">
      <Section title="Clip">
        {clip ? (
          <div className="space-y-2 text-xs">
            <Row label="Name">
              <input
                className="w-full bg-neutral-900 border border-edge rounded px-2 py-1"
                value={clip.name}
                onChange={(e) => updateClip(clip.id, { name: e.target.value })}
              />
            </Row>
            <Row label="Start">{clip.start.toFixed(3)}s</Row>
            <Row label="Duration">{clip.duration.toFixed(3)}s</Row>
            <Row label="Asset offset">{clip.offset.toFixed(3)}s</Row>
            <Row label="Asset">{assets[clip.assetId]?.name ?? "—"}</Row>
            <Row label="Clip gain">
              <SliderWithValue
                min={-24}
                max={12}
                step={0.1}
                value={clip.gainDb}
                suffix=" dB"
                onChange={(v) => updateClip(clip.id, { gainDb: v })}
              />
            </Row>
            <Row label="Fade in">
              <SliderWithValue
                min={0}
                max={Math.max(0.01, clip.duration / 2)}
                step={0.01}
                value={clip.fadeInSec}
                suffix=" s"
                onChange={(v) => setClipFade(clip.id, v, undefined)}
              />
            </Row>
            <Row label="Fade out">
              <SliderWithValue
                min={0}
                max={Math.max(0.01, clip.duration / 2)}
                step={0.01}
                value={clip.fadeOutSec}
                suffix=" s"
                onChange={(v) => setClipFade(clip.id, undefined, v)}
              />
            </Row>
            <Row label="Reverse">
              <button
                className={
                  "px-2 py-0.5 rounded border text-[11px] " +
                  (clip.reversed
                    ? "border-cyan-500 text-cyan-300 bg-cyan-950"
                    : "border-edge text-neutral-300 bg-neutral-900")
                }
                onClick={() => {
                  toggleClipReverse(clip.id);
                  engine.rescheduleIfPlaying();
                }}
              >
                {clip.reversed ? "Reversed" : "Normal"}
              </button>
            </Row>
          </div>
        ) : (
          <div className="text-xs text-neutral-500">No clip selected.</div>
        )}
      </Section>

      <Section title="Track">
        {track ? (
          <TrackSection engine={engine} track={track} />
        ) : (
          <div className="text-xs text-neutral-500">No track selected.</div>
        )}
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3 border-b border-edge">
      <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <div className="text-neutral-400">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function SliderWithValue({
  min,
  max,
  step,
  value,
  suffix = "",
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <div className="text-[10px] text-neutral-500 tabular-nums w-14 text-right">
        {value.toFixed(2)}
        {suffix}
      </div>
    </div>
  );
}

function TrackSection({
  engine,
  track,
}: {
  engine: AudioEngine;
  track: Track;
}) {
  const updateEffect = useProjectStore((s) => s.updateEffect);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const moveEffect = useProjectStore((s) => s.moveEffect);
  const setTrackEffects = useProjectStore((s) => s.setTrackEffects);
  const toggleAbSlot = useProjectStore((s) => s.toggleAbSlot);
  const copyAtoB = useProjectStore((s) => s.copyAtoB);
  const applyChainPresetToTrack = useProjectStore(
    (s) => s.applyChainPresetToTrack,
  );

  const [presetName, setPresetName] = useState("");
  const [userPresets, setUserPresets] = useState(() => loadUserChainPresets());

  const patch = (effectId: string, p: Partial<Effect>) => {
    updateEffect(track.id, effectId, p);
    engine.rescheduleIfPlaying();
  };

  const trackAnalyzer = () => engine.getTrackAnalyzer(track.id);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <SpectrumAnalyzer getAnalyzer={trackAnalyzer} height={50} />
        <MeterBar getAnalyzer={trackAnalyzer} height={14} showText={false} />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <div className="text-neutral-400">A/B</div>
        <button
          className={
            "px-2 py-0.5 rounded border text-[11px] " +
            (track.abSlot === "A"
              ? "border-cyan-500 text-cyan-300 bg-cyan-950"
              : "border-edge text-neutral-300 bg-neutral-900")
          }
          onClick={() => {
            toggleAbSlot(track.id);
            engine.rescheduleIfPlaying();
          }}
          title="Swap to alternative chain"
        >
          {track.abSlot}
        </button>
        <button
          className="text-[11px] px-2 py-0.5 rounded border border-edge text-neutral-300 hover:bg-neutral-900"
          onClick={() => copyAtoB(track.id)}
          title="Copy current chain into the other slot"
        >
          Copy → other slot
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <select
          className="bg-neutral-900 border border-edge rounded px-2 py-1 text-[11px]"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            applyChainPresetToTrack(track.id, id as never);
            engine.rescheduleIfPlaying();
            e.target.value = "";
          }}
        >
          <option value="">Quick chain…</option>
          {CHAIN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* User presets save/load */}
      <div className="flex items-center gap-1 text-[11px]">
        <input
          className="flex-1 bg-neutral-900 border border-edge rounded px-2 py-0.5"
          placeholder="Preset name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
        />
        <button
          className="px-2 py-0.5 rounded border border-edge text-neutral-300 hover:bg-neutral-900"
          onClick={() => {
            const name = presetName.trim();
            if (!name) return;
            const next = [
              ...userPresets.filter((p) => p.name !== name),
              { name, effects: track.effects },
            ];
            saveUserChainPresets(next);
            setUserPresets(next);
            setPresetName("");
          }}
        >
          Save
        </button>
        <select
          className="bg-neutral-900 border border-edge rounded px-1 py-0.5 max-w-[100px]"
          defaultValue=""
          onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            const preset = userPresets.find((p) => p.name === name);
            if (!preset) return;
            const fxArr = (preset.effects as Effect[]).map((fx) => ({
              ...fx,
              id: newId("fx"),
            }));
            setTrackEffects(track.id, fxArr);
            engine.rescheduleIfPlaying();
            e.target.value = "";
          }}
        >
          <option value="">Load…</option>
          {userPresets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {track.effects.length === 0 ? (
        <div className="text-xs text-neutral-500">
          No effects. Add one from the sidebar.
        </div>
      ) : (
        <div className="space-y-2">
          {track.effects.map((e, idx) => (
            <EffectCard
              key={e.id}
              effect={e}
              index={idx}
              onMove={(from, to) => {
                moveEffect(track.id, from, to);
                engine.rescheduleIfPlaying();
              }}
              onUpdate={(p) => patch(e.id, p)}
              onRemove={() => {
                removeEffect(track.id, e.id);
                engine.rescheduleIfPlaying();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
