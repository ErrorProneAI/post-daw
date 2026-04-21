import { nanoid } from "nanoid";

export const newId = (prefix = "id"): string => `${prefix}_${nanoid(8)}`;

const TRACK_COLORS = [
  "#7c5cff",
  "#00c2a8",
  "#f06292",
  "#ffb300",
  "#4fc3f7",
  "#ef5350",
  "#9ccc65",
  "#ba68c8",
];

export const pickTrackColor = (idx: number): string =>
  TRACK_COLORS[idx % TRACK_COLORS.length];
