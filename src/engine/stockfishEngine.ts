import type { ChessEngine, EngineMove, EngineSearchOptions } from "./types";

/**
 * Stockfish 18 (lite, single-threaded WASM) running in a Web Worker.
 * Entirely client-side - works on any static host (Vercel included), no
 * cross-origin-isolation headers required.
 *
 * Files are copied to /public/engines by scripts/copy-engine.mjs.
 */
const ENGINE_URL = "/engines/stockfish-18-lite-single.js";

export class StockfishEngine implements ChessEngine {
  readonly id = "stockfish";
  readonly name = "Stockfish 18";
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void> | null = null;
  private currentSkill = -1;
  private queue: Promise<unknown> = Promise.resolve();

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_URL);
      } catch (e) {
        reject(e);
        return;
      }
      this.worker.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : String(e.data);
        this.listeners.forEach((l) => l(line));
      };
      this.worker.onerror = (e) => reject(new Error(`Stockfish failed to load: ${e.message}`));
      const timeout = setTimeout(() => reject(new Error("Stockfish load timed out")), 30000);
      this.waitFor((l) => l === "uciok")
        .then(() => {
          this.send("setoption name Hash value 32");
          this.send("isready");
          return this.waitFor((l) => l === "readyok");
        })
        .then(() => {
          clearTimeout(timeout);
          resolve();
        });
      this.send("uci");
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        onLine?.(line);
        if (pred(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
    });
  }

  private setSkill(skill: number) {
    if (skill === this.currentSkill) return;
    this.currentSkill = skill;
    const s = Math.max(0, Math.min(20, Math.round(skill)));
    this.send(`setoption name Skill Level value ${s}`);
    // Below full strength, also cap Elo so low levels feel human-beatable.
    if (s < 20) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${Math.round(1320 + (s / 19) * (3190 - 1320))}`);
    } else {
      this.send("setoption name UCI_LimitStrength value false");
    }
  }

  /** Searches are serialised: one at a time. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  bestMove(fen: string, options: EngineSearchOptions = {}): Promise<EngineMove> {
    return this.run(async () => {
      await this.init();
      this.setSkill(options.skill ?? 20);
      this.send("ucinewgame");
      this.send("isready");
      await this.waitFor((l) => l === "readyok");
      this.send(`position fen ${fen}`);
      let scoreCp: number | undefined;
      let pv: string[] | undefined;
      const go = options.depth ? `go depth ${options.depth}` : `go movetime ${options.movetimeMs ?? 1000}`;
      const onAbort = () => this.send("stop");
      options.signal?.addEventListener("abort", onAbort);
      this.send(go);
      const line = await this.waitFor(
        (l) => l.startsWith("bestmove"),
        (l) => {
          if (!l.startsWith("info") || !l.includes(" pv ")) return;
          const cp = l.match(/score cp (-?\d+)/);
          const mate = l.match(/score mate (-?\d+)/);
          if (cp) scoreCp = parseInt(cp[1], 10);
          if (mate) scoreCp = (parseInt(mate[1], 10) > 0 ? 1 : -1) * 100000;
          pv = l.split(" pv ")[1]?.trim().split(" ");
        },
      );
      options.signal?.removeEventListener("abort", onAbort);
      const uci = line.split(" ")[1];
      if (!uci || uci === "(none)") throw new Error("No move");
      return { uci, scoreCp, pv };
    });
  }

  evaluate(fen: string, options: EngineSearchOptions = {}) {
    return this.bestMove(fen, { ...options, skill: 20, depth: options.depth ?? 12 }).then((m) => ({
      scoreCp: m.scoreCp ?? 0,
    }));
  }

  stop() {
    this.send("stop");
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
