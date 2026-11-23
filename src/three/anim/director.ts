import * as THREE from "three";
import type { MoveEvent, Square } from "@/game/types";
import { homeYaw, squareToXZ, yawTowards } from "@/game/coords";
import { actors, spawnFx, type Actor, type Loco } from "./actors";
import { ease, timeline as tl } from "./timeline";
import { fx } from "../fx/fx";
import { sfx } from "@/audio/sfx";

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

const sq = (s: Square) => {
  const [x, z] = squareToXZ(s);
  return new THREE.Vector3(x, 0, z);
};

const glow = (a: Actor) => (a.color === "w" ? "#ffd27a" : "#ff5a2a");
const magic = (a: Actor) => (a.color === "w" ? "#8fd8ff" : "#c06bff");

function shortestAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnTo(a: Actor, yaw: number, dur = 0.25) {
  const start = a.yaw;
  const d = shortestAngle(start, yaw);
  if (Math.abs(d) < 0.01) return Promise.resolve();
  return tl.tween(dur * Math.min(1.5, 0.4 + Math.abs(d) / Math.PI), (t) => (a.yaw = start + d * t));
}

function face(a: Actor, target: THREE.Vector3, dur = 0.25) {
  return turnTo(a, yawTowards(target.x - a.pos.x, target.z - a.pos.z), dur);
}

function faceHome(a: Actor) {
  return turnTo(a, homeYaw(a.color), 0.3);
}

interface TravelOpts {
  dur: number;
  loco: Loco;
  arc?: number;
  /** locomotion cycles per unit distance */
  stride?: number;
  easing?: (t: number) => number;
  onStep?: () => void;
  bob?: number;
}

/** Move an actor along a straight line with locomotion + optional arc. */
async function travel(a: Actor, to: THREE.Vector3, o: TravelOpts) {
  const from = a.pos.clone();
  const dist = from.distanceTo(to);
  if (dist < 0.001) return;
  a.loco = o.loco;
  const stride = o.stride ?? 7;
  const startPhase = a.locoPhase;
  let lastStep = Math.floor(startPhase / Math.PI);
  await tl.tween(
    o.dur,
    (t) => {
      a.pos.lerpVectors(from, to, t);
      a.locoPhase = startPhase + t * dist * stride;
      let lift = 0;
      if (o.arc) lift += Math.sin(Math.PI * t) * o.arc;
      if (o.bob) lift += Math.abs(Math.sin(a.locoPhase)) * o.bob;
      a.lift = lift;
      const step = Math.floor(a.locoPhase / Math.PI);
      if (step !== lastStep) {
        lastStep = step;
        o.onStep?.();
      }
    },
    o.easing ?? ease.inOut,
  );
  a.lift = 0;
  a.loco = "none";
}

function play(a: Actor, name: string, dur: number, events: [number, () => void][] = []) {
  a.action = name;
  const fired = new Set<number>();
  return tl
    .tween(
      dur,
      (t) => {
        a.actionT = t;
        events.forEach(([at, fn], i) => {
          if (t >= at && !fired.has(i)) {
            fired.add(i);
            fn();
          }
        });
      },
      ease.linear,
    )
    .then(() => {
      a.action = null;
      a.actionT = 0;
    });
}

/** Hold an action at a pose (e.g. brace) without auto-clearing. */
function hold(a: Actor, name: string, to = 1, dur = 0.25) {
  a.action = name;
  const start = a.actionT;
  return tl.tween(dur, (t) => (a.actionT = start + (to - start) * t));
}

function release(a: Actor, dur = 0.25) {
  const start = a.actionT;
  return tl.tween(dur, (t) => (a.actionT = start * (1 - t))).then(() => {
    a.action = null;
  });
}

function standoff(from: THREE.Vector3, to: THREE.Vector3, distance: number) {
  const d = to.clone().sub(from);
  const len = d.length();
  if (len <= distance) return from.clone();
  return to.clone().sub(d.multiplyScalar(distance / len));
}

