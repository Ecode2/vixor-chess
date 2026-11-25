"use client";

import { useEffect, useState } from "react";

/**
 * desktop   - wide screens: side panel on the right, toolbar at the bottom
 * portrait  - phones / tablets held upright: bottom sheets + icon toolbar
 * landscape - phones held sideways (short screens): icon rail on the left
 */
export type LayoutMode = "desktop" | "portrait" | "landscape";

export function layoutFor(w: number, h: number): LayoutMode {
  if (h <= 520 && w > h) return "landscape";
  if (w <= 820) return "portrait";
  return "desktop";
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    typeof window === "undefined" ? "desktop" : layoutFor(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const update = () => setMode(layoutFor(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return mode;
}

/** Heights (px) of the HUD chrome per layout, used to frame the 3D view. */
export const HUD_METRICS = {
  portraitTop: 100,
  portraitBottom: 78,
  landscapeRail: 66,
  desktopPanel: 284,
} as const;
