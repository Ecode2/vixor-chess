import type { ChessEngine, EngineMove, EngineSearchOptions } from "./types";

/**
 * Stockfish 18 running in a Web Worker, entirely client-side (works on any
 * static host, Vercel included, no special headers).
 *
 * Two builds are shipped in /public/engines:
 *  - "wasm": lite single-threaded WebAssembly (~7 MB, fast, needs WASM SIMD)
 *  - "asm":  pure JavaScript (~10 MB, slower/weaker, runs everywhere - the
 *            safety net for browsers where WASM is unavailable or stalls,
 *            e.g. some iOS Safari configurations / Lockdown Mode)
 *
 * In "auto" mode the WASM build is tried first and the JS build is used if it
 * fails or stalls. Progress and the build in use are reported via onStatus.
 */

export type EngineBuild = "auto" | "wasm" | "asm";

export interface EngineStatus {
  state: "idle" | "loading" | "ready" | "error";
  build?: "wasm" | "asm";
  /** 0..1 download progress when known */
  progress?: number;
  message?: string;
}

const BUILDS = {
  wasm: { url: "/engines/stockfish-18-lite-single.js", extra: "/engines/stockfish-18-lite-single.wasm", label: "WebAssembly" },
  asm: { url: "/engines/stockfish-18-asm.js", extra: null, label: "JavaScript (compatibility)" },
} as const;

/** Does this browser support WebAssembly with SIMD (what the WASM build needs)? */
function wasmSimdSupported(): boolean {
  try {
    if (typeof WebAssembly !== "object") return false;
    // (module (func (result v128) v128.const i32x4 0 0 0 0))
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      11,
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export class StockfishEngine implements ChessEngine {
  readonly id = "stockfish";
  readonly name = "Stockfish 18";
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void> | null = null;
  private currentSkill = -1;
  private queue: Promise<unknown> = Promise.resolve();
  build: "wasm" | "asm" | null = null;

  constructor(
    private preferred: EngineBuild = "auto",
    private onStatus: (s: EngineStatus) => void = () => {},
  ) {}

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const order: ("wasm" | "asm")[] =
        this.preferred === "asm" ? ["asm"] : this.preferred === "wasm" ? ["wasm"] : wasmSimdSupported() ? ["wasm", "asm"] : ["asm"];
      const errors: string[] = [];
      for (const build of order) {
        try {
          await this.boot(build);
          this.build = build;
          this.onStatus({ state: "ready", build, progress: 1 });
          return;
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          console.warn(`[stockfish] ${build} build failed: ${msg}`);
          errors.push(`${BUILDS[build].label}: ${msg}`);
          this.teardown();
        }
      }
      const message = `Stockfish could not start (${errors.join("; ")})`;
      this.onStatus({ state: "error", message });
      this.ready = null; // allow a retry later
      throw new Error(message);
    })();
    return this.ready;
  }

  /** Start one build and complete the UCI handshake. */
  private async boot(build: "wasm" | "asm") {
    const { url, extra } = BUILDS[build];
    this.onStatus({ state: "loading", build, progress: 0 });

    // Preflight: a missing file otherwise makes some browsers hang silently.
    for (const f of [url, extra]) {
      if (!f) continue;
      const res = await fetch(f, { method: "HEAD", cache: "no-cache" }).catch(() => null);
      if (!res || !res.ok) throw new Error(`engine file ${f} is missing (HTTP ${res?.status ?? "network error"})`);
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(msg));
      };
      // Stall detection rather than a fixed deadline: any progress pushes it back.
      const STALL_MS = build === "wasm" ? 25000 : 45000;
      let timer = setTimeout(() => fail("timed out while loading"), STALL_MS);
      const bump = () => {
        clearTimeout(timer);
        timer = setTimeout(() => fail("stalled while loading"), STALL_MS);
      };

      let worker: Worker;
      try {
        worker = new Worker(url);
      } catch (e) {
        fail(`could not create worker: ${(e as Error)?.message ?? e}`);
        return;
      }
      this.worker = worker;
      worker.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : String(e.data);
        this.listeners.forEach((l) => l(line));
      };
      worker.onerror = (e) => {
        e.preventDefault?.();
        fail(e.message || "worker error");
      };

      // download progress (supported by the stockfish.js loader)
      if (build === "wasm" && typeof MessageChannel !== "undefined") {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev: MessageEvent) => {
          const p = ev.data as { percent?: number; loaded?: number; total?: number };
          let frac = typeof p?.percent === "number" ? p.percent : p?.loaded && p?.total ? p.loaded / p.total : undefined;
          if (frac !== undefined && frac > 1) frac /= 100;
          bump();
          if (frac !== undefined) this.onStatus({ state: "loading", build, progress: Math.min(1, frac) });
        };
        try {
          worker.postMessage({ progressPort: ch.port2 }, [ch.port2]);
        } catch {}
      }

      this.waitFor((l) => l === "uciok", () => bump())
        .then(() => {
          this.send("setoption name Hash value 16");
          this.send("isready");
          return this.waitFor((l) => l === "readyok");
        })
        .then(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        });
      this.send("uci");
    });
  }

  private teardown() {
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
    this.currentSkill = -1;
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
      // the JS build is much slower: give it a fixed shallow depth budget instead
      const movetime = options.movetimeMs ?? 1000;
      const go = options.depth ? `go depth ${options.depth}` : `go movetime ${this.build === "asm" ? Math.max(movetime, 1500) : movetime}`;
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
    this.teardown();
    this.ready = null;
  }
}
