"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGame, isGameOver } from "@/game/store";
import type { Color, PieceSymbol } from "@/game/types";
import { ENGINES } from "@/engine";
import { unlockAudio } from "@/audio/sfx";

const GLYPH: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NAME: Record<PieceSymbol, string> = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
const VALUE: Record<PieceSymbol, number> = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };
const side = (c: Color) => (c === "w" ? "White" : "Black");

function Glyph({ kind, color, size }: { kind: PieceSymbol; color: Color; size?: number }) {
  return (
    <span className={`glyph glyph-${color}`} style={size ? { fontSize: size } : undefined}>
      {GLYPH[kind]}
    </span>
  );
}

/* ------------------------------------------------------------------ */

function TurnBanner() {
  const turn = useGame((s) => s.turn);
  const status = useGame((s) => s.status);
  const thinking = useGame((s) => s.thinking);
  const busy = useGame((s) => s.busy);
  const players = useGame((s) => s.players);

  let text = `${side(turn)} to move`;
  let tone = "";
  if (status.kind === "check") {
    text = `${side(turn)} is in check!`;
    tone = "danger";
  }
  if (status.kind === "checkmate") {
    text = `Checkmate — ${side(status.winner)} triumphs`;
    tone = "gold";
  }
  if (status.kind === "stalemate") text = "Stalemate";
  if (status.kind === "draw") text = `Draw · ${status.reason}`;
  const sub = thinking ? `${ENGINES.find((e) => e.id === "random")?.name} is plotting…` : busy ? "Battle in progress…" : players[turn] === "engine" ? "Engine's turn" : "";

  return (
    <div className={`turn-banner ${tone}`}>
      <span className={`turn-dot dot-${turn}`} />
      <div>
        <div className="turn-text">{text}</div>
        {sub && <div className="turn-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Captured({ color }: { color: Color }) {
  // pieces this colour has captured = pieces the opponent lost
  const opp: Color = color === "w" ? "b" : "w";
  const lost = useGame((s) => s.lost[opp]);
  const myLost = useGame((s) => s.lost[color]);
  const order: PieceSymbol[] = ["q", "r", "b", "n", "p"];
  const sorted = [...lost].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const adv = lost.reduce((n, k) => n + VALUE[k], 0) - myLost.reduce((n, k) => n + VALUE[k], 0);
  return (
    <div className="captured">
      {sorted.map((k, i) => (
        <Glyph key={i} kind={k} color={opp} />
      ))}
      {adv > 0 && <span className="adv">+{adv}</span>}
    </div>
  );
}

function PlayerRow({ color }: { color: Color }) {
  const turn = useGame((s) => s.turn);
  const players = useGame((s) => s.players);
  const setPlayer = useGame((s) => s.setPlayer);
  const over = useGame((s) => isGameOver(s.status));
  return (
    <div className={`player ${turn === color && !over ? "active" : ""}`}>
      <div className="player-head">
        <Glyph kind="k" color={color} size={22} />
        <div className="player-name">{side(color)}</div>
        <select
          className="player-select"
          value={players[color]}
          onChange={(e) => setPlayer(color, e.target.value as "human" | "engine")}
          aria-label={`${side(color)} player`}
        >
          <option value="human">Human</option>
          <option value="engine">Training Dummy (bot)</option>
        </select>
      </div>
      <Captured color={color} />
    </div>
  );
}

function History() {
  const history = useGame((s) => s.history);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);
  const rows = useMemo(() => {
    const r: [number, string, string | undefined][] = [];
    for (let i = 0; i < history.length; i += 2) r.push([i / 2 + 1, history[i], history[i + 1]]);
    return r;
  }, [history]);
  return (
    <div className="history" ref={ref}>
      {rows.length === 0 && <div className="history-empty">The armies await your command.</div>}
      {rows.map(([n, w, b]) => (
        <div className="history-row" key={n}>
          <span className="hn">{n}.</span>
          <span className="hm">{w}</span>
          <span className="hm">{b ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Settings({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.setSettings);
  return (
    <div className="settings">
      <div className="settings-head">
        <h3>War Council</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>
      <label className="row">
        <span>Battle speed</span>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.25}
          value={settings.animSpeed}
          onChange={(e) => set({ animSpeed: parseFloat(e.target.value) })}
        />
        <span className="val">{settings.animSpeed.toFixed(2)}×</span>
      </label>
      <Toggle label="Cinematic captures" value={settings.cinematic} onChange={(v) => set({ cinematic: v })} />
      <Toggle label="Camera follows turn" value={settings.cameraFollow} onChange={(v) => set({ cameraFollow: v })} />
      <Toggle label="Show legal moves" value={settings.showHints} onChange={(v) => set({ showHints: v })} />
      <Toggle label="Sound" value={settings.sound} onChange={(v) => set({ sound: v })} />
      <div className="row">
        <span>Graphics</span>
        <div className="seg">
          {(["high", "low"] as const).map((q) => (
            <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => set({ quality: q })}>
              {q === "high" ? "Cinematic" : "Performance"}
            </button>
          ))}
        </div>
      </div>
      <div className="engine-note">
        <strong>Engines:</strong>{" "}
        {ENGINES.map((e) => (
          <span key={e.id} className={`chip ${e.available ? "" : "off"}`}>
            {e.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row toggle">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

/* ------------------------------------------------------------------ */

function Promotion() {
  const pending = useGame((s) => s.pendingPromotion);
  const turn = useGame((s) => s.turn);
  const choose = useGame((s) => s.choosePromotion);
  const cancel = useGame((s) => s.cancelPromotion);
  if (!pending) return null;
  return (
    <div className="modal-veil" onClick={cancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ascension</h2>
        <p>Your pawn has reached the far rank. Choose its new form.</p>
        <div className="promo-grid">
          {(["q", "r", "b", "n"] as PieceSymbol[]).map((k) => (
            <button key={k} className="promo" onClick={() => choose(k)}>
              <Glyph kind={k} color={turn} size={44} />
              <span>{NAME[k]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameOver() {
  const status = useGame((s) => s.status);
  const busy = useGame((s) => s.busy);
  const newGame = useGame((s) => s.newGame);
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);
  const over = isGameOver(status);
  useEffect(() => {
    setDismissed(false);
    if (over && !busy) {
      const id = setTimeout(() => setShow(true), 2600);
      return () => clearTimeout(id);
    }
    setShow(false);
  }, [over, busy]);
  if (!over || !show || dismissed) return null;
  const title =
    status.kind === "checkmate" ? `${side(status.winner)} Wins` : status.kind === "stalemate" ? "Stalemate" : "Draw";
  const sub =
    status.kind === "checkmate" ? "The enemy king has fallen." : status.kind === "draw" ? status.reason : "No legal moves remain.";
  return (
    <div className="modal-veil">
      <div className="modal victory">
        <div className="crest">♛</div>
        <h2>{title}</h2>
        <p>{sub}</p>
        <div className="modal-actions">
          <button className="btn gold" onClick={newGame}>
            New battle
          </button>
          <button className="btn" onClick={() => setDismissed(true)}>
            Admire the field
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Hud({ ready }: { ready: boolean }) {
  const [showSettings, setShowSettings] = useState(false);
  const panelOpen = useGame((s) => s.panelOpen);
  const setPanelOpen = useGame((s) => s.setPanelOpen);
  const newGame = useGame((s) => s.newGame);
  const undo = useGame((s) => s.undo);
  const busy = useGame((s) => s.busy);
  const canUndo = useGame((s) => s.snapshots.length > 0);
  const viewSide = useGame((s) => s.viewSide);
  const setViewSide = useGame((s) => s.setViewSide);
  const setSettings = useGame((s) => s.setSettings);
  const follow = useGame((s) => s.settings.cameraFollow);

  return (
    <div className="hud" onPointerDown={unlockAudio}>
      <header className="brand">
        <div className="brand-mark">V</div>
        <div>
          <div className="brand-title">VIXOR CHESS</div>
          <div className="brand-sub">by Vixor Software Agency</div>
        </div>
      </header>

      <div className="top-center">
        <TurnBanner />
      </div>

      <aside className={`panel ${panelOpen ? "open" : ""}`}>
        <button className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-label="Toggle panel">
          {panelOpen ? "›" : "‹"}
        </button>
        <div className="panel-body">
          <PlayerRow color="b" />
          <div className="panel-label">Chronicle</div>
          <History />
          <PlayerRow color="w" />
        </div>
      </aside>

      <nav className="toolbar">
        <button
          className="btn gold"
          onClick={() => {
            if (useGame.getState().history.length === 0 || confirm("Abandon this battle and start anew?")) newGame();
          }}
        >
          New battle
        </button>
        <button className="btn" onClick={undo} disabled={busy || !canUndo}>
          Undo
        </button>
        <button
          className="btn"
          onClick={() => {
            if (follow) setSettings({ cameraFollow: false });
            setViewSide(viewSide === "w" ? "b" : "w");
          }}
        >
          Flip view
        </button>
        <button className="btn" onClick={() => setShowSettings((v) => !v)}>
          Settings
        </button>
      </nav>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <Promotion />
      <GameOver />

      {!ready && (
        <div className="loading">
          <div className="brand-mark big">V</div>
          <div className="loading-text">Forging the armies…</div>
        </div>
      )}
    </div>
  );
}
