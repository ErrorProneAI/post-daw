import { create } from "zustand";
import type {
  AppState,
  AudioAsset,
  Clip,
  Effect,
  EffectKind,
  ExportSettings,
  ID,
  MasterBus,
  ProjectState,
  Track,
} from "../types";
import { newId, pickTrackColor } from "../utils/id";
import { clamp } from "../utils/format";
import {
  HistoryState,
  initialHistory,
  pushHistory,
  redo,
  undo,
} from "./history";
import { makeDefaultEq10Bands } from "../audio/eqPresets";
import { CHAIN_PRESETS, type ChainPresetId } from "../audio/chainPresets";

function makeTrack(idx: number, name?: string): Track {
  return {
    id: newId("trk"),
    name: name ?? `Track ${idx + 1}`,
    color: pickTrackColor(idx),
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    effects: [],
    abSlot: "A",
    abEffectsB: null,
  };
}

function defaultMaster(): MasterBus {
  return { volumeDb: 0, effects: [] };
}

function defaultExportSettings(): ExportSettings {
  return {
    format: "wav",
    sampleRate: 44100,
    bitDepth: 16,
    mp3Kbps: 192,
    normalize: false,
    normalizeTargetDb: -1,
    stems: false,
  };
}

function defaultProject(): ProjectState {
  return {
    name: "Untitled",
    sampleRate: 44100,
    tempoBpm: 120,
    tracks: [makeTrack(0), makeTrack(1)],
    clips: [],
    master: defaultMaster(),
    loop: { enabled: false, start: 0, end: 8 },
    pxPerSec: 100,
    selectedClipId: null,
    selectedTrackId: null,
    selectedEffectId: null,
    exportSettings: defaultExportSettings(),
  };
}

export function defaultEffect(kind: EffectKind): Effect {
  switch (kind) {
    case "gain":
      return { id: newId("fx"), kind, enabled: true, wet: 1, gainDb: 0 };
    case "eq3":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 1,
        lowGainDb: 0,
        midGainDb: 0,
        highGainDb: 0,
        lowFreq: 320,
        highFreq: 3200,
      };
    case "eq10":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 1,
        bands: makeDefaultEq10Bands(),
      };
    case "reverb":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 0.3,
        decaySec: 2.0,
        preDelayMs: 20,
      };
    case "delay":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 0.35,
        timeSec: 0.35,
        feedback: 0.35,
      };
    case "speed":
      return { id: newId("fx"), kind, enabled: true, wet: 1, rate: 1 };
    case "pitch":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 1,
        semitones: 0,
      };
    case "compressor":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 1,
        thresholdDb: -18,
        ratio: 3,
        attackMs: 10,
        releaseMs: 120,
        kneeDb: 12,
        makeupDb: 0,
      };
    case "limiter":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 1,
        ceilingDb: -1,
        releaseMs: 50,
      };
    case "saturation":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 0.6,
        drive: 0.3,
        mode: "soft",
        toneHz: 8000,
      };
    case "widener":
      return {
        id: newId("fx"),
        kind,
        enabled: true,
        wet: 1,
        width: 1.0,
      };
  }
}

export const EFFECT_CATALOG: { kind: EffectKind; label: string }[] = [
  { kind: "gain", label: "Gain" },
  { kind: "eq3", label: "EQ (3-band)" },
  { kind: "eq10", label: "EQ (10-band)" },
  { kind: "compressor", label: "Compressor" },
  { kind: "limiter", label: "Limiter" },
  { kind: "saturation", label: "Saturation" },
  { kind: "widener", label: "Stereo Widener" },
  { kind: "reverb", label: "Reverb" },
  { kind: "delay", label: "Delay" },
  { kind: "speed", label: "Speed" },
  { kind: "pitch", label: "Pitch" },
];

/** Clone an effect array assigning fresh IDs. */
function cloneEffects(effects: Effect[]): Effect[] {
  return effects.map((e) => ({ ...e, id: newId("fx") }));
}

