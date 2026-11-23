import type { ArmyStyle } from "./types";

type Pair = { label: string; w: ArmyStyle; b: ArmyStyle };

const mk = (preset: string, body: string, accent: string, cloth: string, glow: string): ArmyStyle => ({
  preset,
  body,
  accent,
  cloth,
  glow,
});

/** Ready-made looks. Each side can pick any preset (its own colour variant) or fully custom colours. */
export const ARMY_PRESETS: Record<string, Pair> = {
  royal: {
    label: "Royal",
    w: mk("royal", "#ebe5d6", "#d4a94e", "#1c2a55", "#ffd27a"),
    b: mk("royal", "#1c1c22", "#9aa1ad", "#4f0f1a", "#ff4a22"),
  },
  classic: {
    label: "Classic ivory & obsidian",
    w: mk("classic", "#ebe5d6", "#cfc6b0", "#e0d8c4", "#ffe2a8"),
    b: mk("classic", "#1c1c22", "#3a3a44", "#24242b", "#ff5a2a"),
  },
  gilded: {
    label: "Gilded",
    w: mk("gilded", "#f3efe6", "#e2b13c", "#f3efe6", "#ffd27a"),
    b: mk("gilded", "#121216", "#d4a94e", "#121216", "#ffb347"),
  },
  verdant: {
    label: "Verdant",
    w: mk("verdant", "#e8e2d2", "#c8a24a", "#1f4a32", "#b6ff9a"),
    b: mk("verdant", "#1a1d1a", "#8c9a86", "#2f4a1c", "#7dff5a"),
  },
  frost: {
    label: "Frost",
    w: mk("frost", "#eef3f8", "#a9c4dd", "#3d6a99", "#9fe3ff"),
    b: mk("frost", "#141a22", "#7f9bb5", "#1b3350", "#4fc3ff"),
  },
  infernal: {
    label: "Infernal",
    w: mk("infernal", "#e9ddcf", "#b87333", "#7a2410", "#ffa040"),
    b: mk("infernal", "#160f0e", "#8a3b22", "#5a1208", "#ff3a10"),
  },
};

export const PRESET_IDS = Object.keys(ARMY_PRESETS);
