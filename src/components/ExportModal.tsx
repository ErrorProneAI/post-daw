import { useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { renderProject } from "../audio/Renderer";
import { encodeWav } from "../utils/wav";
import { encodeMp3 } from "../utils/mp3";
import type { ExportSettings } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExportModal({ open, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const transport = useProjectStore((s) => s.transport);
  const settings = useProjectStore((s) => s.project.exportSettings);
  const setExportSettings = useProjectStore((s) => s.setExportSettings);
  const setExportState = useProjectStore((s) => s.setExportState);
  const exportState = useProjectStore((s) => s.export);

  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const update = (patch: Partial<ExportSettings>) => setExportSettings(patch);

  const startExport = async () => {
    setError(null);
    setExportState(true, 0, "Preparing");
    try {
      const stateForRender = { project, assets, transport, export: exportState, ui: { showShortcuts: false, showExportModal: false, showAssistant: false } };
      const onProgress = (p: number, status?: string) =>
        setExportState(true, p, status ?? "");

      if (settings.stems) {
        // Render each track individually with master bypassed.
        const stems = project.tracks;
        for (let i = 0; i < stems.length; i++) {
          const t = stems[i];
          onProgress(i / stems.length, `Rendering stem: ${t.name}`);
          const buf = await renderProject(stateForRender, {
            sampleRate: settings.sampleRate,
            trackIds: [t.id],
            bypassMaster: true,
            normalizeDb: settings.normalize ? settings.normalizeTargetDb : null,
          });
          const blob =
            settings.format === "mp3"
              ? encodeMp3(buf, settings.mp3Kbps)
              : encodeWav(buf, settings.bitDepth);
          download(blob, `${project.name}-${t.name}.${settings.format}`);
        }
      } else {
        const buf = await renderProject(stateForRender, {
          sampleRate: settings.sampleRate,
          normalizeDb: settings.normalize ? settings.normalizeTargetDb : null,
          onProgress,
        });
        const blob =
          settings.format === "mp3"
            ? encodeMp3(buf, settings.mp3Kbps)
            : encodeWav(buf, settings.bitDepth);
        download(blob, `${project.name}.${settings.format}`);
      }
      setExportState(false, 1, "Done");
      onClose();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setExportState(false, 0, "Error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[420px] bg-panel border border-edge rounded p-4 space-y-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <div className="font-medium">Export</div>
          <button
            className="ml-auto text-neutral-500 hover:text-neutral-100"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <Field label="Format">
          <select
            value={settings.format}
            onChange={(e) =>
              update({ format: e.target.value as ExportSettings["format"] })
            }
            className="bg-neutral-900 border border-edge rounded px-2 py-1"
          >
            <option value="wav">WAV (PCM)</option>
            <option value="mp3">MP3 (lamejs)</option>
          </select>
        </Field>

        <Field label="Sample rate">
          <select
            value={settings.sampleRate}
            onChange={(e) =>
              update({
                sampleRate: Number(e.target.value) as ExportSettings["sampleRate"],
              })
            }
            className="bg-neutral-900 border border-edge rounded px-2 py-1"
          >
            <option value={44100}>44.1 kHz</option>
            <option value={48000}>48 kHz</option>
            <option value={88200}>88.2 kHz</option>
            <option value={96000}>96 kHz</option>
          </select>
        </Field>

        {settings.format === "wav" && (
          <Field label="Bit depth">
            <select
              value={settings.bitDepth}
              onChange={(e) =>
                update({
                  bitDepth: Number(e.target.value) as ExportSettings["bitDepth"],
                })
              }
              className="bg-neutral-900 border border-edge rounded px-2 py-1"
            >
              <option value={16}>16-bit</option>
              <option value={24}>24-bit</option>
            </select>
          </Field>
        )}

        {settings.format === "mp3" && (
          <Field label="MP3 bitrate">
            <select
              value={settings.mp3Kbps}
              onChange={(e) => update({ mp3Kbps: Number(e.target.value) })}
              className="bg-neutral-900 border border-edge rounded px-2 py-1"
            >
              <option value={128}>128 kbps</option>
              <option value={192}>192 kbps</option>
              <option value={256}>256 kbps</option>
              <option value={320}>320 kbps</option>
            </select>
          </Field>
        )}

        <Field label="Normalize">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.normalize}
              onChange={(e) => update({ normalize: e.target.checked })}
            />
            <span>Peak normalize to</span>
            <input
              type="number"
              step={0.5}
              min={-12}
              max={0}
              value={settings.normalizeTargetDb}
              onChange={(e) =>
                update({ normalizeTargetDb: Number(e.target.value) })
              }
              className="w-16 bg-neutral-900 border border-edge rounded px-1 py-0.5"
              disabled={!settings.normalize}
            />
            <span>dBTP</span>
          </label>
        </Field>

        <Field label="Stems">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.stems}
              onChange={(e) => update({ stems: e.target.checked })}
            />
            <span className="text-neutral-400 text-xs">
              Render each track separately (master bus bypassed)
            </span>
          </label>
        </Field>

        {exportState.inProgress && (
          <div className="space-y-1">
            <div className="text-xs text-neutral-400">{exportState.statusText}</div>
            <div className="h-2 bg-neutral-900 border border-edge rounded">
              <div
                className="h-full bg-cyan-600 rounded"
                style={{ width: `${Math.max(0, Math.min(1, exportState.progress)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && <div className="text-xs text-red-400">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button
            className="px-3 py-1 rounded border border-edge text-neutral-300 hover:bg-neutral-900"
            onClick={onClose}
            disabled={exportState.inProgress}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50"
            onClick={startExport}
            disabled={exportState.inProgress}
          >
            {exportState.inProgress ? "Rendering…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <div className="text-xs text-neutral-400">{label}</div>
      {children}
    </div>
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
