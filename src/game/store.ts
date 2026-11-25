"use client";

import { create } from "zustand";
import { Chess } from "chess.js";
import type {
  Color,
  GameStatus,
  Move,
  MoveEvent,
  PieceData,
  PieceSymbol,
  PlayerType,
  Settings,
  Square,
} from "./types";
import { engineConfig, getEngine, resetEngine, type EngineStatus } from "@/engine";
import { ARMY_PRESETS } from "./armies";

interface Snapshot {
  pieces: PieceData[];
  lost: Record<Color, PieceSymbol[]>;
  history: string[];
  lastMove: { from: Square; to: Square } | null;
}

export interface GameState {
  chess: Chess;
  gameId: number;
  fen: string;
  turn: Color;
  pieces: PieceData[];
  snapshots: Snapshot[];
  selected: Square | null;
  legalMoves: Move[];
  hovered: Square | null;
  lastMove: { from: Square; to: Square } | null;
  history: string[];
  /** Pieces each colour has LOST. */
  lost: Record<Color, PieceSymbol[]>;
  status: GameStatus;
  busy: boolean;
  thinking: boolean;
  pendingPromotion: { from: Square; to: Square } | null;
  players: Record<Color, PlayerType>;
  /** Suggested move from the engine (hint button). */
  hint: { from: Square; to: Square } | null;
  hintLoading: boolean;
  engineError: string | null;
  engineStatus: EngineStatus;
  requestHint(): void;
  /** Clear an engine error and let the engine try again. */
  retryEngine(): void;
  settings: Settings;
  event: MoveEvent | null;
  eventSeq: number;
  viewSide: Color;
  panelOpen: boolean;
  setPanelOpen(v: boolean): void;

  clickSquare(sq: Square): void;
  setHovered(sq: Square | null): void;
  requestMove(from: Square, to: Square, promotion?: PieceSymbol): boolean;
  choosePromotion(kind: PieceSymbol): void;
  cancelPromotion(): void;
  finishEvent(): void;
  undo(): void;
  newGame(): void;
  /** Load an arbitrary position (for puzzles, engine analysis, debugging). */
  loadFen(fen: string): boolean;
  setSettings(patch: Partial<Settings>): void;
  setPlayer(color: Color, type: PlayerType): void;
  setViewSide(c: Color): void;
}

const DEFAULT_SETTINGS: Settings = {
  animSpeed: 1,
  cinematic: true,
  cameraFollow: true,
  quality: "high",
  sound: true,
  showHints: true,
  engineSkill: 8,
  engineThinkMs: 1000,
  engineBuild: "auto",
  theme: "night",
  bases: false,
  armies: { w: { ...ARMY_PRESETS.royal.w }, b: { ...ARMY_PRESETS.royal.b } },
};

let idCounter = 0;
const newId = (c: Color, k: PieceSymbol) => `${c}${k}-${++idCounter}`;

function piecesFromChess(chess: Chess): PieceData[] {
  const out: PieceData[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) out.push({ id: newId(cell.color, cell.type), kind: cell.type, color: cell.color, square: cell.square });
    }
  }
  return out;
}

function computeStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return { kind: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isInsufficientMaterial()) return { kind: "draw", reason: "Insufficient material" };
  if (chess.isThreefoldRepetition()) return { kind: "draw", reason: "Threefold repetition" };
  if (chess.isDrawByFiftyMoves()) return { kind: "draw", reason: "Fifty-move rule" };
  if (chess.inCheck()) return { kind: "check" };
  return { kind: "playing" };
}

