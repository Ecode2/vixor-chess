# Vixor Chess

A cinematic 3D chess game where the pieces are alive. Knights gallop and leap,
pawns draw swords, bishops call down radiant judgment, rooks fire cannons from
their battlements, queens wield arcane magic, and kings cleave with a
greatsword. When a piece is taken it **dismantles** into its sculpted parts.

A side project of **Vixor Software Agency**.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 16 (App Router), static export-friendly | Zero backend; deploys to Vercel as static |
| 3D | three.js via React Three Fiber + drei | Mature, fast, full control over detail |
| Post FX | `@react-three/postprocessing` (N8AO, Bloom, Vignette, ACES) | Ambient occlusion makes carved detail pop; bloom for magic |
| Rules | `chess.js` | Full legal-move generation, check/mate/draw detection |
| State | `zustand` | Tiny, works inside and outside React |
| Audio | WebAudio, fully synthesised | No audio assets to ship |

There are **no model or texture files**: every piece is built procedurally
from lathes, extrusions, tubes and primitives (`src/three/pieces`), and every
texture (marble, brick, grain, glow) is painted on a canvas at start-up
(`src/three/textures.ts`). The whole game is a few hundred KB of JS.

## Running

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Deploy: push to GitHub and import the repo in Vercel - no configuration
needed (framework preset: Next.js).

## How to play

- Click one of your pieces, then a highlighted square. Gold dots are moves,
  red frames are captures.
- Drag to orbit the camera, scroll/pinch to zoom.
- **Hint** asks Stockfish for the best move and highlights it.
- **Settings**
  - *Game*: battle speed, cinematic captures, camera follow, legal-move hints,
    bases on/off, sound, graphics quality (Cinematic / Performance).
  - *Armies*: each player picks a preset (Royal, Classic ivory & obsidian,
    Gilded, Verdant, Frost, Infernal) or their own stone / trim / cloth / glow
    colours. Saved in the browser.
  - *Engine*: Stockfish strength (≈1320 Elo up to full strength) and think time.
- Each side can be **Human**, **Stockfish** or **Training Dummy** (random
  moves). Set both to an engine to watch a battle.

## Custom models (realistic pieces)

Put rigged GLB/FBX models (e.g. Mixamo characters + animations, Sketchfab
sculpts) in `public/models/` with a `manifest.json` and they replace the
procedural pieces, with walking, attacks, hit reactions, death, victory,
army colours and real-geometry dismantling. See
[`public/models/README.md`](public/models/README.md) and
`public/models/manifest.example.json`.

## Project layout

```
src/
  app/                 Next.js entry (layout, page, global CSS)
  components/          React UI: canvas host + HUD
  game/                Rules + state (zustand store over chess.js)
  engine/              Chess engine plug-in interface + registry
  audio/sfx.ts         Synthesised sound effects
  three/
    pieces/            Procedural piece models (kit, parts, models, materials)
    anim/              Timeline, per-piece animators, the battle director
    fx/                Debris / shatter, beams, holy cross, cannonball, orbs...
    scene/             Board, pieces, markers, camera, lighting, post FX
```

### How the animation works

1. The store validates a move with chess.js and emits a `MoveEvent`.
2. `three/anim/director.ts` choreographs it as async code
   (`await travel(...)`, `await play(attacker, "attack", ...)`), using a
   frame-driven timeline so the speed slider scales everything.
3. Each piece has a rig of named joints (head, shoulders, elbows, horse legs,
   turret, cannon...). `animators.ts` poses them every frame from the actor's
   state: idle breathing, looking around, random gestures, locomotion cycles
   and attack/brace/cheer actions.
4. On impact, `fx.shatter()` clones every mesh of the victim into world space
   and throws the parts with physics (gravity, bounce, spin), styled per
   attacker: slash, crush, holy (floating light), arcane (vortex), explode,
   cleave.
5. When the choreography resolves, the store commits the new board.

## Chess engine

Stockfish 18 (lite, single-threaded WebAssembly, ~7 MB) runs in a Web Worker in
the player's browser, so it needs no server and no special headers on Vercel.
`scripts/copy-engine.mjs` copies it from `node_modules/stockfish` into
`public/engines/` before `dev` and `build`.

Engines plug in through `src/engine/types.ts`:

```ts
interface ChessEngine {
  init(): Promise<void>;
  bestMove(fen: string, options?: EngineSearchOptions): Promise<EngineMove>; // uci, e.g. "e7e8q"
  evaluate?(fen: string): Promise<{ scoreCp: number; mate?: number }>;
  stop(): void;
  dispose(): void;
}
```

Register new ones in `src/engine/index.ts`.

Stockfish is GPLv3. Its licence ships at `/engines/STOCKFISH-LICENSE.txt` and
the source link is shown in Settings.

## Debugging

`window.__vixor` exposes the store (`useGame`), the three.js state, the FX layer
and the animation timeline, e.g.:

```js
__vixor.useGame.getState().loadFen("4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1")
__vixor.useGame.getState().requestMove("e3", "d5")
```
