/**
 * Vixor Chess engine plug-in interface.
 *
 * Any chess engine (Stockfish WASM in a Web Worker, a remote API route, a
 * hand-written minimax...) can be dropped in by implementing this interface
 * and registering it in `src/engine/index.ts`. The game store only talks to
 * engines through this contract, so nothing else needs to change.
 */
export interface EngineSearchOptions {
  /** Milliseconds the engine may think. */
  movetimeMs?: number;
  /** Fixed search depth (if the engine supports it). */
  depth?: number;
  /** 0..20 style strength knob (Stockfish "Skill Level"). */
  skill?: number;
  signal?: AbortSignal;
}

export interface EngineMove {
  /** Long algebraic / UCI: e2e4, e7e8q */
  uci: string;
  /** Optional evaluation in centipawns from the side to move. */
  scoreCp?: number;
  /** Optional principal variation in UCI. */
  pv?: string[];
}

export interface ChessEngine {
  readonly id: string;
  readonly name: string;
  /** Load WASM / spin up workers. Called once before first use. */
  init(): Promise<void>;
  /** Return the move the engine wants to play in the given position. */
  bestMove(fen: string, options?: EngineSearchOptions): Promise<EngineMove>;
  /** Optional: position evaluation for an eval bar. */
  evaluate?(fen: string, options?: EngineSearchOptions): Promise<{ scoreCp: number; mate?: number }>;
  /** Abort any running search. */
  stop(): void;
  /** Tear down workers. */
  dispose(): void;
}

export interface EngineDescriptor {
  id: string;
  name: string;
  description: string;
  available: boolean;
  create(): ChessEngine;
}
