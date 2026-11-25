"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGame, isGameOver } from "@/game/store";
import type { ArmyStyle, Color, PieceSymbol, PlayerType } from "@/game/types";
import { ARMY_PRESETS, PRESET_IDS } from "@/game/armies";
import { ENGINES } from "@/engine";
import { unlockAudio } from "@/audio/sfx";
import { useModels } from "@/three/external/loader";
import { useLayoutMode } from "@/game/layout";

/* ------------------------------------------------------------------ */
/* toolbar icons (inline SVG, inherit currentColor)                    */
/* ------------------------------------------------------------------ */

const ICON_PATHS: Record<string, string> = {
  new: "M5 19 19 5M14 5h5v5M5 5l5 5M14 14l5 5M5 19v-4M5 19h4",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  hint: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z",
  flip: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  moves: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
};

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

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
  const engineError = useGame((s) => s.engineError);
  const engineStatus = useGame((s) => s.engineStatus);
  const retryEngine = useGame((s) => s.retryEngine);
  const engineName = ENGINES.find((e) => e.id === players[turn])?.name ?? "Engine";
  let sub = thinking ? `${engineName} is plotting…` : busy ? "Battle in progress…" : players[turn] !== "human" ? `${engineName}'s turn` : "";
  if (thinking && players[turn] === "stockfish" && engineStatus.state === "loading") {
    const pct = engineStatus.progress !== undefined && engineStatus.progress > 0 ? ` ${Math.round(engineStatus.progress * 100)}%` : "";
    sub = engineStatus.build === "asm" ? `Loading Stockfish (compatibility mode)…${pct}` : `Loading Stockfish…${pct}`;
  }
  if (engineError) {
    sub = engineError;
    tone = "danger";
  }

  return (
    <div className={`turn-banner ${tone}`}>
      <span className={`turn-dot dot-${turn}`} />
      <div>
        <div className="turn-text">{text}</div>
        {sub && <div className="turn-sub">{sub}</div>}
      </div>
      {engineError && players[turn] !== "human" && (
        <button className="btn small" onClick={retryEngine}>
          Retry
        </button>
      )}
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
          onChange={(e) => setPlayer(color, e.target.value as PlayerType)}
          aria-label={`${side(color)} player`}
        >
          <option value="human">Human</option>
          <option value="stockfish">Stockfish</option>
          <option value="random">Training Dummy</option>
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

const SKILL_LABEL = (s: number) => {
  if (s >= 20) return "Grandmaster+";
  const elo = Math.round(1320 + (s / 19) * (3190 - 1320));
  return `~${elo} Elo`;
};

function Settings({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.setSettings);
  const [tab, setTab] = useState<"game" | "armies" | "engine">("game");
  return (
    <div className="settings">
      <div className="settings-head">
        <h3>War Council</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>
      <div className="tabs">
        {(["game", "armies", "engine"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "game" ? "Game" : t === "armies" ? "Armies" : "Engine"}
          </button>
        ))}
      </div>
      {tab === "game" && (
        <>
          <div className="row">
            <span>Scene</span>
            <div className="seg">
              {(
                [
                  ["day", "☀ Day"],
                  ["night", "☾ Night"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} className={settings.theme === v ? "on" : ""} onClick={() => set({ theme: v })}>
                  {label}
                </button>
              ))}
            </div>
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
          <Toggle label="Pieces stand on bases" value={settings.bases} onChange={(v) => set({ bases: v })} />
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
          <Credits />
          <p className="note">
            Chess engine: Stockfish 18 (GPLv3) · <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">source</a>
          </p>
        </>
      )}
      {tab === "armies" && (
        <div className="armies">
          {(["w", "b"] as const).map((c) => (
            <ArmyEditor key={c} color={c} />
          ))}
        </div>
      )}
      {tab === "engine" && (
        <>
          <label className="row">
            <span>Stockfish strength</span>
            <input type="range" min={0} max={20} step={1} value={settings.engineSkill} onChange={(e) => set({ engineSkill: parseInt(e.target.value, 10) })} />
            <span className="val wide">{SKILL_LABEL(settings.engineSkill)}</span>
          </label>
          <label className="row">
            <span>Think time</span>
            <input
              type="range"
              min={300}
              max={5000}
              step={100}
              value={settings.engineThinkMs}
              onChange={(e) => set({ engineThinkMs: parseInt(e.target.value, 10) })}
            />
            <span className="val">{(settings.engineThinkMs / 1000).toFixed(1)}s</span>
          </label>
          <div className="row">
            <span>Engine build</span>
            <div className="seg">
              {(
                [
                  ["auto", "Auto"],
                  ["wasm", "Fast"],
                  ["asm", "Compatibility"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} className={settings.engineBuild === v ? "on" : ""} onClick={() => set({ engineBuild: v })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <EngineStatusLine />
          <p className="note">
            Choose <strong>Stockfish</strong> for either side in the player panel. It runs locally in your browser (WebAssembly), so it
            needs no server. Set both sides to an engine to watch a battle.
          </p>
        </>
      )}
    </div>
  );
}

function EngineStatusLine() {
  const st = useGame((s) => s.engineStatus);
  const label =
    st.state === "ready"
      ? `Ready · ${st.build === "asm" ? "JavaScript (compatibility)" : "WebAssembly"}`
      : st.state === "loading"
        ? `Loading ${st.build === "asm" ? "compatibility build" : "engine"}${st.progress ? ` · ${Math.round(st.progress * 100)}%` : "…"}`
        : st.state === "error"
          ? st.message ?? "Failed to start"
          : "Not loaded yet (starts when Stockfish plays or you ask for a hint)";
  return (
    <div className={`row engine-status ${st.state}`}>
      <span>Status</span>
      <span className="val wide2">{label}</span>
    </div>
  );
}

const ARMY_FIELDS: { key: keyof Omit<ArmyStyle, "preset">; label: string }[] = [
  { key: "body", label: "Stone" },
  { key: "accent", label: "Trim" },
  { key: "cloth", label: "Cloth" },
  { key: "glow", label: "Glow" },
];

function ArmyEditor({ color }: { color: Color }) {
  const army = useGame((s) => s.settings.armies[color]);
  const armies = useGame((s) => s.settings.armies);
  const set = useGame((s) => s.setSettings);
  const update = (patch: Partial<ArmyStyle>) => set({ armies: { ...armies, [color]: { ...army, ...patch } } });
  return (
    <div className="army">
      <div className="army-head">
        <Glyph kind="k" color={color} size={18} />
        <span>{side(color)} army</span>
      </div>
      <select
        className="player-select full"
        value={PRESET_IDS.includes(army.preset) ? army.preset : "custom"}
        onChange={(e) => {
          const p = ARMY_PRESETS[e.target.value];
          if (p) update({ ...p[color] });
        }}
        aria-label={`${side(color)} army preset`}
      >
        {PRESET_IDS.map((id) => (
          <option key={id} value={id}>
            {ARMY_PRESETS[id].label}
          </option>
        ))}
        <option value="custom" disabled>
          Custom
        </option>
      </select>
      <div className="swatches">
        {ARMY_FIELDS.map((f) => (
          <label key={f.key} className="swatch">
            <input type="color" value={army[f.key]} onChange={(e) => update({ [f.key]: e.target.value, preset: "custom" })} />
            <span>{f.label}</span>
          </label>
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

function ThemeToggle() {
  const theme = useGame((s) => s.settings.theme);
  const set = useGame((s) => s.setSettings);
  return (
    <button
      className="theme-toggle"
      onClick={() => set({ theme: theme === "day" ? "night" : "day" })}
      aria-label={theme === "day" ? "Switch to night" : "Switch to day"}
      title={theme === "day" ? "Switch to night" : "Switch to day"}
    >
      {theme === "day" ? "☾" : "☀"}
    </button>
  );
}

function Loading() {
  const status = useModels((s) => s.status);
  const progress = useModels((s) => s.progress);
  return (
    <div className="loading">
      <div className="brand-mark big">V</div>
      <div className="loading-text">{status === "loading" ? `Summoning the armies… ${Math.round(progress * 100)}%` : "Forging the armies…"}</div>
    </div>
  );
}

function ModelNotice() {
  const error = useModels((s) => s.error);
  const [hidden, setHidden] = useState(false);
  if (!error || hidden) return null;
  return (
    <div className="model-notice" onClick={() => setHidden(true)}>
      {error} <span className="muted">(tap to dismiss)</span>
    </div>
  );
}

function Credits() {
  const credits = useModels((s) => s.credits);
  if (!credits.length) return null;
  return (
    <div className="credits">
      <div className="panel-label">Model credits</div>
      {credits.map((c, i) => (
        <div key={i}>
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.title}
            </a>
          ) : (
            c.title
          )}{" "}
          by {c.author}
          {c.license ? ` · ${c.license}` : ""}
        </div>
      ))}
    </div>
  );
}

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
  const requestHint = useGame((s) => s.requestHint);
  const hintLoading = useGame((s) => s.hintLoading);
  const humanTurn = useGame((s) => s.players[s.turn] === "human");
  const over = useGame((s) => isGameOver(s.status));
  const mode = useLayoutMode();
  const compact = mode !== "desktop";

  // On small screens the sheets would overlap: only one at a time.
  const toggleSettings = () => {
    const next = !showSettings;
    setShowSettings(next);
    if (next && compact) setPanelOpen(false);
  };
  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    if (next && compact) setShowSettings(false);
  };
  // Entering a compact layout starts with the board unobstructed.
  useEffect(() => {
    if (compact) setPanelOpen(false);
  }, [compact, setPanelOpen]);

  return (
    <div className={`hud m-${mode}`} onPointerDown={unlockAudio}>
      <header className="brand">
        <div className="brand-mark">V</div>
        <div className="brand-text">
          <div className="brand-title">VIXOR CHESS</div>
          <div className="brand-sub">by Vixor Software Agency</div>
        </div>
      </header>

      <div className="top-center">
        <TurnBanner />
      </div>
      <ThemeToggle />

      <aside className={`panel ${panelOpen ? "open" : ""}`} aria-hidden={!panelOpen && compact}>
        <button className="panel-toggle" onClick={togglePanel} aria-label="Toggle panel">
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
          className="btn gold tb"
          onClick={() => {
            if (useGame.getState().history.length === 0 || confirm("Abandon this battle and start anew?")) newGame();
          }}
          aria-label="New battle"
        >
          <Icon name="new" />
          <span className="tb-label">{compact ? "New" : "New battle"}</span>
        </button>
        <button className="btn tb" onClick={undo} disabled={busy || !canUndo} aria-label="Undo">
          <Icon name="undo" />
          <span className="tb-label">Undo</span>
        </button>
        <button className="btn tb" onClick={requestHint} disabled={busy || hintLoading || !humanTurn || over} title="Ask Stockfish for the best move" aria-label="Hint">
          <Icon name="hint" />
          <span className="tb-label">{hintLoading ? "…" : "Hint"}</span>
        </button>
        <button
          className="btn tb"
          onClick={() => {
            if (follow) setSettings({ cameraFollow: false });
            setViewSide(viewSide === "w" ? "b" : "w");
          }}
          aria-label="Flip view"
        >
          <Icon name="flip" />
          <span className="tb-label">{compact ? "Flip" : "Flip view"}</span>
        </button>
        {compact && (
          <button className={`btn tb ${panelOpen ? "on" : ""}`} onClick={togglePanel} aria-label="Moves and players">
            <Icon name="moves" />
            <span className="tb-label">Moves</span>
          </button>
        )}
        <button className={`btn tb ${showSettings ? "on" : ""}`} onClick={toggleSettings} aria-label="Settings">
          <Icon name="settings" />
          <span className="tb-label">Settings</span>
        </button>
      </nav>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <Promotion />
      <GameOver />

      {!ready && <Loading />}
      <ModelNotice />
    </div>
  );
}
