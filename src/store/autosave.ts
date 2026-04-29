import { useEffect, useRef } from "react";
import type { ProjectState } from "../types";
import { useProjectStore } from "./projectStore";

const KEY = "post-daw:autosave:v1";

/**
 * Serialize/restore the project state in localStorage.
 *
 * Audio assets are NOT persisted (their decoded buffers are too large and
 * the user would need to re-import the source files anyway). We only keep
 * tracks/clips/effects/master/loop/exportSettings. On boot, we hydrate the
 * project but leave the assets dictionary empty — clips referencing missing
 * assets will simply not play until the user re-imports them.
 */
export function serializeProject(p: ProjectState): string {
  return JSON.stringify({ v: 1, project: p });
}

export function deserializeProject(raw: string): ProjectState | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== 1 || !obj.project) return null;
    return obj.project as ProjectState;
  } catch {
    return null;
  }
}

export function loadAutosave(): ProjectState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  return deserializeProject(raw);
}

export function clearAutosave(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

/**
 * Watches the store and writes the project to localStorage with debouncing.
 * Mount once at the App root.
 */
export function useAutosave(debounceMs = 800): void {
  const project = useProjectStore((s) => s.project);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, serializeProject(project));
      } catch {
        // Ignore quota errors; project will save on next change.
      }
    }, debounceMs);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [project, debounceMs]);
}

/** Persist + load named user presets (effect chains) for re-use. */
const CHAIN_PRESETS_KEY = "post-daw:userChainPresets:v1";

export interface UserChainPreset {
  name: string;
  effects: unknown; // Effect[]; serialized
}

export function loadUserChainPresets(): UserChainPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAIN_PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveUserChainPresets(presets: UserChainPreset[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CHAIN_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}
