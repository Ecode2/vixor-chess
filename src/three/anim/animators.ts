import * as THREE from "three";
import { renderOpts, type Actor } from "./actors";
import { BASE_TOP } from "../pieces/parts";
import type { Rig } from "../pieces/kit";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const damp = (cur: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-lambda * dt));

const sstep = (t: number) => t * t * (3 - 2 * t);

/** Piecewise keyframe interpolation with smoothstep between keys. */
export function kf(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const u = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * sstep(u);
    }
  }
  return keys[keys.length - 1][1];
}

function reset(rig: Rig) {
  for (const [o, e] of rig.rest) o.rotation.copy(e);
  for (const [o, p] of rig.restPos) o.position.copy(p);
}

function R(rig: Rig, name: string, x = 0, y = 0, z = 0) {
  const o = rig.j[name];
  if (!o) return;
  o.rotation.x += x;
  o.rotation.y += y;
  o.rotation.z += z;
}

function P(rig: Rig, name: string, x = 0, y = 0, z = 0) {
  const o = rig.j[name];
  if (!o) return;
  o.position.x += x;
  o.position.y += y;
  o.position.z += z;
}

const GESTURES: Record<string, { name: string; dur: number }[]> = {
  p: [
    { name: "salute", dur: 1.6 },
    { name: "shieldCheck", dur: 1.4 },
    { name: "stretch", dur: 1.8 },
  ],
  n: [
    { name: "paw", dur: 1.4 },
    { name: "toss", dur: 1.2 },
    { name: "rear", dur: 1.8 },
    { name: "maceTwirl", dur: 1.4 },
  ],
  b: [
    { name: "bless", dur: 2.2 },
    { name: "staffTap", dur: 1.2 },
  ],
  r: [
    { name: "scan", dur: 2.6 },
    { name: "rumble", dur: 1.0 },
  ],
  q: [
    { name: "admire", dur: 2.0 },
    { name: "twirl", dur: 1.6 },
  ],
  k: [
    { name: "plant", dur: 1.4 },
    { name: "survey", dur: 2.6 },
  ],
};

/* ------------------------------------------------------------------ */
/* main per-frame update                                               */
/* ------------------------------------------------------------------ */

export function updateActor(a: Actor, dt: number) {
  const rig = a.rig;
  a.time += dt;

  // idle look-around
  a.nextLook -= dt;
  if (a.nextLook <= 0) {
    const r = Math.random();
    a.lookTarget = r < 0.3 ? 0 : (Math.random() * 2 - 1) * 0.95;
    a.lookPitchTarget = (Math.random() - 0.5) * 0.35;
    a.nextLook = 1.2 + Math.random() * 3.8;
  }
  if (a.busy || a.selected) {
    a.lookTarget = 0;
    a.lookPitchTarget = a.selected ? -0.15 : 0;
  }
  a.lookYaw = damp(a.lookYaw, a.lookTarget, 3, dt);
  a.lookPitch = damp(a.lookPitch, a.lookPitchTarget, 3, dt);
  a.ready = damp(a.ready, a.selected ? 1 : 0, 7, dt);
  a.locoAmt = damp(a.locoAmt, a.loco === "none" ? 0 : 1, 10, dt);

  // idle gestures
  if (a.idleGesture) {
    const g = GESTURES[a.kind].find((x) => x.name === a.idleGesture)!;
    a.idleT += dt / g.dur;
    if (a.idleT >= 1 || a.busy || a.action) {
      a.idleGesture = null;
      a.idleT = 0;
    }
  } else if (!a.busy && !a.action && !a.selected) {
    a.nextGesture -= dt;
    if (a.nextGesture <= 0) {
      const list = GESTURES[a.kind];
      a.idleGesture = list[Math.floor(Math.random() * list.length)].name;
      a.idleT = 0;
      a.nextGesture = 6 + Math.random() * 14;
    }
  }

  // root transform
  rig.root.position.copy(a.pos);
  rig.root.rotation.y = a.yaw + a.spin;
  const hover = a.ready * (0.07 + Math.sin(a.time * 3) * 0.015) + (a.hovered && !a.selected ? 0.025 : 0);
  const base = rig.extras.base as THREE.Object3D | undefined;
  if (base) base.visible = renderOpts.bases;
  rig.body.position.y = a.lift + hover + (base && !renderOpts.bases ? -BASE_TOP : 0) + (rig.extras.groundOffset as number | undefined ?? 0);
  rig.body.rotation.set(a.pitch, 0, a.roll);
  rig.body.scale.setScalar(a.scale * a.appear);

  reset(rig);
  ANIMATORS[a.kind](a, rig, dt);
}

