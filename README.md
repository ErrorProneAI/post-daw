# post-daw

A prototype web-based post-DAW audio workstation. Load audio files, arrange clips on a multi-track timeline, apply an effect chain per track, then export a mixdown to WAV.

## Stack

- React 18 + TypeScript
- Zustand (state + undo/redo history)
- Tailwind CSS
- Web Audio API (real-time + OfflineAudioContext for export)
- Vite

## Architecture

| Module | Location | Responsibility |
|---|---|---|
| **Audio Engine** | `src/audio/AudioEngine.ts` | Transport (play/pause/stop/seek), clip scheduling, solo/mute logic, loop region, playhead tick via `requestAnimationFrame`. |
| **Effects Engine** | `src/audio/effects.ts` | Compiles an ordered `Effect[]` into a wired Web Audio graph with dry/wet, bypass, and chaining. Speed/pitch contribute a playback-rate multiplier. |
| **Track System** | `src/types.ts`, `src/store/projectStore.ts` | Tracks own effect chains, volume, pan, mute, solo. Clips belong to tracks and reference `AudioAsset`s (decoded audio + precomputed peaks). |
| **Timeline** | `src/components/Timeline.tsx` | Pan/zoom (Ctrl+wheel), grid, loop region (Shift-drag ruler), clip drag/trim/split, drag&drop from sidebar. |
| **State Management** | `src/store/projectStore.ts`, `src/store/history.ts` | Zustand store. Every semantic edit is wrapped in a history snapshot; transport/zoom/selection are non-history patches. Undo/redo in `Ctrl+Z` / `Ctrl+Y`. |
| **Renderer** | `src/audio/Renderer.ts`, `src/utils/wav.ts` | Offline render of the whole project via `OfflineAudioContext`, then PCM16 WAV encoding. |
| **Waveform** | `src/audio/waveform.ts`, `src/components/Waveform.tsx` | Precompute min/max peaks at 200 Hz on import; canvas render scaled to current zoom. |

### Signal flow per track

```
clip source ──▶ clipGain ──▶ [effect₁ ──▶ effect₂ ──▶ … effectₙ] ──▶ trackVolume ──▶ pan ──▶ master
```

`speed` and `pitch` effects don't insert a node; they multiply the `BufferSourceNode.playbackRate` at schedule time, so the position is preserved under rate changes. (Pitch is implemented as naive rate-based pitch-shift in this prototype — dedicated pitch-shift without time-stretch would require a worklet or a library like SoundTouch.)

## Keyboard shortcuts

- `Space` — play/pause
- `Home` — rewind to 0
- `Ctrl/Cmd+Z` — undo
- `Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z` — redo
- `S` — split selected clip at playhead
- `Del` / `Backspace` — delete selected clip
- `Ctrl + mouse wheel` — zoom timeline
- `Shift + drag` on ruler — set loop region

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
npm run typecheck
npm run lint
npm run build
```

Drag audio files (WAV / MP3 / OGG / FLAC / M4A) into the left sidebar, then drag clips onto a track. Effects are added per-track from the sidebar effect catalog; parameters live in the right-side Inspector. Export WAV from the transport bar.

## What's a prototype

- MP3 export is not wired (would require `lamejs` or similar). WAV 16-bit is implemented.
- Pitch shift is naive (rate-based). Real pitch-shift needs an AudioWorklet + phase vocoder.
- No project save/load to disk yet — state lives in memory for a session.
- No clip crossfades, automation lanes, or MIDI.
