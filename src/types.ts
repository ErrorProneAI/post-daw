export type ID = string;

export type EffectKind =
  | "gain"
  | "eq3"
  | "reverb"
  | "delay"
  | "speed"
  | "pitch";

export interface EffectBase {
  id: ID;
  kind: EffectKind;
  enabled: boolean;
  wet: number; // 0..1
}

export interface GainEffect extends EffectBase {
  kind: "gain";
  gainDb: number; // -60..+12
}

export interface Eq3Effect extends EffectBase {
  kind: "eq3";
  lowGainDb: number;
  midGainDb: number;
  highGainDb: number;
  lowFreq: number;
  highFreq: number;
}

export interface ReverbEffect extends EffectBase {
  kind: "reverb";
  decaySec: number; // 0.2..6
  preDelayMs: number; // 0..100
}

export interface DelayEffect extends EffectBase {
  kind: "delay";
  timeSec: number; // 0..2
  feedback: number; // 0..0.95
}

export interface SpeedEffect extends EffectBase {
  kind: "speed";
  rate: number; // 0.25..4
}

export interface PitchEffect extends EffectBase {
  kind: "pitch";
  semitones: number; // -24..+24, affects speed (simple prototype)
}

export type Effect =
  | GainEffect
  | Eq3Effect
  | ReverbEffect
  | DelayEffect
  | SpeedEffect
  | PitchEffect;

export interface Clip {
  id: ID;
  trackId: ID;
  assetId: ID;
  /** Start time on timeline in seconds */
  start: number;
  /** Offset inside asset (trim from the left) in seconds */
  offset: number;
  /** Duration on the timeline in seconds */
  duration: number;
  gainDb: number;
  name: string;
}

export interface Track {
  id: ID;
  name: string;
  color: string;
  volumeDb: number;
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  effects: Effect[];
}

export interface AudioAsset {
  id: ID;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  /** Kept in-memory only (not serialized in history). */
  buffer: AudioBuffer | null;
  /** Pre-computed peaks for waveform rendering (per channel, min/max pairs). */
  peaks: Float32Array | null;
  peaksPerSecond: number;
}

export interface LoopRegion {
  enabled: boolean;
  start: number;
  end: number;
}

export interface ProjectState {
  name: string;
  sampleRate: number;
  tempoBpm: number;
  tracks: Track[];
  clips: Clip[];
  loop: LoopRegion;
  /** Pixels per second for timeline rendering. */
  pxPerSec: number;
  /** Selection. */
  selectedClipId: ID | null;
  selectedTrackId: ID | null;
  selectedEffectId: ID | null;
}

export interface AppState {
  project: ProjectState;
  assets: Record<ID, AudioAsset>;
  transport: {
    playing: boolean;
    /** Current playhead position in seconds. */
    position: number;
  };
  export: {
    inProgress: boolean;
    progress: number;
  };
}
