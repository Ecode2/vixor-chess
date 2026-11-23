import type { ChessEngine, EngineDescriptor } from "./types";
import { RandomEngine } from "./randomEngine";

export type { ChessEngine, EngineDescriptor, EngineMove, EngineSearchOptions } from "./types";

/**
 * Engine registry. To add Stockfish later:
 *  1. `npm i stockfish` (or drop stockfish.wasm + worker into /public/engines)
 *  2. create `stockfishEngine.ts` implementing ChessEngine (UCI over postMessage)
 *  3. add a descriptor below with available: true
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
    name: "Stockfish (coming soon)",
    description: "World-class engine via WebAssembly. Placeholder - not wired yet.",
    available: false,
    create: () => {
      throw new Error("Stockfish engine not implemented yet");
    },
  },
];

const instances = new Map<string, ChessEngine>();

export async function getEngine(id: string): Promise<ChessEngine> {
  let e = instances.get(id);
  if (!e) {
    const d = ENGINES.find((x) => x.id === id && x.available);
    if (!d) throw new Error(`Engine ${id} unavailable`);
    e = d.create();
    await e.init();
    instances.set(id, e);
  }
  return e;
}