type Animator = (a: Actor, rig: Rig, dt: number) => void;

/* ------------------------------------------------------------------ */
/* shared humanoid bits                                                */
/* ------------------------------------------------------------------ */

function humanoidIdle(a: Actor, rig: Rig, lookScale = 1) {
  const t = a.time;
  R(rig, "torso", Math.sin(t * 1.7) * 0.015, Math.sin(t * 0.5) * 0.03, 0);
  R(rig, "head", a.lookPitch, a.lookYaw * lookScale, Math.sin(t * 0.7) * 0.03);
  R(rig, "shoulderL", Math.sin(t * 1.7 + 1) * 0.02, 0, 0);
  R(rig, "shoulderR", Math.sin(t * 1.7 + 2) * 0.02, 0, 0);
}

function brace(a: Actor, rig: Rig) {
  if (a.action !== "brace") return;
  const k = a.actionT;
  R(rig, "torso", -0.18 * k, 0.15 * k, 0);
  R(rig, "head", -0.15 * k, 0, 0);
  R(rig, "shoulderL", -0.9 * k, 0, 0.2 * k);
  R(rig, "shoulderR", -0.4 * k, 0, 0);
  // jitter of fear
  R(rig, "torso", Math.sin(a.time * 38) * 0.02 * k, 0, 0);
}

function cheer(a: Actor, rig: Rig) {
  if (a.action !== "cheer") return;
  const k = a.actionT;
  const w = kf(k, [
    [0, 0],
    [0.15, 1],
    [0.85, 1],
    [1, 0],
  ]);
  const pump = Math.sin(k * Math.PI * 6) * 0.3;
  R(rig, "shoulderR", (-2.2 + pump) * w, 0, -0.3 * w);
  R(rig, "elbowR", 0.8 * w, 0, 0);
  R(rig, "torso", -0.1 * w, 0, 0);
  R(rig, "head", -0.25 * w, 0, 0);
}

/* ------------------------------------------------------------------ */
/* PAWN                                                                */
/* ------------------------------------------------------------------ */

