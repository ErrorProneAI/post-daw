import { create } from "zustand";
import type {
  AppState,
  AudioAsset,
  Clip,
  Effect,
  EffectKind,
  ID,
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
  };
}

function defaultProject(): ProjectState {
  return {
    name: "Untitled",
    sampleRate: 44100,
    tempoBpm: 120,
    tracks: [makeTrack(0), makeTrack(1)],
    clips: [],
    loop: { enabled: false, start: 0, end: 8 },
    pxPerSec: 100,
    selectedClipId: null,
    selectedTrackId: null,
    selectedEffectId: null,
  };
}

function defaultEffect(kind: EffectKind): Effect {
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
  }
}

export const EFFECT_CATALOG: { kind: EffectKind; label: string }[] = [
  { kind: "gain", label: "Gain" },
  { kind: "eq3", label: "EQ (3-band)" },
  { kind: "reverb", label: "Reverb" },
  { kind: "delay", label: "Delay" },
  { kind: "speed", label: "Speed" },
  { kind: "pitch", label: "Pitch" },
];

interface StoreActions {
  // Project
  setProjectName(name: string): void;
  setPxPerSec(v: number): void;
  setLoop(loop: Partial<ProjectState["loop"]>): void;

  // Assets
  addAsset(asset: AudioAsset): void;
  removeAsset(id: ID): void;

  // Tracks
  addTrack(): void;
  removeTrack(id: ID): void;
  updateTrack(id: ID, patch: Partial<Track>): void;
  setSoloExclusive(id: ID): void;

  // Clips
  addClip(patch: Omit<Clip, "id">): ID;
  removeClip(id: ID): void;
  updateClip(id: ID, patch: Partial<Clip>): void;
  moveClip(id: ID, newStart: number, newTrackId?: ID): void;
  resizeClipLeft(id: ID, newStart: number): void;
  resizeClipRight(id: ID, newEnd: number): void;
  splitClip(id: ID, atSeconds: number): void;

  // Effects
  addEffect(trackId: ID, kind: EffectKind): void;
  removeEffect(trackId: ID, effectId: ID): void;
  updateEffect(trackId: ID, effectId: ID, patch: Partial<Effect>): void;
  moveEffect(trackId: ID, fromIdx: number, toIdx: number): void;

  // Selection
  selectClip(id: ID | null): void;
  selectTrack(id: ID | null): void;
  selectEffect(id: ID | null): void;

  // Transport
  setPosition(pos: number): void;
  setPlaying(p: boolean): void;

  // Export
  setExportState(inProgress: boolean, progress: number): void;

  // History
  undo(): void;
  redo(): void;
  _snapshot(): void;
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
    export: { inProgress: false, progress: 0 },
    _history: initialHistory,

    setProjectName: (name) => withHistory((p) => ({ ...p, name })),
    setPxPerSec: (v) =>
      patchProject((p) => ({ ...p, pxPerSec: clamp(v, 10, 800) })),
    setLoop: (loop) =>
      withHistory((p) => ({ ...p, loop: { ...p.loop, ...loop } })),

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
        clips: [...p.clips, { ...patch, id }],
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
        const left: Clip = { ...clip, duration: localT };
        const right: Clip = {
          ...clip,
          id: newId("clp"),
          start: clip.start + localT,
          offset: clip.offset + localT,
          duration: clip.duration - localT,
        };
        return {
          ...p,
          clips: [...p.clips.filter((c) => c.id !== id), left, right],
        };
      }),

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

    selectClip: (id) => patchProject((p) => ({ ...p, selectedClipId: id })),
    selectTrack: (id) => patchProject((p) => ({ ...p, selectedTrackId: id })),
    selectEffect: (id) => patchProject((p) => ({ ...p, selectedEffectId: id })),

    setPosition: (pos) => set((s) => ({ transport: { ...s.transport, position: pos } })),
    setPlaying: (p) => set((s) => ({ transport: { ...s.transport, playing: p } })),

    setExportState: (inProgress, progress) =>
      set(() => ({ export: { inProgress, progress } })),

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
    _snapshot: () => {
      set((s) => ({ _history: pushHistory(s._history, s.project) }));
    },
  };
});
