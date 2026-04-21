import type { ProjectState } from "../types";

const MAX_HISTORY = 100;

export interface HistoryState {
  past: ProjectState[];
  future: ProjectState[];
}

export const initialHistory: HistoryState = { past: [], future: [] };

/** Push `prev` onto the past stack, clear future. */
export function pushHistory(
  h: HistoryState,
  prev: ProjectState,
): HistoryState {
  const past = [...h.past, prev];
  if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
  return { past, future: [] };
}

export function undo(
  h: HistoryState,
  current: ProjectState,
): { h: HistoryState; state: ProjectState } | null {
  if (h.past.length === 0) return null;
  const prev = h.past[h.past.length - 1];
  return {
    h: { past: h.past.slice(0, -1), future: [current, ...h.future] },
    state: prev,
  };
}

export function redo(
  h: HistoryState,
  current: ProjectState,
): { h: HistoryState; state: ProjectState } | null {
  if (h.future.length === 0) return null;
  const next = h.future[0];
  return {
    h: { past: [...h.past, current], future: h.future.slice(1) },
    state: next,
  };
}