function anchorWorld(a: Actor, name: string, fallbackY = 1) {
  const o = a.rig.anchors[name];
  const v = new THREE.Vector3();
  if (o) {
    a.rig.root.updateMatrixWorld(true);
    o.getWorldPosition(v);
  } else v.copy(a.pos).setY(fallbackY);
  return v;
}

function chest(a: Actor) {
  return a.pos.clone().setY(a.rig.height * 0.55 + a.lift);
}

/* ------------------------------------------------------------------ */
/* locomotion per piece type                                           */
/* ------------------------------------------------------------------ */

async function moveNormally(a: Actor, to: THREE.Vector3, quick = false) {
  const dist = a.pos.distanceTo(to);
  await face(a, to, 0.2);
  switch (a.kind) {
    case "p":
      await travel(a, to, { dur: 0.35 + 0.28 * dist, loco: "walk", stride: 9, onStep: sfx.step, bob: 0.015 });
      break;
    case "n": {
      sfx.whoosh();
      const clops = setInterval(sfx.clop, 90);
      await travel(a, to, { dur: 0.75 + 0.05 * dist, loco: "gallop", stride: 6, arc: 0.9 + dist * 0.1, easing: ease.sine });
      clearInterval(clops);
      sfx.thud(1);
      fx.dust(a.pos, 0.8);
      fx.addShake(0.1);
      break;
    }
    case "b":
      await travel(a, to, { dur: 0.35 + 0.2 * dist, loco: "glide", stride: 4, bob: 0.04 });
      break;
    case "r":
      await travel(a, to, {
        dur: 0.3 + 0.22 * dist,
        loco: "stomp",
        stride: 5,
        bob: 0.09,
        onStep: () => {
          sfx.thud(0.6);
          if (!quick) fx.dust(a.pos, 0.35);
        },
      });
      fx.addShake(0.08);
      break;
    case "q": {
      const spin0 = a.spin;
      const p = travel(a, to, { dur: 0.45 + 0.2 * dist, loco: "float", stride: 3, arc: 0.25 });
      if (!quick) {
        sfx.whoosh();
        await tl.tween(0.45 + 0.2 * dist, (t) => (a.spin = spin0 + t * Math.PI * 2));
        a.spin = 0;
      }
      await p;
      break;
    }
    case "k":
      await travel(a, to, { dur: 0.45 + 0.35 * dist, loco: "walk", stride: 6, bob: 0.02, onStep: () => sfx.thud(0.4) });
      break;
  }
}

/* ------------------------------------------------------------------ */
/* captures                                                            */
/* ------------------------------------------------------------------ */

type Capture = (a: Actor, v: Actor, to: THREE.Vector3) => Promise<void>;

const victimBrace = async (a: Actor, v: Actor) => {
  await face(v, a.pos, 0.2);
  hold(v, "brace", 1, 0.3);
};

const pawnCapture: Capture = async (a, v, to) => {
  await face(a, v.pos);
  victimBrace(a, v);
  await travel(a, standoff(a.pos, v.pos, 0.5), { dur: 0.6, loco: "walk", stride: 9, onStep: sfx.step });
  sfx.whoosh(0.2);
  await play(a, "attack", 1.0, [
    [
      0.47,
      () => {
        sfx.clang();
        const dir = v.pos.clone().sub(a.pos).normalize();
        fx.slash(chest(v), a.yaw, glow(a), 0.45, 0.7);
        fx.particles(chest(v), { count: 25, color: "#fff2c0", speed: 3, size: 0.05, life: 0.5 });
        fx.pulse(chest(v), glow(a), 15, 0.3);
        fx.shatter(v, "slash", dir, 1);
        sfx.crumble();
        fx.addShake(0.15);
      },
    ],
  ]);
  await travel(a, to, { dur: 0.5, loco: "walk", stride: 9, onStep: sfx.step });
};

