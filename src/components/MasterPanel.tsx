import { useCallback } from "react";
import { useProjectStore, EFFECT_CATALOG } from "../store/projectStore";
import type { AudioEngine } from "../audio/AudioEngine";
import { MeterBar } from "./MeterBar";
import { SpectrumAnalyzer } from "./SpectrumAnalyzer";
import { EffectCard } from "./EffectCard";

interface Props {
  engine: AudioEngine;
}

/** Master section: spectrum + meter + master effects + master volume. */
export function MasterPanel({ engine }: Props) {
  const master = useProjectStore((s) => s.project.master);
  const addMasterEffect = useProjectStore((s) => s.addMasterEffect);
  const removeMasterEffect = useProjectStore((s) => s.removeMasterEffect);
  const updateMasterEffect = useProjectStore((s) => s.updateMasterEffect);
  const moveMasterEffect = useProjectStore((s) => s.moveMasterEffect);
  const setMasterVolumeDb = useProjectStore((s) => s.setMasterVolumeDb);

  const getMaster = useCallback(
    () => engine.getMasterAnalyzer(),
    [engine],
  );

  return (
    <div className="p-3 space-y-2 border-t border-edge bg-neutral-950">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-neutral-300">
          Master
        </div>
        <select
          className="text-[11px] bg-neutral-900 border border-edge rounded px-2 py-1"
          defaultValue=""
          onChange={(e) => {
            const k = e.target.value;
            if (!k) return;
            addMasterEffect(k as never);
            engine.rescheduleIfPlaying();
            e.target.value = "";
          }}
        >
          <option value="">+ Add master effect…</option>
          {EFFECT_CATALOG.map((ef) => (
            <option key={ef.kind} value={ef.kind}>
              {ef.label}
            </option>
          ))}
        </select>
      </div>

      <SpectrumAnalyzer getAnalyzer={getMaster} height={70} />
      <MeterBar getAnalyzer={getMaster} height={20} />

      <div className="flex items-center gap-2 text-xs">
        <div className="text-neutral-400">Volume</div>
        <input
          type="range"
          min={-60}
          max={12}
          step={0.1}
          value={master.volumeDb}
          onChange={(e) => setMasterVolumeDb(Number(e.target.value))}
          className="flex-1"
        />
        <div className="tabular-nums w-14 text-right text-neutral-400">
          {master.volumeDb.toFixed(1)} dB
        </div>
      </div>

      {master.effects.length > 0 && (
        <div className="space-y-2">
          {master.effects.map((e, idx) => (
            <EffectCard
              key={e.id}
              effect={e}
              index={idx}
              onMove={(from, to) => {
                moveMasterEffect(from, to);
                engine.rescheduleIfPlaying();
              }}
              onUpdate={(patch) => {
                updateMasterEffect(e.id, patch);
                engine.rescheduleIfPlaying();
              }}
              onRemove={() => {
                removeMasterEffect(e.id);
                engine.rescheduleIfPlaying();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
