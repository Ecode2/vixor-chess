import type { Square } from "chess.js";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const SQUARE_SIZE = 1;
/** Height of the board's playing surface. */
export const BOARD_TOP = 0;

export function squareToXZ(sq: Square): [number, number] {
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  // White sits at +z, black at -z. a-file on the left from white's view.
  return [(f - 3.5) * SQUARE_SIZE, (3.5 - r) * SQUARE_SIZE];
}

export function xzToSquare(x: number, z: number): Square | null {
  const f = Math.floor(x / SQUARE_SIZE + 4);
  const r = Math.floor(4 - z / SQUARE_SIZE);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return `${FILES[f]}${r + 1}` as Square;
}

export function isLightSquare(sq: Square): boolean {
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  return (f + r) % 2 === 1;
}

/** Yaw (rotation about Y) for a model whose forward is +Z to face direction (dx,dz). */
export function yawTowards(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function homeYaw(color: "w" | "b"): number {
  return color === "w" ? Math.PI : 0;
}