const knightCapture: Capture = async (a, v, to) => {
  await face(a, v.pos);
  victimBrace(a, v);
  sfx.whoosh();
  const clops = setInterval(sfx.clop, 90);
  await travel(a, standoff(a.pos, v.pos, 0.62), { dur: 0.75, loco: "gallop", stride: 6, arc: 0.8, easing: ease.sine });
  clearInterval(clops);
  sfx.thud(0.8);
  await play(a, "attack", 1.25, [
    [0.1, () => sfx.whoosh()],
    [
      0.57,
      () => {
        const dir = v.pos.clone().sub(a.pos).normalize();
        sfx.thud(1.4);
        sfx.clang();
        fx.shockwave(v.pos, glow(a), 1.3);
        fx.pulse(chest(v), glow(a), 20, 0.4);
        fx.shatter(v, "crush", dir, 1.2);
        sfx.crumble();
        fx.addShake(0.35);
      },
    ],
  ]);
  await travel(a, to, { dur: 0.45, loco: "gallop", stride: 6, arc: 0.25 });
  fx.dust(a.pos, 0.5);
};

const bishopCapture: Capture = async (a, v, to) => {
  await face(a, v.pos);
  const d = a.pos.distanceTo(v.pos);
  if (d > 2.4) await travel(a, standoff(a.pos, v.pos, 2.1), { dur: 0.3 + 0.18 * d, loco: "glide", stride: 4, bob: 0.04 });
  await face(v, a.pos, 0.2);
  const col = glow(a);
  let beam: { stop(): void } | null = null;
  sfx.choir();
  const lifting = { y: 0 };
  await play(a, "attack", 2.2, [
    [
      0.15,
      () => {
        beam = fx.beam(() => anchorWorld(a, "staffTop"), () => chest(v), col, 0.035);
        sfx.zap();
        hold(v, "brace", 1, 0.3);
      },
    ],
    [
      0.25,
      () => {
        fx.holyCross(v.pos.clone(), col, 1.8);
        sfx.chime();
        tl.tween(0.9, (t) => {
          lifting.y = t;
          v.lift = t * 0.45;
          v.pitch = Math.sin(a.time * 30) * 0.02;
        });
      },
    ],
    [
      0.68,
      () => {
        fx.flash(chest(v), col, 2.2, 0.6);
        fx.pulse(chest(v), col, 40, 0.8);
        fx.shatter(v, "holy", new THREE.Vector3(), 1);
        beam?.stop();
      },
    ],
  ]);
  await travel(a, to, { dur: 0.35 + 0.18 * a.pos.distanceTo(to), loco: "glide", stride: 4, bob: 0.04 });
};

const rookCapture: Capture = async (a, v, to) => {
  await face(a, v.pos, 0.35);
  victimBrace(a, v);
  sfx.thud(0.5);
  await play(a, "attack", 1.5, [
    [
      0.36,
      () => {
        const muzzle = anchorWorld(a, "muzzle");
        sfx.boom();
        fx.flash(muzzle, "#ffb050", 1.4, 0.35);
        fx.pulse(muzzle, "#ff9a40", 35, 0.35);
        fx.particles(muzzle, { count: 20, smoke: true, additive: false, color: "#888", speed: 0.8, up: 0.6, gravity: -0.4, size: 0.4, life: 1.4 });
        fx.addShake(0.25);
        const target = chest(v);
        const dist = muzzle.distanceTo(target);
        fx.cannonball(muzzle, target, 0.18 + dist * 0.07, 0.3 + dist * 0.06).then(() => {
          const dir = v.pos.clone().sub(a.pos).normalize();
          sfx.boom();
          sfx.crumble();
          fx.flash(target, "#ff7a30", 2.5, 0.5);
          fx.pulse(target, "#ff7a30", 45, 0.6);
          fx.shockwave(v.pos, "#ff8a40", 1.8, 0.7);
          fx.shatter(v, "explode", dir, 1.2);
          fx.addShake(0.5);
        });
      },
    ],
  ]);
  await moveNormally(a, to);
};