interface StoreActions {
  // Project
  setProjectName(name: string): void;
  setPxPerSec(v: number): void;
  setLoop(loop: Partial<ProjectState["loop"]>): void;
  setExportSettings(patch: Partial<ExportSettings>): void;

  // Assets
  addAsset(asset: AudioAsset): void;
  removeAsset(id: ID): void;

  // Tracks
  addTrack(): void;
  removeTrack(id: ID): void;
  updateTrack(id: ID, patch: Partial<Track>): void;
  setSoloExclusive(id: ID): void;

  // Clips
  addClip(patch: Omit<Clip, "id" | "fadeInSec" | "fadeOutSec" | "reversed"> & Partial<Pick<Clip, "fadeInSec" | "fadeOutSec" | "reversed">>): ID;
  removeClip(id: ID): void;
  updateClip(id: ID, patch: Partial<Clip>): void;
  moveClip(id: ID, newStart: number, newTrackId?: ID): void;
  resizeClipLeft(id: ID, newStart: number): void;
  resizeClipRight(id: ID, newEnd: number): void;
  splitClip(id: ID, atSeconds: number): void;
  setClipFade(id: ID, fadeInSec?: number, fadeOutSec?: number): void;
  toggleClipReverse(id: ID): void;

  // Effects (track)
  addEffect(trackId: ID, kind: EffectKind): void;
  removeEffect(trackId: ID, effectId: ID): void;
  updateEffect(trackId: ID, effectId: ID, patch: Partial<Effect>): void;
  moveEffect(trackId: ID, fromIdx: number, toIdx: number): void;
  setTrackEffects(trackId: ID, effects: Effect[]): void;

  // Effects (master)
  addMasterEffect(kind: EffectKind): void;
  removeMasterEffect(effectId: ID): void;
  updateMasterEffect(effectId: ID, patch: Partial<Effect>): void;
  moveMasterEffect(fromIdx: number, toIdx: number): void;
  setMasterVolumeDb(db: number): void;

  // A/B
  toggleAbSlot(trackId: ID): void;
  copyAtoB(trackId: ID): void;

  // Quick chain
  applyChainPresetToTrack(trackId: ID, presetId: ChainPresetId): void;

  // Selection
  selectClip(id: ID | null): void;
  selectTrack(id: ID | null): void;
  selectEffect(id: ID | null): void;

  // Transport
  setPosition(pos: number): void;
  setPlaying(p: boolean): void;

  // Export
  setExportState(inProgress: boolean, progress: number, statusText?: string): void;

  // UI
  setShowShortcuts(v: boolean): void;
  setShowExportModal(v: boolean): void;
  setShowAssistant(v: boolean): void;

  // History
  undo(): void;
  redo(): void;
  /** Replace the entire project (autosave restore). Does not record history. */
  hydrateProject(p: ProjectState): void;
}

type Store = AppState & {
  _history: HistoryState;
} & StoreActions;

