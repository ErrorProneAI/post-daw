export type ID = string;

export type EffectKind =
  | "gain"
  | "eq3"
  | "eq10"
  | "reverb"
  | "delay"
  | "speed"
  | "pitch"
  | "compressor"
  | "limiter"
  | "saturation"
  | "widener";

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

export interface Eq10Band {
  enabled: boolean;
  freq: number;
  gainDb: number;
  q: number;
  /** "lowshelf" | "peaking" | "highshelf" */
  type: BiquadFilterType;
}

export interface Eq10Effect extends EffectBase {
  kind: "eq10";
  bands: Eq10Band[]; // exactly 10
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

export interface CompressorEffect extends EffectBase {
  kind: "compressor";
  thresholdDb: number; // -100..0
  ratio: number; // 1..20
  attackMs: number; // 0..1000
  releaseMs: number; // 0..1000
  kneeDb: number; // 0..40
  makeupDb: number; // -12..+24
}

export interface LimiterEffect extends EffectBase {
  kind: "limiter";
  ceilingDb: number; // -24..0
  releaseMs: number; // 1..500
}

export interface SaturationEffect extends EffectBase {
  kind: "saturation";
  drive: number; // 0..1
  /** "soft" tanh or "hard" clip */
  mode: "soft" | "hard";
  toneHz: number; // 200..16000 lowpass
}

export interface WidenerEffect extends EffectBase {
  kind: "widener";
  width: number; // 0..2 (0=mono, 1=stereo as-is, 2=double-wide)
}

export type Effect =
  | GainEffect
  | Eq3Effect
  | Eq10Effect
  | ReverbEffect
  | DelayEffect
  | SpeedEffect
  | PitchEffect
  | CompressorEffect
  | LimiterEffect
  | SaturationEffect
  | WidenerEffect;

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
  /** Fade in/out length in seconds (0 = none). */
  fadeInSec: number;
  fadeOutSec: number;
  /** Reverse playback (uses a reversed copy of the asset buffer). */
  reversed: boolean;
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
  /** A/B snapshot of effect chain ("A" is current; "B" is alternative). */
  abSlot: "A" | "B";
  abEffectsB: Effect[] | null;
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

export interface MasterBus {
  volumeDb: number;
  effects: Effect[];
}

export type ExportFormat = "wav" | "mp3";
export type ExportBitDepth = 16 | 24;

export interface ExportSettings {
  format: ExportFormat;
  sampleRate: 44100 | 48000 | 88200 | 96000;
  bitDepth: ExportBitDepth;
  mp3Kbps: number; // 96..320
  normalize: boolean;
  /** Target peak in dBTP for normalization. */
  normalizeTargetDb: number;
  /** Render each track as a separate file. */
  stems: boolean;
}

export interface ProjectState {
  name: string;
  sampleRate: number;
  tempoBpm: number;
  tracks: Track[];
  clips: Clip[];
  master: MasterBus;
  loop: LoopRegion;
  /** Pixels per second for timeline rendering. */
  pxPerSec: number;
  /** Selection. */
  selectedClipId: ID | null;
  selectedTrackId: ID | null;
  selectedEffectId: ID | null;
  exportSettings: ExportSettings;
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
    statusText: string;
  };
  ui: {
    showShortcuts: boolean;
    showExportModal: boolean;
    showAssistant: boolean;
  };
}