const queenCapture: Capture = async (a, v, to) => {
  await face(a, v.pos);
  const d = a.pos.distanceTo(v.pos);
  if (d > 2.6) await travel(a, standoff(a.pos, v.pos, 2.2), { dur: 0.4 + 0.15 * d, loco: "float", stride: 3, arc: 0.2 });
  await face(v, a.pos, 0.2);
  const col = magic(a);
  sfx.arcane();
  // rise into the air while casting
  tl.tween(0.5, (t) => (a.lift = t * 0.18));
  await play(a, "attack", 1.9, [
    [
      0.1,
      () => {
        hold(v, "brace", 1, 0.3);
        fx.orbs(() => chest(a).add(new THREE.Vector3(0, 0.2, 0)), chest(v), col, 0.75, 0.3).then(() => {
          sfx.zap();
          fx.vortex(v.pos, col, 1.1);
          fx.flash(chest(v), col, 1.5, 0.4);
          // victim spins up into the vortex
          tl.tween(0.55, (t) => {
            v.spin = t * t * Math.PI * 6;
            v.lift = t * 0.5;
          });
        });
      },
    ],
    [
      0.78,
      () => {
        sfx.crumble();
        fx.flash(chest(v), col, 2.4, 0.5);
        fx.pulse(chest(v), col, 35, 0.6);
        fx.shatter(v, "arcane", new THREE.Vector3(), 1);
        fx.addShake(0.2);
      },
    ],
  ]);
  await tl.tween(0.2, (t) => (a.lift = 0.18 * (1 - t)));
  await moveNormally(a, to);
};

const kingCapture: Capture = async (a, v, to) => {
  await face(a, v.pos);
  victimBrace(a, v);
  await travel(a, standoff(a.pos, v.pos, 0.55), { dur: 0.7, loco: "walk", stride: 6, bob: 0.02, onStep: () => sfx.thud(0.4) });
  await play(a, "attack", 1.5, [
    [0.2, () => sfx.whoosh(0.3)],
    [
      0.55,
      () => {
        const dir = v.pos.clone().sub(a.pos).normalize();
        sfx.clang();
        sfx.thud(1.6);
        fx.slash(chest(v).setY(0.7), a.yaw, glow(a), 0.6, 1.4, 0.4);
        fx.shockwave(v.pos, glow(a), 1.8);
        fx.pulse(chest(v), glow(a), 30, 0.5);
        fx.shatter(v, "cleave", dir, 1.3);
        sfx.crumble();
        fx.addShake(0.5);
      },
    ],
  ]);
  await travel(a, to, { dur: 0.6, loco: "walk", stride: 6, bob: 0.02, onStep: () => sfx.thud(0.4) });
};

const CAPTURES: Record<string, Capture> = {
  p: pawnCapture,
  n: knightCapture,
  b: bishopCapture,
  r: rookCapture,
  q: queenCapture,
  k: kingCapture,
};

async function quickCapture(a: Actor, v: Actor, to: THREE.Vector3) {
  await moveNormally(a, standoff(a.pos, v.pos, 0.45), true);
  sfx.clang();
  sfx.crumble();
  fx.shatter(v, "explode", v.pos.clone().sub(a.pos).normalize(), 0.6);
  fx.flash(chest(v), glow(a), 1, 0.3);
  await travel(a, to, { dur: 0.25, loco: a.kind === "n" ? "gallop" : "walk", stride: 8 });
}

/* ------------------------------------------------------------------ */
/* promotion                                                           */
/* ------------------------------------------------------------------ */