const pawn: Animator = (a, rig) => {
  humanoidIdle(a, rig);
  const t = a.time;
  R(rig, "hips", 0, 0, Math.sin(t * 0.6) * 0.025);

  const w = a.locoAmt;
  if (w > 0.001) {
    const s = Math.sin(a.locoPhase);
    R(rig, "legL", s * 0.55 * w);
    R(rig, "legR", -s * 0.55 * w);
    R(rig, "kneeL", Math.max(0, -Math.cos(a.locoPhase)) * 0.7 * w);
    R(rig, "kneeR", Math.max(0, Math.cos(a.locoPhase)) * 0.7 * w);
    R(rig, "shoulderL", -s * 0.25 * w);
    R(rig, "shoulderR", s * 0.3 * w);
    R(rig, "torso", 0.08 * w, s * 0.08 * w, 0);
    P(rig, "hips", 0, Math.abs(Math.cos(a.locoPhase)) * 0.012 * w, 0);
  }

  // ready stance when selected
  const r = a.ready;
  R(rig, "shoulderR", -0.5 * r, 0, 0);
  R(rig, "elbowR", -0.3 * r, 0, 0);
  R(rig, "shoulderL", -0.45 * r, 0, 0);
  R(rig, "torso", 0.06 * r, -0.15 * r, 0);
  R(rig, "legL", -0.25 * r);
  R(rig, "legR", 0.2 * r);

  // idle gestures
  const g = a.idleGesture, k = a.idleT;
  if (g === "salute") {
    const e = kf(k, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
    R(rig, "shoulderR", -0.9 * e, 0, -0.2 * e);
    R(rig, "handR", 0, 0, 0.3 * e);
    R(rig, "head", -0.1 * e, 0, 0);
  } else if (g === "shieldCheck") {
    const e = kf(k, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]);
    R(rig, "shoulderL", -0.7 * e, 0, 0.15 * e);
    R(rig, "head", 0.15 * e, -0.5 * e, 0);
  } else if (g === "stretch") {
    const e = kf(k, [[0, 0], [0.4, 1], [0.6, 1], [1, 0]]);
    R(rig, "torso", -0.15 * e, 0, Math.sin(k * Math.PI * 2) * 0.15);
    R(rig, "head", -0.25 * e, 0, 0);
  }

  if (a.action === "attack") {
    const k = a.actionT;
    R(rig, "shoulderR", kf(k, [[0, 0], [0.38, -2.2], [0.5, -0.55], [0.75, -0.55], [1, 0]]), 0, kf(k, [[0, 0], [0.38, -0.2], [0.5, 0.25], [1, 0]]));
    R(rig, "elbowR", kf(k, [[0, 0], [0.38, 0.4], [0.5, 1.05], [0.75, 1.0], [1, 0]]));
    R(rig, "handR", kf(k, [[0, 0], [0.38, 0], [0.5, 1.5], [0.75, 1.4], [1, 0]]));
    R(rig, "torso", kf(k, [[0, 0], [0.38, -0.12], [0.5, 0.22], [0.75, 0.15], [1, 0]]), kf(k, [[0, 0], [0.38, 0.45], [0.5, -0.4], [0.8, -0.2], [1, 0]]));
    R(rig, "legL", kf(k, [[0, 0], [0.38, 0.1], [0.5, -0.5], [0.8, -0.4], [1, 0]]));
    R(rig, "legR", kf(k, [[0, 0], [0.5, 0.35], [0.8, 0.3], [1, 0]]));
    R(rig, "kneeR", kf(k, [[0, 0], [0.5, 0.4], [0.8, 0.3], [1, 0]]));
    R(rig, "shoulderL", kf(k, [[0, 0], [0.38, -0.4], [0.5, 0.2], [1, 0]]));
  }
  brace(a, rig);
  cheer(a, rig);
};

/* ------------------------------------------------------------------ */
/* KNIGHT                                                              */
/* ------------------------------------------------------------------ */

