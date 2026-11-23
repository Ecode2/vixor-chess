import * as THREE from "three";
import type { Rig } from "../pieces/kit";
import type { PieceSymbol, Color } from "chess.js";

export type Loco = "none" | "walk" | "gallop" | "glide" | "stomp" | "float";

/**
 * Mutable animation state for one piece. The director writes to it, the
 * piece's per-frame animator reads from it. Kept out of React on purpose.
 */
export interface Actor {
  id: string;
  kind: PieceSymbol;
  color: Color;
  rig: Rig;
  pos: THREE.Vector3;
  yaw: number;
  /** Extra vertical offset of the body (jumps, levitation). */
  lift: number;
  pitch: number;
  roll: number;
  /** Additional yaw spin on top of yaw (twirls). */
  spin: number;
  scale: number;
  loco: Loco;
  locoPhase: number;
  locoAmt: number;
  action: string | null;
  actionT: number;
  /** 0..1 smoothed "ready" stance while selected. */
  ready: number;
  selected: boolean;
  hovered: boolean;
  busy: boolean;
  dead: boolean;
  lookYaw: number;
  lookPitch: number;
  lookTarget: number;
  lookPitchTarget: number;
  nextLook: number;
  /** Random idle gesture scheduling. */
  idleGesture: string | null;
  idleT: number;
  nextGesture: number;
  seed: number;
  time: number;
  /** 0..1 materialise-in amount (promotion). */
  appear: number;
}

export const actors = new Map<string, Actor>();

/** Squares where a freshly mounted piece should materialise (promotion). */
export const spawnFx = new Set<string>();

export function createActor(id: string, kind: PieceSymbol, color: Color, rig: Rig): Actor {
  const seed = Math.random() * 1000;
  return {
    id,
    kind,
    color,
    rig,
    pos: new THREE.Vector3(),
    yaw: 0,
    lift: 0,
    pitch: 0,
    roll: 0,
    spin: 0,
    scale: 1,
    loco: "none",
    locoPhase: 0,
    locoAmt: 0,
    action: null,
    actionT: 0,
    ready: 0,
    selected: false,
    hovered: false,
    busy: false,
    dead: false,
    lookYaw: 0,
    lookPitch: 0,
    lookTarget: 0,
    lookPitchTarget: 0,
    nextLook: 1 + Math.random() * 3,
    idleGesture: null,
    idleT: 0,
    nextGesture: 4 + Math.random() * 10,
    seed,
    time: seed,
    appear: 1,
  };
}