async function promote(a: Actor) {
  const col = glow(a);
  sfx.promote();
  fx.holyCross(a.pos.clone(), col, 1.2);
  fx.particles(a.pos.clone().setY(0.4), { count: 50, color: col, speed: 1, up: 2.5, gravity: -0.5, size: 0.06, life: 1.2, spread: 0.5 });
  await tl.tween(0.5, (t) => {
    a.lift = t * 0.3;
    a.spin = t * t * Math.PI * 4;
  });
  fx.flash(chest(a), col, 2.4, 0.6);
  fx.pulse(chest(a), col, 40, 0.7);
  await tl.tween(0.2, (t) => (a.scale = 1 - t));
  a.rig.root.visible = false;
  a.spin = 0;
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export async function perform(ev: MoveEvent, cinematic: boolean) {
  const a = actors.get(ev.moverId);
  if (!a) return;
  const v = ev.victimId ? actors.get(ev.victimId) : undefined;
  const to = sq(ev.move.to);
  a.busy = true;
  a.selected = false;
  try {
    if (ev.rookId && ev.rookTo) {
      const rook = actors.get(ev.rookId);
      const rookTo = sq(ev.rookTo);
      const kingP = moveNormally(a, to);
      if (rook) {
        rook.busy = true;
        await tl.wait(0.25);
        await face(rook, rookTo, 0.2);
        sfx.whoosh();
        await travel(rook, rookTo, { dur: 0.75, loco: "stomp", stride: 3, arc: 1.1, easing: ease.sine });
        sfx.thud(1.2);
        fx.dust(rook.pos, 1);
        fx.addShake(0.25);
        await faceHome(rook);
        rook.busy = false;
      }
      await kingP;
    } else if (v) {
      v.busy = true;
      if (cinematic) await CAPTURES[a.kind](a, v, to);
      else await quickCapture(a, v, to);
      if (!v.dead) fx.shatter(v, "explode", new THREE.Vector3(), 0.5);
    } else {
      await moveNormally(a, to, !cinematic);
    }
    if (ev.promotion) {
      await promote(a);
      spawnFx.add(ev.move.to);
    } else {
      await faceHome(a);
    }
  } finally {
    a.busy = false;
    a.loco = "none";
    a.lift = 0;
  }
}

/** Aftermath reactions once the board state is committed. */
export async function aftermath(kind: "check" | "checkmate" | "stalemate" | "draw", loserKingId?: string, winners: string[] = []) {
  if (kind === "check" && loserKingId) {
    const k = actors.get(loserKingId);
    if (!k) return;
    sfx.check();
    fx.pulse(chest(k), "#ff3020", 25, 1.0);
    fx.shockwave(k.pos, "#ff3a20", 0.9, 0.8);
    await hold(k, "brace", 0.8, 0.25);
    await tl.wait(0.5);
    await release(k, 0.4);
  } else if (kind === "checkmate" && loserKingId) {
    const k = actors.get(loserKingId);
    if (!k) return;
    sfx.check();
    k.busy = true;
    const kx = k.pos.x, kz = k.pos.z;
    await hold(k, "brace", 1, 0.3);
    await tl.wait(0.4);
    // the king topples
    const dir = Math.random() < 0.5 ? 1 : -1;
    // pivot about the plinth's edge rather than its centre
    const R = 0.37;
    await tl.tween(0.9, (t) => {
      k.roll = dir * t * t * (Math.PI / 2 - 0.12);
      k.lift = Math.sin(Math.abs(k.roll)) * R;
      const lx = -dir * (1 - Math.cos(k.roll)) * R;
      k.pos.x = kx + lx * Math.cos(k.yaw);
      k.pos.z = kz - lx * Math.sin(k.yaw);
    }, ease.linear);
    sfx.thud(1.5);
    sfx.crumble();
    fx.dust(k.pos, 1.5);
    fx.addShake(0.4);
    await tl.tween(0.15, (t) => (k.roll = dir * (Math.PI / 2 - 0.12 + Math.sin(t * Math.PI) * 0.06)));
    sfx.victory();
    for (const id of winners) {
      const w = actors.get(id);
      if (w) play(w, "cheer", 2.5 + Math.random() * 0.8);
    }
  }
}
