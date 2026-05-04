import { useState } from "react";
import { useProjectStore } from "../store/projectStore";
import type { AudioEngine } from "../audio/AudioEngine";
import { renderProject } from "../audio/Renderer";
import { bandEnergies } from "../audio/analyzer";
import { suggestFromSpectrum, type AssistantSuggestion } from "../audio/assistant";
import { CHAIN_PRESETS, findChainPreset } from "../audio/chainPresets";
import { EQ10_DEFAULT_FREQS } from "../audio/effects";

interface Props {
  open: boolean;
  onClose: () => void;
  engine: AudioEngine;
}

/**
 * Heuristic AI assistant. Renders the selected track (or master) offline,
 * runs FFT, computes 10-band energies, then maps to a starter chain preset.
 */
export function AssistantPanel({ open, onClose, engine }: Props) {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const transport = useProjectStore((s) => s.transport);
  const exportState = useProjectStore((s) => s.export);
  const ui = useProjectStore((s) => s.ui);
  const applyChainPresetToTrack = useProjectStore(
    (s) => s.applyChainPresetToTrack,
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<AssistantSuggestion | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const selectedTrackId =
    project.selectedTrackId ??
    (project.selectedClipId
      ? project.clips.find((c) => c.id === project.selectedClipId)?.trackId ??
        null
      : null);

  if (!open) return null;

  const analyze = async () => {
    setError(null);
    setSuggestion(null);
    if (!selectedTrackId) {
      setError("Select a track first.");
      return;
    }
    setAnalyzing(true);
    try {
      // Render the selected track in isolation, master bypassed, low SR for speed.
      const buf = await renderProject(
        { project, assets, transport, export: exportState, ui },
        {
          sampleRate: 32000,
          trackIds: [selectedTrackId],
          bypassMaster: true,
        },
      );
      const bandsDb = computeBandEnergiesFromBuffer(buf, EQ10_DEFAULT_FREQS);
      const sug = suggestFromSpectrum(bandsDb);
      setSuggestion(sug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const apply = () => {
    if (!suggestion || !selectedTrackId) return;
    applyChainPresetToTrack(selectedTrackId, suggestion.presetId);
    engine.rescheduleIfPlaying();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[440px] bg-panel border border-edge rounded p-4 space-y-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <div className="font-medium">Assistant</div>
          <button
            className="ml-auto text-neutral-500 hover:text-neutral-100"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="text-xs text-neutral-400">
          Analyzes the selected track and recommends a starter effect chain.
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50"
            disabled={analyzing}
            onClick={analyze}
          >
            {analyzing ? "Analyzing…" : "Analyze track"}
          </button>
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}

        {suggestion && (
          <div className="rounded border border-edge bg-neutral-900 p-2 space-y-1">
            <div className="text-xs">
              Detected mood:{" "}
              <span className="text-cyan-300 uppercase tracking-wider">
                {suggestion.mood}
              </span>
            </div>
            <div className="text-xs text-neutral-400">{suggestion.reason}</div>
            <div className="text-xs">
              Suggested chain:{" "}
              <span className="text-neutral-100">
                {findChainPreset(suggestion.presetId)?.label ?? suggestion.presetId}
              </span>
            </div>
            <button
              className="mt-1 px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-xs"
              onClick={apply}
            >
              Apply chain to track
            </button>
          </div>
        )}

        <div className="border-t border-edge pt-2">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">
            Quick scenarios
          </div>
          <div className="grid grid-cols-2 gap-1">
            {CHAIN_PRESETS.map((p) => (
              <button
                key={p.id}
                className="text-left px-2 py-1 rounded border border-edge hover:bg-neutral-900"
                onClick={() => {
                  if (!selectedTrackId) {
                    setError("Select a track first.");
                    return;
                  }
                  applyChainPresetToTrack(selectedTrackId, p.id);
                  engine.rescheduleIfPlaying();
                  onClose();
                }}
                title={p.description}
              >
                <div className="text-[11px]">{p.label}</div>
                <div className="text-[10px] text-neutral-500">
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compute approximate per-band energies (dBFS) from a rendered AudioBuffer.
 * Uses a lightweight Goertzel-like sweep — cheaper than a full FFT and good
 * enough for a heuristic 10-band classifier.
 */
function computeBandEnergiesFromBuffer(
  buf: AudioBuffer,
  freqs: number[],
): number[] {
  const sr = buf.sampleRate;
  // Mix to mono.
  const N = Math.min(buf.length, sr * 4); // analyze first 4s
  const mono = new Float32Array(N);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < N; i++) mono[i] += data[i];
  }
  const inv = 1 / Math.max(1, buf.numberOfChannels);
  for (let i = 0; i < N; i++) mono[i] *= inv;

  // Use one-octave windows around each center via biquad-shaped band-pass via
  // simple DFT bin sums.  We compute power at the center plus 1/3 octave neighbors.
  const result: number[] = [];
  for (const f0 of freqs) {
    const lo = f0 / 1.122;
    const hi = f0 * 1.122;
    let totalPower = 0;
    let count = 0;
    // We use a fast dft over a sparse grid of frequencies inside the band.
    const samples = Math.max(3, Math.round((hi - lo) / 5));
    for (let s = 0; s < samples; s++) {
      const f = lo + (s / (samples - 1 || 1)) * (hi - lo);
      const w = (2 * Math.PI * f) / sr;
      let re = 0,
        im = 0;
      for (let n = 0; n < N; n++) {
        re += mono[n] * Math.cos(w * n);
        im -= mono[n] * Math.sin(w * n);
      }
      totalPower += (re * re + im * im) / (N * N);
      count++;
    }
    const avgPower = totalPower / Math.max(1, count);
    const db = 10 * Math.log10(Math.max(1e-12, avgPower));
    result.push(db);
  }
  return result;
}

// Reference imports kept to avoid tree-shaking surprises if reused.
void bandEnergies;
