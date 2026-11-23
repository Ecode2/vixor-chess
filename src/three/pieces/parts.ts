import * as THREE from "three";
import { Builder, geo, shapes } from "./kit";
import type { Slot } from "./materials";

export const BASE_TOP = 0.14;

/** Euler rotation that turns +Y to point along the given direction. */
export function dirEuler(x: number, y: number, z: number): [number, number, number] {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

/** Tiered plinth with a gilded bead ring and studs. Every piece stands on one. */
export function plinth(b: Builder, R: number) {
  const P = b.body;
  b.mesh(
    P,
    geo.lathe(
      [
        [0, 0],
        [R, 0],
        [R, 0.03],
        [R - 0.008, 0.04],
        [R - 0.03, 0.044],
        [R - 0.03, 0.07],
        [R - 0.04, 0.078],
        [R - 0.055, 0.09],
        [R - 0.062, 0.1],
        [R - 0.062, 0.124],
        [R - 0.075, 0.134],
        [R - 0.09, BASE_TOP],
        [0, BASE_TOP],
      ],
      56,
    ),
    "body",
  );
  b.mesh(P, geo.torus(R - 0.028, 0.011, 8, 56), "accent", { p: [0, 0.057, 0], r: [Math.PI / 2, 0, 0] });
  b.mesh(P, geo.torus(R - 0.004, 0.006, 6, 56), "accent", { p: [0, 0.035, 0], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.mesh(P, geo.sphere(0.012, 8, 6), "accent", { p: [Math.sin(a) * (R - 0.058), 0.112, Math.cos(a) * (R - 0.058)] });
  }
}

/**
 * Figure group: everything inside uses absolute piece coordinates (y from
 * the board), but gets uniformly scaled about the top of the plinth.
 */
export function figure(b: Builder, s: number) {
  const outer = b.group(b.body, [0, BASE_TOP, 0], [0, 0, 0], s);
  return b.group(outer, [0, -BASE_TOP, 0]);
}

export interface ArmOpts {
  upperR?: number;
  foreR?: number;
  upperLen?: number;
  foreLen?: number;
  upper?: Slot;
  fore?: Slot;
  hand?: Slot;
  pauldron?: Slot | null;
  sleeve?: Slot | null;
}

/** Shoulder -> elbow -> hand chain. Arms hang along -Y in rest. */
export function arm(b: Builder, parent: THREE.Object3D, side: "R" | "L", p: [number, number, number], o: ArmOpts = {}) {
  const upperR = o.upperR ?? 0.024;
  const foreR = o.foreR ?? 0.022;
  const ul = o.upperLen ?? 0.07;
  const fl = o.foreLen ?? 0.065;
  const shoulder = b.joint(`shoulder${side}`, parent, p);
  if (o.pauldron !== null) {
    b.mesh(shoulder, geo.sphere(upperR * 1.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), o.pauldron ?? "metal", {
      p: [0, 0.0, 0],
      s: [1.15, 0.75, 1],
    });
    b.mesh(shoulder, geo.torus(upperR * 1.5, upperR * 0.18, 6, 20), "accent", { r: [Math.PI / 2, 0, 0], s: [1.15, 1, 1] });
  }
  b.mesh(shoulder, geo.capsule(upperR, ul), o.upper ?? "body", { p: [0, -ul / 2 - 0.012, 0] });
  if (o.sleeve) {
    b.mesh(
      shoulder,
      geo.lathe(
        [
          [upperR * 1.3, 0],
          [upperR * 1.6, -ul * 0.6],
          [upperR * 2.3, -ul - 0.02],
          [upperR * 2.2, -ul - 0.025],
        ],
        18,
      ),
      o.sleeve,
    );
  }
  const elbow = b.joint(`elbow${side}`, shoulder, [0, -ul - 0.03, 0]);
  b.mesh(elbow, geo.sphere(foreR * 1.05, 10, 8), o.fore ?? "body");
  b.mesh(elbow, geo.capsule(foreR, fl), o.fore ?? "body", { p: [0, -fl / 2 - 0.008, 0] });
  const hand = b.joint(`hand${side}`, elbow, [0, -fl - 0.03, 0]);
  b.mesh(hand, geo.sphere(foreR * 1.12, 12, 10), o.hand ?? "metal", { s: [1, 1.15, 0.85] });
  return { shoulder, elbow, hand };
}

/** Arming sword built along +Y with the grip centred on the origin. */
export function sword(b: Builder, parent: THREE.Object3D, len = 0.2, width = 0.024, tipAnchor = "weaponTip") {
  const g = b.group(parent);
  b.mesh(g, geo.cyl(0.008, 0.009, 0.05, 10), "dark");
  b.mesh(g, geo.sphere(0.013, 10, 8), "accent", { p: [0, -0.031, 0] });
  b.mesh(g, geo.box(width * 3.2, 0.011, 0.014), "accent", { p: [0, 0.03, 0] });
  b.mesh(g, geo.sphere(0.008, 8, 6), "accent", { p: [width * 1.6, 0.03, 0] });
  b.mesh(g, geo.sphere(0.008, 8, 6), "accent", { p: [-width * 1.6, 0.03, 0] });
  b.mesh(g, geo.extrude(shapes.blade(len, width), 0.004, 0.0015, 4), "metal", { p: [0, 0.036, 0] });
  // fuller
  b.mesh(g, geo.box(width * 0.18, len * 0.65, 0.0075), "dark", { p: [0, 0.036 + len * 0.36, 0] });
  b.anchor(tipAnchor, g, [0, 0.036 + len, 0]);
  return g;
}

/** Flanged mace along +Y. */
export function mace(b: Builder, parent: THREE.Object3D) {
  const g = b.group(parent);
  b.mesh(g, geo.cyl(0.008, 0.008, 0.2, 10), "dark", { p: [0, 0.06, 0] });
  b.mesh(g, geo.sphere(0.012, 8, 6), "accent", { p: [0, -0.042, 0] });
  b.mesh(g, geo.cyl(0.012, 0.012, 0.02, 10), "accent", { p: [0, 0.15, 0] });
  b.mesh(g, geo.ico(0.03, 1), "metal", { p: [0, 0.185, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.mesh(g, geo.cone(0.009, 0.03, 6), "metal", {
      p: [Math.sin(a) * 0.03, 0.185, Math.cos(a) * 0.03],
      r: dirEuler(Math.sin(a), 0, Math.cos(a)),
    });
  }
  b.mesh(g, geo.cone(0.01, 0.035, 6), "metal", { p: [0, 0.225, 0] });
  b.anchor("weaponTip", g, [0, 0.2, 0]);
  return g;
}

/** Heater shield facing +Z, centred on origin. */
export function shield(b: Builder, parent: THREE.Object3D, w = 0.075, h = 0.1, emblem: "chevron" | "star" | "cross" = "chevron") {
  const g = b.group(parent);
  b.mesh(g, geo.extrude(shapes.heater(w * 1.1, h * 1.08), 0.008, 0.002), "accent", { p: [0, 0, -0.004] });
  b.mesh(g, geo.extrude(shapes.heater(w, h), 0.012, 0.003), "cloth");
  const e =
    emblem === "chevron"
      ? shapes.chevron(w * 0.55, h * 0.45, w * 0.22)
      : emblem === "star"
        ? shapes.star(w * 0.5, w * 0.22, 6)
        : shapes.cross(w * 0.9, h * 1.1, w * 0.22, 0.2);
  b.mesh(g, geo.extrude(e, 0.006, 0.0015), "accent", { p: [0, emblem === "chevron" ? h * 0.12 : 0, 0.01] });
  // rivets
  for (const [x, y] of [
    [-w * 0.8, h * 0.85],
    [w * 0.8, h * 0.85],
    [0, -h * 0.75],
  ])
    b.mesh(g, geo.sphere(0.005, 6, 4), "accent", { p: [x, y, 0.009] });
  return g;
}

/** Simple sculpted face: nose, brow, eyes. Origin is head centre, facing +Z. */
export function face(b: Builder, head: THREE.Object3D, r: number, eyes: "body" | "glow" = "body") {
  // sculpted, statue-like features: brow ridge, nose, cheekbones, sunken eyes
  b.mesh(head, geo.cone(r * 0.17, r * 0.42, 10), "body", { p: [0, -r * 0.08, r * 0.97], r: [Math.PI / 2 - 0.3, 0, 0] });
  b.mesh(head, geo.capsule(r * 0.09, r * 0.75, 4, 8), "body", { p: [0, r * 0.24, r * 0.83], r: [0, 0, Math.PI / 2] });
  for (const x of [-1, 1]) {
    b.mesh(head, geo.sphere(r * 0.2, 10, 8), "body", { p: [x * r * 0.48, -r * 0.18, r * 0.72], s: [1, 0.7, 0.8] });
    b.mesh(head, geo.sphere(r * 0.09, 8, 6), eyes, { p: [x * r * 0.33, r * 0.08, r * 0.86], s: [1.3, 0.8, 0.6] });
  }
  b.mesh(head, geo.sphere(r * 0.32, 12, 8), "body", { p: [0, -r * 0.62, r * 0.62], s: [1, 0.75, 0.8] }); // chin
}

export function chainCoif(b: Builder, head: THREE.Object3D, r: number) {
  // mail hood with an opening for the face
  b.mesh(
    head,
    geo.lathe(
      [
        [r * 1.06, r * 0.35],
        [r * 1.1, -r * 0.3],
        [r * 1.0, -r * 0.85],
        [r * 1.35, -r * 1.25],
        [r * 1.32, -r * 1.32],
      ],
      24,
      0.95,
      Math.PI * 2 - 1.9,
    ),
    "metal",
  );
}

/** Euler that rotates an arm (hanging along -Y) to point along a direction. */
export function aimDown(x: number, y: number, z: number): [number, number, number] {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(x, y, z).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}