export const isGameOver = (s: GameStatus) => s.kind === "checkmate" || s.kind === "stalemate" || s.kind === "draw";

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem("vixor-chess-settings");
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...saved, armies: { ...DEFAULT_SETTINGS.armies, ...(saved.armies ?? {}) } };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export const useGame = create<GameState>((set, get) => {
  const chess = new Chess();
  engineConfig.onStockfishStatus = (st) => set({ engineStatus: st, ...(st.state === "ready" ? { engineError: null } : {}) });

  const maybeEngineTurn = () => {
    const s = get();
    const player = s.players[s.turn];
    if (s.busy || s.thinking || isGameOver(s.status) || player === "human") return;
    const gameId = s.gameId;
    const fen = s.chess.fen();
    set({ thinking: true, engineError: null });
    getEngine(player)
      .then((e) => e.bestMove(fen, { movetimeMs: s.settings.engineThinkMs, skill: s.settings.engineSkill }))
      .then((m) => {
        const cur = get();
        set({ thinking: false });
        if (cur.gameId !== gameId || cur.chess.fen() !== fen) return;
        cur.requestMove(m.uci.slice(0, 2) as Square, m.uci.slice(2, 4) as Square, (m.uci[4] as PieceSymbol) || undefined);
      })
      .catch((err) => {
        console.error("[engine]", err);
        set({ thinking: false, engineError: `${player === "stockfish" ? "Stockfish" : "Engine"} failed: ${err?.message ?? err}` });
      });
  };

  engineConfig.stockfishBuild = loadSettings().engineBuild;

  return {
    chess,
    gameId: 1,
    fen: chess.fen(),
    turn: "w",
    pieces: piecesFromChess(chess),
    snapshots: [],
    selected: null,
    legalMoves: [],
    hovered: null,
    lastMove: null,
    history: [],
    lost: { w: [], b: [] },
    status: { kind: "playing" },
    busy: false,
    thinking: false,
    pendingPromotion: null,
    players: { w: "human", b: "human" },
    hint: null,
    hintLoading: false,
    engineError: null,
    engineStatus: { state: "idle" },

    retryEngine() {
      set({ engineError: null, thinking: false });
      maybeEngineTurn();
    },

    requestHint() {
      const s = get();
      if (s.busy || s.hintLoading || isGameOver(s.status)) return;
      const fen = s.chess.fen();
      set({ hintLoading: true, hint: null });
      getEngine("stockfish")
        .catch(() => getEngine("random"))
        .then((e) => e.bestMove(fen, { movetimeMs: 800, skill: 20 }))
        .then((m) => {
          if (get().chess.fen() !== fen) return set({ hintLoading: false });
          set({ hintLoading: false, hint: { from: m.uci.slice(0, 2) as Square, to: m.uci.slice(2, 4) as Square } });
        })
        .catch((err) => {
          console.error("[hint]", err);
          set({ hintLoading: false });
        });
    },
    settings: loadSettings(),
    event: null,
    eventSeq: 0,
    viewSide: "w",
    panelOpen: typeof window === "undefined" ? true : window.innerWidth > 820,
    setPanelOpen(v) {
      set({ panelOpen: v });
    },

    setHovered(sq) {
      if (get().hovered !== sq) set({ hovered: sq });
    },

    clickSquare(sq) {
      const s = get();
      if (s.busy || s.pendingPromotion || isGameOver(s.status) || s.players[s.turn] !== "human") return;
      const piece = s.chess.get(sq);

      if (s.selected) {
        const candidates = s.legalMoves.filter((m) => m.to === sq);
        if (candidates.length) {
          if (candidates.some((m) => m.promotion)) {
            set({ pendingPromotion: { from: s.selected, to: sq } });
          } else {
            s.requestMove(s.selected, sq);
          }
          return;
        }
        if (sq === s.selected) {
          set({ selected: null, legalMoves: [] });
          return;
        }
      }
      if (piece && piece.color === s.turn) {
        set({ selected: sq, legalMoves: s.chess.moves({ square: sq, verbose: true }) });
      } else {
        set({ selected: null, legalMoves: [] });
      }
    },

    requestMove(from, to, promotion) {
      const s = get();
      if (s.busy) return false;
      const snapshot: Snapshot = {
        pieces: s.pieces.map((p) => ({ ...p })),
        lost: { w: [...s.lost.w], b: [...s.lost.b] },
        history: [...s.history],
        lastMove: s.lastMove,
      };
      let move: Move;
      try {
        move = s.chess.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        return false;
      }
      const mover = s.pieces.find((p) => p.square === from)!;
      const ev: MoveEvent = { move, moverId: mover.id };
      if (move.isCapture()) {
        let vsq: Square = to;
        if (move.isEnPassant()) vsq = (to[0] + from[1]) as Square;
        const victim = s.pieces.find((p) => p.square === vsq);
        if (victim) {
          ev.victimId = victim.id;
          ev.victimSquare = vsq;
        }
      }
      if (move.isKingsideCastle() || move.isQueensideCastle()) {
        const rank = from[1];
        const rookFrom = ((move.isKingsideCastle() ? "h" : "a") + rank) as Square;
        const rookTo = ((move.isKingsideCastle() ? "f" : "d") + rank) as Square;
        const rook = s.pieces.find((p) => p.square === rookFrom);
        if (rook) Object.assign(ev, { rookId: rook.id, rookFrom, rookTo });
      }
      if (move.promotion) ev.promotion = move.promotion;

      set({
        hint: null,
        snapshots: [...s.snapshots, snapshot],
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
        busy: true,
        event: ev,
        eventSeq: s.eventSeq + 1,
        fen: s.chess.fen(),
      });
      return true;
    },

    choosePromotion(kind) {
      const p = get().pendingPromotion;
      if (!p) return;
      set({ pendingPromotion: null });
      get().requestMove(p.from, p.to, kind);
    },

    cancelPromotion() {
      set({ pendingPromotion: null });
    },

    finishEvent() {
      const s = get();
      const ev = s.event;
      if (!ev) return;
      const lost = { w: [...s.lost.w], b: [...s.lost.b] };
      let pieces = s.pieces.filter((p) => {
        if (p.id === ev.victimId) {
          lost[p.color].push(p.kind);
          return false;
        }
        return true;
      });
      pieces = pieces.map((p) => {
        if (p.id === ev.moverId) {
          if (ev.promotion) return { id: newId(p.color, ev.promotion), kind: ev.promotion, color: p.color, square: ev.move.to };
          return { ...p, square: ev.move.to };
        }
        if (p.id === ev.rookId && ev.rookTo) return { ...p, square: ev.rookTo };
        return p;
      });
      const status = computeStatus(s.chess);
      set({
        pieces,
        lost,
        event: null,
        busy: false,
        lastMove: { from: ev.move.from, to: ev.move.to },
        history: [...s.history, ev.move.san],
        turn: s.chess.turn(),
        fen: s.chess.fen(),
        status,
      });
      maybeEngineTurn();
    },

    undo() {
      const s = get();
      if (s.busy || !s.snapshots.length) return;
      // Against an engine, take back a full move so it's the human's turn again.
      const vsEngine = (s.players.w === "human") !== (s.players.b === "human");
      let steps = 1;
      if (vsEngine && s.players[s.turn] === "human" && s.snapshots.length >= 2) steps = 2;
      let snap: Snapshot | undefined;
      const snaps = [...s.snapshots];
      for (let i = 0; i < steps; i++) {
        s.chess.undo();
        snap = snaps.pop();
      }
      if (!snap) return;
      set({
        snapshots: snaps,
        pieces: snap.pieces,
        lost: snap.lost,
        history: snap.history,
        lastMove: snap.lastMove,
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
        turn: s.chess.turn(),
        fen: s.chess.fen(),
        status: computeStatus(s.chess),
        gameId: s.gameId + 1,
        thinking: false,
        hint: null,
      });
      maybeEngineTurn();
    },

    newGame() {
      const s = get();
      s.chess.reset();
      set({
        gameId: s.gameId + 1,
        pieces: piecesFromChess(s.chess),
        snapshots: [],
        selected: null,
        legalMoves: [],
        lastMove: null,
        history: [],
        lost: { w: [], b: [] },
        status: { kind: "playing" },
        busy: false,
        thinking: false,
        hint: null,
        pendingPromotion: null,
        event: null,
        turn: "w",
        fen: s.chess.fen(),
      });
      maybeEngineTurn();
    },

    loadFen(fen) {
      const s = get();
      try {
        s.chess.load(fen);
      } catch (e) {
        console.error("[loadFen]", e);
        return false;
      }
      set({
        gameId: s.gameId + 1,
        pieces: piecesFromChess(s.chess),
        snapshots: [],
        selected: null,
        legalMoves: [],
        lastMove: null,
        history: [],
        lost: { w: [], b: [] },
        status: computeStatus(s.chess),
        busy: false,
        thinking: false,
        pendingPromotion: null,
        event: null,
        turn: s.chess.turn(),
        fen: s.chess.fen(),
      });
      maybeEngineTurn();
      return true;
    },

    setSettings(patch) {
      const prev = get().settings;
      const settings = { ...prev, ...patch };
      if (patch.engineBuild && patch.engineBuild !== prev.engineBuild) {
        engineConfig.stockfishBuild = patch.engineBuild;
        resetEngine("stockfish");
        set({ engineStatus: { state: "idle" }, engineError: null });
      }
      set({ settings });
      try {
        window.localStorage.setItem("vixor-chess-settings", JSON.stringify(settings));
      } catch {}
    },

    setPlayer(color, type) {
      set({ players: { ...get().players, [color]: type }, engineError: null });
      if (type === "stockfish") getEngine("stockfish").catch(() => {}); // warm up the worker
      maybeEngineTurn();
    },

    setViewSide(c) {
      set({ viewSide: c });
    },
  };
});