export const useProjectStore = create<Store>((set, get) => {
  /** Mutate project with history snapshot. */
  const withHistory = (
    mutator: (p: ProjectState) => ProjectState,
  ) => {
    set((s) => {
      const prev = s.project;
      const next = mutator(prev);
      if (next === prev) return s;
      return {
        _history: pushHistory(s._history, prev),
        project: next,
      };
    });
  };

  /** Patch project without recording history (UI-only state, transport, zoom). */
  const patchProject = (
    mutator: (p: ProjectState) => ProjectState,
  ) => {
    set((s) => ({ project: mutator(s.project) }));
  };

  return {
    project: defaultProject(),
    assets: {},
    transport: { playing: false, position: 0 },
    export: { inProgress: false, progress: 0, statusText: "" },
    ui: {
      showShortcuts: false,
      showExportModal: false,
      showAssistant: false,
    },
    _history: initialHistory,

    setProjectName: (name) => withHistory((p) => ({ ...p, name })),
    setPxPerSec: (v) =>
      patchProject((p) => ({ ...p, pxPerSec: clamp(v, 10, 800) })),
    setLoop: (loop) =>
      withHistory((p) => ({ ...p, loop: { ...p.loop, ...loop } })),
    setExportSettings: (patch) =>
      patchProject((p) => ({
        ...p,
        exportSettings: { ...p.exportSettings, ...patch },
      })),

    addAsset: (asset) => set((s) => ({ assets: { ...s.assets, [asset.id]: asset } })),
    removeAsset: (id) =>
      set((s) => {
        const a = { ...s.assets };
        delete a[id];
        return { assets: a };
      }),

    addTrack: () =>
      withHistory((p) => ({
        ...p,
        tracks: [...p.tracks, makeTrack(p.tracks.length)],
      })),
    removeTrack: (id) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.filter((t) => t.id !== id),
        clips: p.clips.filter((c) => c.trackId !== id),
        selectedTrackId: p.selectedTrackId === id ? null : p.selectedTrackId,
      })),
    updateTrack: (id, patch) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    setSoloExclusive: (id) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t, solo: t.id === id ? !t.solo : false })),
      })),

    addClip: (patch) => {
      const id = newId("clp");
      withHistory((p) => ({
        ...p,
        clips: [
          ...p.clips,
          {
            fadeInSec: 0,
            fadeOutSec: 0,
            reversed: false,
            ...patch,
            id,
          },
        ],
        selectedClipId: id,
      }));
      return id;
    },
    removeClip: (id) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.filter((c) => c.id !== id),
        selectedClipId: p.selectedClipId === id ? null : p.selectedClipId,
      })),
    updateClip: (id, patch) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    moveClip: (id, newStart, newTrackId) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === id
            ? {
                ...c,
                start: Math.max(0, newStart),
                trackId: newTrackId ?? c.trackId,
              }
            : c,
        ),
      })),
    resizeClipLeft: (id, newStart) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (c.id !== id) return c;
          const originalStart = c.start;
          const originalEnd = c.start + c.duration;
          const clamped = clamp(newStart, originalStart - c.offset, originalEnd - 0.05);
          const delta = clamped - originalStart;
          return {
            ...c,
            start: clamped,
            offset: Math.max(0, c.offset + delta),
            duration: Math.max(0.05, c.duration - delta),
          };
        }),
      })),
    resizeClipRight: (id, newEnd) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (c.id !== id) return c;
          const newDur = Math.max(0.05, newEnd - c.start);
          return { ...c, duration: newDur };
        }),
      })),
    splitClip: (id, atSeconds) =>
      withHistory((p) => {
        const clip = p.clips.find((c) => c.id === id);
        if (!clip) return p;
        const localT = atSeconds - clip.start;
        if (localT <= 0.02 || localT >= clip.duration - 0.02) return p;
        const left: Clip = { ...clip, duration: localT, fadeOutSec: 0 };
        const right: Clip = {
          ...clip,
          id: newId("clp"),
          start: clip.start + localT,
          offset: clip.offset + localT,
          duration: clip.duration - localT,
          fadeInSec: 0,
        };
        return {
          ...p,
          clips: [...p.clips.filter((c) => c.id !== id), left, right],
        };
      }),
    setClipFade: (id, fadeInSec, fadeOutSec) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (c.id !== id) return c;
          const next = { ...c };
          if (fadeInSec !== undefined) next.fadeInSec = Math.max(0, fadeInSec);
          if (fadeOutSec !== undefined) next.fadeOutSec = Math.max(0, fadeOutSec);
          // Cap fades to clip duration.
          const total = next.fadeInSec + next.fadeOutSec;
          if (total > next.duration) {
            const k = next.duration / total;
            next.fadeInSec *= k;
            next.fadeOutSec *= k;
          }
          return next;
        }),
      })),
    toggleClipReverse: (id) =>
      withHistory((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === id ? { ...c, reversed: !c.reversed } : c,
        ),
      })),

    addEffect: (trackId, kind) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId
            ? { ...t, effects: [...t.effects, defaultEffect(kind)] }
            : t,
        ),
      })),
    removeEffect: (trackId, effectId) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId
            ? { ...t, effects: t.effects.filter((e) => e.id !== effectId) }
            : t,
        ),
      })),
    updateEffect: (trackId, effectId, patch) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                effects: t.effects.map((e) =>
                  e.id === effectId ? ({ ...e, ...patch } as Effect) : e,
                ),
              }
            : t,
        ),
      })),
    moveEffect: (trackId, fromIdx, toIdx) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const arr = [...t.effects];
          const [moved] = arr.splice(fromIdx, 1);
          arr.splice(toIdx, 0, moved);
          return { ...t, effects: arr };
        }),
      })),
    setTrackEffects: (trackId, effects) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, effects } : t,
        ),
      })),

    addMasterEffect: (kind) =>
      withHistory((p) => ({
        ...p,
        master: { ...p.master, effects: [...p.master.effects, defaultEffect(kind)] },
      })),
    removeMasterEffect: (effectId) =>
      withHistory((p) => ({
        ...p,
        master: {
          ...p.master,
          effects: p.master.effects.filter((e) => e.id !== effectId),
        },
      })),
    updateMasterEffect: (effectId, patch) =>
      withHistory((p) => ({
        ...p,
        master: {
          ...p.master,
          effects: p.master.effects.map((e) =>
            e.id === effectId ? ({ ...e, ...patch } as Effect) : e,
          ),
        },
      })),
    moveMasterEffect: (fromIdx, toIdx) =>
      withHistory((p) => {
        const arr = [...p.master.effects];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        return { ...p, master: { ...p.master, effects: arr } };
      }),
    setMasterVolumeDb: (db) =>
      withHistory((p) => ({
        ...p,
        master: { ...p.master, volumeDb: clamp(db, -60, 12) },
      })),

    toggleAbSlot: (trackId) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== trackId) return t;
          // Swap current effects with abEffectsB.
          const nextSlot = t.abSlot === "A" ? "B" : "A";
          const otherEffects = t.abEffectsB ?? [];
          return {
            ...t,
            abSlot: nextSlot,
            effects: cloneEffects(otherEffects),
            abEffectsB: cloneEffects(t.effects),
          };
        }),
      })),
    copyAtoB: (trackId) =>
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, abEffectsB: cloneEffects(t.effects) } : t,
        ),
      })),

    applyChainPresetToTrack: (trackId, presetId) =>
      withHistory((p) => {
        const preset = CHAIN_PRESETS.find((x) => x.id === presetId);
        if (!preset) return p;
        return {
          ...p,
          tracks: p.tracks.map((t) =>
            t.id === trackId ? { ...t, effects: preset.build() } : t,
          ),
        };
      }),

    selectClip: (id) => patchProject((p) => ({ ...p, selectedClipId: id })),
    selectTrack: (id) => patchProject((p) => ({ ...p, selectedTrackId: id })),
    selectEffect: (id) => patchProject((p) => ({ ...p, selectedEffectId: id })),

    setPosition: (pos) => set((s) => ({ transport: { ...s.transport, position: pos } })),
    setPlaying: (p) => set((s) => ({ transport: { ...s.transport, playing: p } })),

    setExportState: (inProgress, progress, statusText) =>
      set((s) => ({
        export: {
          inProgress,
          progress,
          statusText: statusText ?? s.export.statusText,
        },
      })),

    setShowShortcuts: (v) => set((s) => ({ ui: { ...s.ui, showShortcuts: v } })),
    setShowExportModal: (v) =>
      set((s) => ({ ui: { ...s.ui, showExportModal: v } })),
    setShowAssistant: (v) => set((s) => ({ ui: { ...s.ui, showAssistant: v } })),

    undo: () => {
      const s = get();
      const r = undo(s._history, s.project);
      if (!r) return;
      set({ _history: r.h, project: r.state });
    },
    redo: () => {
      const s = get();
      const r = redo(s._history, s.project);
      if (!r) return;
      set({ _history: r.h, project: r.state });
    },
    hydrateProject: (project) => set(() => ({ project })),
  };
});
