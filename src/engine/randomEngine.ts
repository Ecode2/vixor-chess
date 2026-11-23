import { Chess } from "chess.js";
import type { ChessEngine, EngineMove, EngineSearchOptions } from "./types";

/**
 * "Training Dummy" - picks a random legal move (with a slight preference for
 * captures so the battle animations get some exercise). It exists to prove
 * the engine plumbing works end-to-end; swap in Stockfish later.
 */
export class RandomEngine implements ChessEngine {
  readonly id = "random";
  readonly name = "Training Dummy";

  async init() {}

  async bestMove(fen: string, options?: EngineSearchOptions): Promise<EngineMove> {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (!moves.length) throw new Error("No legal moves");
    await new Promise((r) => setTimeout(r, Math.min(options?.movetimeMs ?? 500, 1500)));
    const captures = moves.filter((m) => m.captured);
    const pool = captures.length && Math.random() < 0.6 ? captures : moves;
    const m = pool[Math.floor(Math.random() * pool.length)];
    return { uci: m.from + m.to + (m.promotion ?? "") };
  }

  stop() {}
  dispose() {}
}
