import type {
  CompressorEffect,
  DelayEffect,
  Effect,
  Eq10Effect,
  Eq3Effect,
  GainEffect,
  LimiterEffect,
  PitchEffect,
  ReverbEffect,
  SaturationEffect,
  SpeedEffect,
  WidenerEffect,
} from "../types";
import { Eq10Panel } from "./Eq10Panel";

interface Props {
  effect: Effect;
  index: number;
  onUpdate: (patch: Partial<Effect>) => void;
  onRemove: () => void;
  onMove: (fromIdx: number, toIdx: number) => void;
}

/** Generic effect card used by both per-track and master inspectors. */
export function EffectCard({
  effect,
  index,
  onUpdate,
  onRemove,
  onMove,
}: Props) {
  return (
    <div
      className="rounded border border-edge bg-neutral-900 p-2 text-xs"
      draggable
      onDragStart={(ev) => ev.dataTransfer.setData("text/plain", String(index))}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes("text/plain")) ev.preventDefault();
      }}
      onDrop={(ev) => {
        const from = Number(ev.dataTransfer.getData("text/plain"));
        if (!isNaN(from) && from !== index) onMove(from, index);
      }}
    >
      <div className="flex items-center gap-2">
        <div className="font-medium uppercase tracking-wider text-[10px] text-neutral-300">
          {effect.kind}
        </div>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-neutral-400">
          <input
            type="checkbox"
            checked={effect.enabled}
            onChange={(ev) => onUpdate({ enabled: ev.target.checked })}
          />
          on
        </label>
        <button
          className="text-[12px] text-neutral-500 hover:text-red-400 leading-none"
          onClick={onRemove}
          title="Remove"
        >
          ×
        </button>
      </div>
      <EffectControls effect={effect} onChange={onUpdate} />
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
    case "eq10":
      return (
        <div className="mt-2">
          <Eq10Panel
            effect={effect as Eq10Effect}
            onChange={(p) => onChange(p as Partial<Effect>)}
          />
        </div>
      );
    case "reverb":
      return <ReverbControls e={effect} onChange={onChange} />;
    case "delay":
      return <DelayControls e={effect} onChange={onChange} />;
    case "speed":
      return <SpeedControls e={effect} onChange={onChange} />;
    case "pitch":
      return <PitchControls e={effect} onChange={onChange} />;
    case "compressor":
      return <CompressorControls e={effect} onChange={onChange} />;
    case "limiter":
      return <LimiterControls e={effect} onChange={onChange} />;
    case "saturation":
      return <SaturationControls e={effect} onChange={onChange} />;
    case "widener":
      return <WidenerControls e={effect} onChange={onChange} />;
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
    <div className="grid grid-cols-[80px_1fr_46px] items-center gap-2 mt-1 text-[11px]">
      <div className="text-neutral-400">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="text-neutral-500 tabular-nums text-right">
        {value.toFixed(2)}
        {suffix ?? ""}
      </div>
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

function CompressorControls({
  e,
  onChange,
}: {
  e: CompressorEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <>
      <SliderRow
        label="Threshold"
        min={-60}
        max={0}
        step={0.5}
        value={e.thresholdDb}
        suffix=" dB"
        onChange={(v) => onChange({ thresholdDb: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Ratio"
        min={1}
        max={20}
        step={0.1}
        value={e.ratio}
        suffix=":1"
        onChange={(v) => onChange({ ratio: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Attack"
        min={0}
        max={1000}
        step={1}
        value={e.attackMs}
        suffix=" ms"
        onChange={(v) => onChange({ attackMs: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Release"
        min={1}
        max={1000}
        step={1}
        value={e.releaseMs}
        suffix=" ms"
        onChange={(v) => onChange({ releaseMs: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Knee"
        min={0}
        max={40}
        step={0.5}
        value={e.kneeDb}
        suffix=" dB"
        onChange={(v) => onChange({ kneeDb: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Makeup"
        min={-12}
        max={24}
        step={0.5}
        value={e.makeupDb}
        suffix=" dB"
        onChange={(v) => onChange({ makeupDb: v } as Partial<Effect>)}
      />
    </>
  );
}

function LimiterControls({
  e,
  onChange,
}: {
  e: LimiterEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <>
      <SliderRow
        label="Ceiling"
        min={-24}
        max={0}
        step={0.1}
        value={e.ceilingDb}
        suffix=" dB"
        onChange={(v) => onChange({ ceilingDb: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Release"
        min={1}
        max={500}
        step={1}
        value={e.releaseMs}
        suffix=" ms"
        onChange={(v) => onChange({ releaseMs: v } as Partial<Effect>)}
      />
    </>
  );
}

function SaturationControls({
  e,
  onChange,
}: {
  e: SaturationEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 text-[11px] mt-1">
        <div className="text-neutral-400 w-20">Mode</div>
        <select
          value={e.mode}
          className="bg-neutral-900 border border-edge rounded px-1 py-0.5"
          onChange={(ev) =>
            onChange({ mode: ev.target.value as "soft" | "hard" } as Partial<Effect>)
          }
        >
          <option value="soft">Soft (tanh)</option>
          <option value="hard">Hard clip</option>
        </select>
      </div>
      <SliderRow
        label="Drive"
        min={0}
        max={1}
        step={0.01}
        value={e.drive}
        onChange={(v) => onChange({ drive: v } as Partial<Effect>)}
      />
      <SliderRow
        label="Tone"
        min={500}
        max={18000}
        step={50}
        value={e.toneHz}
        suffix=" Hz"
        onChange={(v) => onChange({ toneHz: v } as Partial<Effect>)}
      />
      <WetRow value={e.wet} onChange={(v) => onChange({ wet: v } as Partial<Effect>)} />
    </>
  );
}

function WidenerControls({
  e,
  onChange,
}: {
  e: WidenerEffect;
  onChange: (p: Partial<Effect>) => void;
}) {
  return (
    <SliderRow
      label="Width"
      min={0}
      max={2}
      step={0.01}
      value={e.width}
      onChange={(v) => onChange({ width: v } as Partial<Effect>)}
    />
  );
}