const knight: Animator = (a, rig) => {
  const t = a.time;
  // horse idle: breathing, ear/tail motion, head following the rider's gaze
  R(rig, "neck", Math.sin(t * 1.3) * 0.03, a.lookYaw * 0.25, 0);
  R(rig, "hhead", Math.sin(t * 1.3 + 0.6) * 0.05 + a.lookPitch * 0.5, a.lookYaw * 0.3, 0);
  R(rig, "tail", Math.sin(t * 0.9) * 0.08, Math.sin(t * 1.6) * 0.35, 0);
  R(rig, "torso", Math.sin(t * 1.5) * 0.015, Math.sin(t * 0.5) * 0.05, 0);
  R(rig, "head", a.lookPitch, a.lookYaw * 0.9, 0);
  R(rig, "shoulderR", Math.sin(t * 1.5) * 0.04, 0, 0);

  const w = a.locoAmt;
  if (w > 0.001) {
    const ph = a.locoPhase;
    const legs: [string, string, number, boolean][] = [
      ["legFL", "kneeFL", 0, true],
      ["legFR", "kneeFR", 0.5, true],
      ["legBL", "kneeBL", Math.PI, false],
      ["legBR", "kneeBR", Math.PI + 0.5, false],
    ];
    for (const [leg, knee, off, front] of legs) {
      const s = Math.sin(ph + off);
      R(rig, leg, s * (front ? 0.85 : 0.7) * w);
      const bend = Math.max(0, Math.sin(ph + off + Math.PI / 2));
      R(rig, knee, (front ? 1.3 : -0.9) * bend * w);
    }
    R(rig, "horse", Math.sin(ph) * 0.09 * w);
    R(rig, "neck", -Math.sin(ph) * 0.2 * w - 0.15 * w);
    R(rig, "tail", -0.6 * w, 0, 0);
    R(rig, "torso", 0.15 * w - Math.sin(ph) * 0.08 * w);
    R(rig, "shoulderR", -0.3 * w);
  }

  const r = a.ready;
  R(rig, "horse", -0.18 * r);
  R(rig, "legFL", -0.5 * r);
  R(rig, "kneeFL", 1.0 * r);
  R(rig, "neck", -0.2 * r);
  R(rig, "shoulderR", -0.3 * r);

  const g = a.idleGesture, k = a.idleT;
  if (g === "paw") {
    const e = kf(k, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
    const pump = Math.max(0, Math.sin(k * Math.PI * 4));
    R(rig, "legFR", -0.6 * e * pump);
    R(rig, "kneeFR", 1.4 * e * pump);
    R(rig, "neck", 0.15 * e);
  } else if (g === "toss") {
    const e = Math.sin(k * Math.PI);
    R(rig, "neck", -0.35 * e + Math.sin(k * Math.PI * 4) * 0.1);
    R(rig, "hhead", -0.3 * e);
  } else if (g === "rear") {
    const e = kf(k, [[0, 0], [0.35, 1], [0.6, 1], [0.85, 0], [1, 0]]);
    R(rig, "horse", -0.55 * e);
    R(rig, "legFL", -0.8 * e + Math.sin(k * 20) * 0.15 * e);
    R(rig, "legFR", -0.7 * e - Math.sin(k * 20) * 0.15 * e);
    R(rig, "kneeFL", 1.3 * e);
    R(rig, "kneeFR", 1.3 * e);
    R(rig, "neck", -0.25 * e);
    R(rig, "torso", 0.4 * e);
    R(rig, "shoulderR", -0.3 * e);
  } else if (g === "maceTwirl") {
    R(rig, "shoulderR", 0, Math.sin(k * Math.PI * 2) * 0.3, 0);
    R(rig, "handR", 0, k * Math.PI * 4, 0);
  }

  if (a.action === "attack") {
    const k = a.actionT;
    R(rig, "horse", kf(k, [[0, 0], [0.4, -0.75], [0.5, -0.78], [0.58, 0.1], [0.7, 0], [1, 0]]));
    for (const leg of ["legFL", "legFR"]) R(rig, leg, kf(k, [[0, 0], [0.4, -0.9], [0.5, -1.1], [0.58, 0.1], [1, 0]]) + (leg === "legFR" ? Math.sin(k * 30) * 0.15 * (k < 0.5 ? 1 : 0) : 0));
    for (const knee of ["kneeFL", "kneeFR"]) R(rig, knee, kf(k, [[0, 0], [0.4, 1.4], [0.5, 1.0], [0.58, 0], [1, 0]]));
    R(rig, "neck", kf(k, [[0, 0], [0.4, -0.35], [0.58, 0.35], [1, 0]]));
    R(rig, "torso", kf(k, [[0, 0], [0.4, 0.4], [0.58, -0.05], [0.7, 0.1], [1, 0]]));
    R(rig, "shoulderR", kf(k, [[0, 0], [0.4, -0.5], [0.56, 2.0], [0.75, 1.8], [1, 0]]));
    R(rig, "elbowR", kf(k, [[0, 0], [0.4, -0.3], [0.56, 0.4], [1, 0]]));
    R(rig, "tail", kf(k, [[0, 0], [0.4, 0.5], [0.6, -0.4], [1, 0]]));
  }
  if (a.action === "brace") {
    const k = a.actionT;
    R(rig, "horse", -0.3 * k);
    R(rig, "neck", -0.3 * k);
    R(rig, "legFL", -0.5 * k);
    R(rig, "kneeFL", 0.9 * k);
    R(rig, "torso", -0.15 * k);
    R(rig, "shoulderL", -0.6 * k);
  }
  if (a.action === "cheer") {
    const e = kf(a.actionT, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    R(rig, "horse", -0.45 * e);
    R(rig, "legFL", -0.8 * e);
    R(rig, "legFR", -0.6 * e);
    R(rig, "kneeFL", 1.2 * e);
    R(rig, "kneeFR", 1.2 * e);
    R(rig, "torso", 0.3 * e);
    R(rig, "shoulderR", Math.sin(a.actionT * Math.PI * 6) * 0.3 * e);
  }
};

/* ------------------------------------------------------------------ */
/* BISHOP                                                              */
/* ------------------------------------------------------------------ */

const bishop: Animator = (a, rig) => {
  humanoidIdle(a, rig, 0.8);
  const t = a.time;
  R(rig, "shoulderR", Math.sin(t * 0.9) * 0.05, 0, 0);
  R(rig, "elbowR", Math.sin(t * 0.9 + 0.5) * 0.05, 0, 0);

  const w = a.locoAmt;
  if (w > 0.001) {
    const s = Math.sin(a.locoPhase);
    R(rig, "torso", 0.06 * w, s * 0.05 * w, s * 0.04 * w);
    R(rig, "shoulderL", -0.15 * w + s * 0.1 * w);
  }
  const r = a.ready;
  R(rig, "shoulderL", -0.5 * r);
  R(rig, "shoulderR", -0.9 * r);
  R(rig, "elbowR", 0.6 * r);
  R(rig, "head", -0.1 * r);

  const g = a.idleGesture, k = a.idleT;
  if (g === "bless") {
    const e = kf(k, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
    const phase = k * 4;
    const down = phase > 1 && phase < 2 ? 1 : 0;
    const side = phase > 2 && phase < 3 ? Math.sin((phase - 2) * Math.PI * 2) : 0;
    R(rig, "shoulderR", (-0.6 + down * 0.5) * e, 0, side * 0.25 * e);
    R(rig, "head", 0.1 * e, 0, 0);
  } else if (g === "staffTap") {
    const e = Math.max(0, Math.sin(k * Math.PI * 2));
    R(rig, "shoulderL", -0.25 * e);
    R(rig, "elbowL", 0.1 * e);
  }

  if (a.action === "attack") {
    const k = a.actionT;
    const up = kf(k, [[0, 0], [0.18, 1], [0.82, 1], [1, 0]]);
    R(rig, "shoulderL", -1.15 * up, 0, -0.1 * up);
    R(rig, "elbowL", 0.55 * up);
    R(rig, "shoulderR", -1.6 * up + Math.sin(a.time * 9) * 0.05 * up, 0, -0.3 * up);
    R(rig, "elbowR", 0.9 * up);
    R(rig, "torso", -0.12 * up, 0.12 * up, 0);
    R(rig, "head", -0.2 * up, 0, 0);
  }
  brace(a, rig);
  if (a.action === "cheer") {
    const e = kf(a.actionT, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    R(rig, "shoulderL", -1.4 * e);
    R(rig, "shoulderR", -1.4 * e, 0, -0.4 * e);
    R(rig, "head", -0.25 * e);
  }
};

/* ------------------------------------------------------------------ */
/* ROOK                                                                */
/* ------------------------------------------------------------------ */

const rook: Animator = (a, rig) => {
  const t = a.time;
  let atk = 0;
  if (a.action === "attack") atk = kf(a.actionT, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
  R(rig, "top", 0, a.lookYaw * 1.4 * (1 - atk) + Math.sin(t * 0.3) * 0.1 * (1 - atk), 0);
  R(rig, "tower", 0, 0, Math.sin(t * 1.1) * 0.006);

  const w = a.locoAmt;
  if (w > 0.001) {
    const s = Math.sin(a.locoPhase);
    R(rig, "tower", 0.05 * w, 0, s * 0.09 * w);
  }
  const r = a.ready;
  R(rig, "tower", 0, 0, Math.sin(t * 14) * 0.01 * r);
  P(rig, "cannon", 0, 0.06 * r, 0);

  const g = a.idleGesture, k = a.idleT;
  if (g === "scan") {
    R(rig, "top", 0, Math.sin(k * Math.PI * 2) * 1.2, 0);
  } else if (g === "rumble") {
    R(rig, "tower", 0, 0, Math.sin(k * 60) * 0.025 * Math.sin(k * Math.PI));
  }

  if (a.action === "attack") {
    const k = a.actionT;
    P(rig, "cannon", 0, kf(k, [[0, 0], [0.22, 0.17], [0.85, 0.17], [1, 0]]), kf(k, [[0.35, 0], [0.37, -0.05], [0.6, 0]]));
    R(rig, "cannon", kf(k, [[0, 0], [0.22, -0.2], [0.85, -0.2], [1, 0]]));
    const kick = kf(k, [[0.34, 0], [0.37, 1], [0.55, 0]]);
    R(rig, "tower", -0.06 * kick);
    rig.j.tower.scale.set(1 + 0.03 * kick, 1 - 0.05 * kick, 1 + 0.03 * kick);
  } else {
    rig.j.tower.scale.set(1, 1, 1);
  }
  if (a.action === "brace") {
    R(rig, "tower", -0.05 * a.actionT, 0, Math.sin(t * 40) * 0.03 * a.actionT);
  }
  if (a.action === "cheer") {
    const e = Math.sin(a.actionT * Math.PI);
    R(rig, "top", 0, a.actionT * Math.PI * 4, 0);
    P(rig, "cannon", 0, 0.15 * e, 0);
  }

  // waving banner
  const flag = rig.extras.flag as { mesh: THREE.Mesh; base: Float32Array } | undefined;
  if (flag) {
    const pos = flag.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const speed = 5 + w * 6;
    for (let i = 0; i < arr.length; i += 3) {
      const x = flag.base[i];
      const y = flag.base[i + 1];
      const amt = x / 0.17;
      arr[i + 2] = flag.base[i + 2] + Math.sin(x * 38 - t * speed + y * 8) * 0.014 * amt;
      arr[i + 1] = y - amt * amt * 0.01 * (1 - w);
    }
    pos.needsUpdate = true;
    flag.mesh.geometry.computeVertexNormals();
  }
};

/* ------------------------------------------------------------------ */
/* QUEEN                                                               */
/* ------------------------------------------------------------------ */

const queen: Animator = (a, rig) => {
  humanoidIdle(a, rig, 0.85);
  const t = a.time;
  R(rig, "gown", 0, Math.sin(t * 0.8) * 0.06, 0);
  R(rig, "shoulderL", 0, 0, Math.sin(t * 1.1) * 0.08);
  R(rig, "elbowL", Math.sin(t * 1.1 + 1) * 0.1, 0, 0);

  const w = a.locoAmt;
  if (w > 0.001) {
    R(rig, "torso", 0.1 * w, 0, 0);
    R(rig, "shoulderL", -0.2 * w, 0, 0.6 * w);
    R(rig, "shoulderR", -0.2 * w, 0, -0.5 * w);
    R(rig, "gown", 0, Math.sin(a.locoPhase) * 0.2 * w, 0);
    rig.j.gown.scale.set(1 + 0.07 * w, 1, 1 + 0.07 * w);
  } else rig.j.gown.scale.set(1, 1, 1);

  const r = a.ready;
  R(rig, "shoulderR", -0.7 * r);
  R(rig, "shoulderL", -0.4 * r, 0, 0.3 * r);
  R(rig, "head", -0.1 * r);

  const g = a.idleGesture, k = a.idleT;
  if (g === "admire") {
    const e = kf(k, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
    R(rig, "shoulderR", -0.9 * e, 0, 0);
    R(rig, "head", -0.25 * e, -0.35 * e, 0.1 * e);
  } else if (g === "twirl") {
    R(rig, "gown", 0, Math.sin(k * Math.PI) * 0.6, 0);
    R(rig, "torso", 0, Math.sin(k * Math.PI) * 0.3, 0);
    R(rig, "shoulderL", 0, 0, 0.6 * Math.sin(k * Math.PI));
  }

  if (a.action === "attack") {
    const k = a.actionT;
    const up = kf(k, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]);
    const thrust = kf(k, [[0.4, 0], [0.5, 1], [0.7, 1], [0.85, 0]]);
    R(rig, "shoulderR", -1.7 * up + 0.5 * thrust, 0, -0.2 * up);
    R(rig, "elbowR", 0.7 * up - 0.3 * thrust);
    R(rig, "shoulderL", -2.0 * up, 0, 0.5 * up);
    R(rig, "elbowL", 0.3 * up);
    R(rig, "torso", -0.15 * up + 0.2 * thrust, 0, 0);
    R(rig, "head", -0.2 * up, 0, 0);
    rig.j.gown.scale.set(1 + 0.1 * up, 1, 1 + 0.1 * up);
  }
  brace(a, rig);
  if (a.action === "cheer") {
    const e = kf(a.actionT, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    R(rig, "shoulderR", -2.0 * e);
    R(rig, "shoulderL", -0.6 * e, 0, 0.6 * e);
    R(rig, "gown", 0, Math.sin(a.actionT * Math.PI * 4) * 0.4, 0);
  }
};

/* ------------------------------------------------------------------ */
/* KING                                                                */
/* ------------------------------------------------------------------ */

const king: Animator = (a, rig) => {
  humanoidIdle(a, rig, 0.7);
  const w = a.locoAmt;
  if (w > 0.001) {
    const s = Math.sin(a.locoPhase);
    R(rig, "torso", 0.05 * w, s * 0.06 * w, s * 0.05 * w);
    R(rig, "shoulderR", -0.25 * w);
    R(rig, "shoulderL", -0.25 * w);
  }
  const r = a.ready;
  R(rig, "shoulderR", -0.6 * r);
  R(rig, "shoulderL", -0.6 * r);
  R(rig, "torso", -0.06 * r);
  R(rig, "head", -0.15 * r);

  const g = a.idleGesture, k = a.idleT;
  if (g === "plant") {
    const e = kf(k, [[0, 0], [0.4, 1], [0.55, 0], [1, 0]]);
    R(rig, "shoulderR", -0.35 * e);
    R(rig, "shoulderL", -0.35 * e);
    P(rig, "greatsword", 0, 0.05 * e, 0.02 * e);
  } else if (g === "survey") {
    R(rig, "head", 0, Math.sin(k * Math.PI * 2) * 0.8, 0);
    R(rig, "torso", 0, Math.sin(k * Math.PI * 2) * 0.2, 0);
  }

  if (a.action === "attack") {
    const k = a.actionT;
    const sh = kf(k, [[0, 0], [0.4, -2.5], [0.48, -2.6], [0.58, -0.35], [0.78, -0.4], [1, 0]]);
    R(rig, "shoulderR", sh, 0, kf(k, [[0, 0], [0.4, 0.2], [1, 0]]));
    R(rig, "shoulderL", sh, 0, kf(k, [[0, 0], [0.4, -0.2], [1, 0]]));
    R(rig, "elbowR", kf(k, [[0, 0], [0.4, 0.4], [0.58, 0.5], [1, 0]]));
    R(rig, "elbowL", kf(k, [[0, 0], [0.4, 0.4], [0.58, 0.5], [1, 0]]));
    R(rig, "torso", kf(k, [[0, 0], [0.4, -0.22], [0.58, 0.32], [0.78, 0.3], [1, 0]]));
    R(rig, "head", kf(k, [[0, 0], [0.4, -0.2], [0.58, 0.2], [1, 0]]));
    // greatsword: rest points down (x = PI); raised overhead; slammed forward
    R(rig, "greatsword", kf(k, [[0, 0], [0.4, -3.5], [0.48, -3.6], [0.58, -1.2], [0.78, -1.25], [1, 0]]));
    P(rig, "greatsword", 0, kf(k, [[0, 0], [0.4, 0.33], [0.48, 0.35], [0.58, 0.08], [0.78, 0.08], [1, 0]]), kf(k, [[0, 0], [0.4, -0.08], [0.58, 0.12], [0.78, 0.12], [1, 0]]));
  }
  brace(a, rig);
  if (a.action === "cheer") {
    const e = kf(a.actionT, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    R(rig, "shoulderR", -2.5 * e);
    R(rig, "shoulderL", -2.5 * e);
    R(rig, "elbowR", 0.5 * e);
    R(rig, "elbowL", 0.5 * e);
    R(rig, "greatsword", -3.4 * e);
    P(rig, "greatsword", 0, 0.36 * e, -0.06 * e);
    R(rig, "head", -0.3 * e);
  }
};

const ANIMATORS: Record<string, Animator> = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };
