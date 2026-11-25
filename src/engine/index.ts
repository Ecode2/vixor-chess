import type { ChessEngine, EngineDescriptor } from "./types";
import { RandomEngine } from "./randomEngine";
import { StockfishEngine, type EngineBuild, type EngineStatus } from "./stockfishEngine";

export type { EngineBuild, EngineStatus } from "./stockfishEngine";

/** Runtime options for engines that need them (set by the store). */
export const engineConfig: { stockfishBuild: EngineBuild; onStockfishStatus: (s: EngineStatus) => void } = {
  stockfishBuild: "auto",
  onStockfishStatus: () => {},
};

export type { ChessEngine, EngineDescriptor, EngineMove, EngineSearchOptions } from "./types";

/**
 * Engine registry. To add another engine, implement ChessEngine and add a
 * descriptor here (and its id to PlayerType in src/game/types.ts).
 */
export const ENGINES: EngineDescriptor[] = [
  {
    id: "random",
    name: "Training Dummy",
    description: "Plays random legal moves. Great for watching the battles.",
    available: true,
    create: () => new RandomEngine(),
  },
  {
    id: "stockfish",
    name: "Stockfish 18",
    description: "World-class engine compiled to WebAssembly, running in your browser.",
    available: true,
    create: () => new StockfishEngine(engineConfig.stockfishBuild, (st) => engineConfig.onStockfishStatus(st)),
  },
];

const instances = new Map<string, ChessEngine>();

const pending = new Map<string, Promise<ChessEngine>>();

export function getEngine(id: string): Promise<ChessEngine> {
  const done = instances.get(id);
  if (done) return Promise.resolve(done);
  let p = pending.get(id);
  if (!p) {
    const d = ENGINES.find((x) => x.id === id && x.available);
    if (!d) return Promise.reject(new Error(`Engine ${id} unavailable`));
    const e = d.create();
    p = e.init().then(
      () => {
        instances.set(id, e);
        pending.delete(id);
        return e;
      },
      (err) => {
        pending.delete(id);
        e.dispose();
        throw err;
      },
    );
    pending.set(id, p);
  }
  return p;
}

/** Drop a cached engine instance (e.g. after changing its build). */
export function resetEngine(id: string) {
  instances.get(id)?.dispose();
  instances.delete(id);
  pending.delete(id);
}
