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
import { getEngine } from "@/engine";

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
  engineId: string;
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
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export const useGame = create<GameState>((set, get) => {
  const chess = new Chess();

  const maybeEngineTurn = () => {
    const s = get();
    if (s.busy || isGameOver(s.status) || s.players[s.turn] !== "engine") return;
    const gameId = s.gameId;
    const fen = s.chess.fen();
    set({ thinking: true });
    getEngine(s.engineId)
      .then((e) => e.bestMove(fen, { movetimeMs: 700 }))
      .then((m) => {
        const cur = get();
        if (cur.gameId !== gameId || cur.chess.fen() !== fen) return;
        set({ thinking: false });
        cur.requestMove(m.uci.slice(0, 2) as Square, m.uci.slice(2, 4) as Square, (m.uci[4] as PieceSymbol) || undefined);
      })
      .catch((err) => {
        console.error("[engine]", err);
        set({ thinking: false });
      });
  };

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
    engineId: "random",
    settings: loadSettings(),
    event: null,
    eventSeq: 0,
    viewSide: "w",
    panelOpen: true,
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
      const vsEngine = s.players.w !== s.players.b;
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
      const settings = { ...get().settings, ...patch };
      set({ settings });
      try {
        window.localStorage.setItem("vixor-chess-settings", JSON.stringify(settings));
      } catch {}
    },

    setPlayer(color, type) {
      set({ players: { ...get().players, [color]: type } });
      maybeEngineTurn();
    },

    setViewSide(c) {
      set({ viewSide: c });
    },
  };
});
