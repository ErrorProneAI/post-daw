import { useProjectStore } from "../store/projectStore";
import type {
  DelayEffect,
  Effect,
  Eq3Effect,
  GainEffect,
  PitchEffect,
  ReverbEffect,
  SpeedEffect,
  Track,
} from "../types";
import type { AudioEngine } from "../audio/AudioEngine";

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

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const track =
    tracks.find((t) => t.id === (selectedTrackId ?? clip?.trackId)) ?? null;

  return (
    <aside className="w-72 shrink-0 border-l border-edge bg-panel overflow-y-auto">
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
          </div>
        ) : (
          <div className="text-xs text-neutral-500">No clip selected.</div>
        )}
      </Section>

      <Section title="Track effects">
        {track ? (
          <TrackEffects engine={engine} track={track} />
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

function TrackEffects({ engine, track }: { engine: AudioEngine; track: Track }) {
  const updateEffect = useProjectStore((s) => s.updateEffect);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const moveEffect = useProjectStore((s) => s.moveEffect);

  const patch = (effectId: string, p: Partial<Effect>) => {
    updateEffect(track.id, effectId, p);
    engine.rescheduleIfPlaying();
  };

  if (track.effects.length === 0) {
    return (
      <div className="text-xs text-neutral-500">
        No effects. Add one from the sidebar.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {track.effects.map((e, idx) => (
        <div
          key={e.id}
          className="rounded border border-edge bg-neutral-900 p-2 text-xs"
          draggable
          onDragStart={(ev) => ev.dataTransfer.setData("text/plain", String(idx))}
          onDragOver={(ev) => {
            if (ev.dataTransfer.types.includes("text/plain")) ev.preventDefault();
          }}
          onDrop={(ev) => {
            const from = Number(ev.dataTransfer.getData("text/plain"));
            if (!isNaN(from) && from !== idx) moveEffect(track.id, from, idx);
          }}
        >
          <div className="flex items-center gap-2">
            <div className="font-medium uppercase tracking-wider text-[10px]">
              {e.kind}
            </div>
            <label className="ml-auto flex items-center gap-1 text-[10px] text-neutral-400">
              <input
                type="checkbox"
                checked={e.enabled}
                onChange={(ev) => patch(e.id, { enabled: ev.target.checked })}
              />
              on
            </label>
            <button
              className="text-[10px] text-neutral-500 hover:text-red-400"
              onClick={() => removeEffect(track.id, e.id)}
            >
              ×
            </button>
          </div>
          <EffectControls effect={e} onChange={(p) => patch(e.id, p)} />
        </div>
      ))}
    </div>
  );
}

function EffectControls({
  effect,
  onChange,
}: {
  effect: Effect;
  onChange: (p: Partial<Effect>) => void;
}) {
  switch (effect.kind) {
    case "gain":
      return <GainControls e={effect} onChange={onChange} />;
    case "eq3":
      return <Eq3Controls e={effect} onChange={onChange} />;
    case "reverb":
      return <ReverbControls e={effect} onChange={onChange} />;
    case "delay":
      return <DelayControls e={effect} onChange={onChange} />;
    case "speed":
      return <SpeedControls e={effect} onChange={onChange} />;
    case "pitch":
      return <PitchControls e={effect} onChange={onChange} />;
  }
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[70px_1fr] items-center gap-2 mt-1">
      <div className="text-neutral-400">{label}</div>
      <SliderWithValue
        min={min}
        max={max}
        step={step}
        value={value}
        suffix={suffix}
        onChange={onChange}
      />
    </div>
  );
}

function WetRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <SliderRow
      label="Dry/Wet"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={onChange}
    />
  );
}

function GainControls({
  e,
  onChange,
}: {
  e: GainEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <SliderRow
      label="Gain"
      min={-24}
      max={12}
      step={0.1}
      value={e.gainDb}
      suffix=" dB"
      onChange={(v) => onChange({ gainDb: v } as Partial<Effect>)}
    />
  );
}

function Eq3Controls({
  e,
  onChange,
}: {
  e: Eq3Effect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <>
      <SliderRow
        label="Low"
        min={-18}
        max={18}
        step={0.1}
        value={e.lowGainDb}
        suffix=" dB"
        onChange={(v) => onChange({ lowGainDb: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Mid"
        min={-18}
        max={18}
        step={0.1}
        value={e.midGainDb}
        suffix=" dB"
        onChange={(v) => onChange({ midGainDb: v } as Partial<Effect>)}
      />
      <SliderRow
        label="High"
        min={-18}
        max={18}
        step={0.1}
        value={e.highGainDb}
        suffix=" dB"
        onChange={(v) => onChange({ highGainDb: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Low f"
        min={50}
        max={800}
        step={1}
        value={e.lowFreq}
        suffix=" Hz"
        onChange={(v) => onChange({ lowFreq: v } as Partial<Effect>)}
      />
      <SliderRow
        label="High f"
        min={1500}
        max={12000}
        step={10}
        value={e.highFreq}
        suffix=" Hz"
        onChange={(v) => onChange({ highFreq: v } as Partial<Effect>)}
      />
    </>
  );
}

function ReverbControls({
  e,
  onChange,
}: {
  e: ReverbEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <>
      <SliderRow
        label="Decay"
        min={0.2}
        max={6}
        step={0.1}
        value={e.decaySec}
        suffix=" s"
        onChange={(v) => onChange({ decaySec: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Pre-delay"
        min={0}
        max={100}
        step={1}
        value={e.preDelayMs}
        suffix=" ms"
        onChange={(v) => onChange({ preDelayMs: v } as Partial<Effect>)}
      />
      <WetRow value={e.wet} onChange={(v) => onChange({ wet: v } as Partial<Effect>)} />
    </>
  );
}

function DelayControls({
  e,
  onChange,
}: {
  e: DelayEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <>
      <SliderRow
        label="Time"
        min={0.01}
        max={2}
        step={0.01}
        value={e.timeSec}
        suffix=" s"
        onChange={(v) => onChange({ timeSec: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Feedback"
        min={0}
        max={0.95}
        step={0.01}
        value={e.feedback}
        onChange={(v) => onChange({ feedback: v } as Partial<Effect>)}
      />
      <WetRow value={e.wet} onChange={(v) => onChange({ wet: v } as Partial<Effect>)} />
    </>
  );
}

function SpeedControls({
  e,
  onChange,
}: {
  e: SpeedEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <SliderRow
      label="Rate"
      min={0.25}
      max={4}
      step={0.01}
      value={e.rate}
      suffix="×"
      onChange={(v) => onChange({ rate: v } as Partial<Effect>)}
    />
  );
}

function PitchControls({
  e,
  onChange,
}: {
  e: PitchEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <SliderRow
      label="Semis"
      min={-24}
      max={24}
      step={1}
      value={e.semitones}
      suffix=" st"
      onChange={(v) => onChange({ semitones: v } as Partial<Effect>)}
    />
  );
}
