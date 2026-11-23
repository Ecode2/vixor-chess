import type { Square, PieceSymbol, Color, Move } from "chess.js";

export type { Square, PieceSymbol, Color, Move };

/** A piece "actor" on the board. Ids are stable for the life of a piece so the 3D scene can animate it. */
export interface PieceData {
  id: string;
  kind: PieceSymbol;
  color: Color;
  square: Square;
}

/** "human" or the id of a registered engine (see src/engine/index.ts). */
export type PlayerType = "human" | "random" | "stockfish";

/** Per-side colour scheme for an army. */
export interface ArmyStyle {
  preset: string;
  body: string;
  accent: string;
  cloth: string;
  glow: string;
}

export type GameStatus =
  | { kind: "playing" }
  | { kind: "check" }
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "draw"; reason: string };

/** Everything the 3D director needs to choreograph one move. */
export interface MoveEvent {
  move: Move;
  moverId: string;
  victimId?: string;
  victimSquare?: Square;
  /** for castling */
  rookId?: string;
  rookFrom?: Square;
  rookTo?: Square;
  promotion?: PieceSymbol;
}

export interface Settings {
  animSpeed: number; // 0.5 .. 3
  cinematic: boolean; // full battle animations vs quick moves
  cameraFollow: boolean;
  quality: "high" | "low";
  sound: boolean;
  showHints: boolean;
  /** Stockfish strength 0..20 */
  engineSkill: number;
  /** Engine think time per move (ms) */
  engineThinkMs: number;
  /** Show plinths under the (procedural) pieces */
  bases: boolean;
  armies: Record<"w" | "b", ArmyStyle>;
}
