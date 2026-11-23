import * as THREE from "three";
import { Builder, geo, optimize, shapes } from "../pieces/kit";
import type { Side } from "../pieces/materials";
import { mace, shield, sword } from "../pieces/parts";
import { crownRing } from "../pieces/models";
import type { BuiltinProp } from "./manifest";

/**
 * Built-in props in "board units" (1 = one square). Each returns a group
 * whose origin is the attachment point (grip for weapons, brow for crowns),
 * plus named anchors for effects.
 */
export function buildProp(kind: BuiltinProp, side: Side): { group: THREE.Group; anchors: Record<string, THREE.Object3D> } {
  const b = new Builder("p", side);
  const g = new THREE.Group();
  const U = 1.3; // procedural parts were authored at ~1.3x figure scale
  const inner = b.group(g, [0, 0, 0], [0, 0, 0], U);
  const PI = Math.PI;
  switch (kind) {
    case "sword":
      sword(b, inner, 0.22, 0.024);
      break;
    case "greatsword":
      sword(b, inner, 0.44, 0.03);
      break;
    case "mace":
      mace(b, inner);
      break;
    case "shield":
      shield(b, inner, 0.08, 0.105, "chevron");
      break;
    case "crown":
      crownRing(b, inner, 0.05, 0.03, 8, 0.042);
      b.anchor("crown", inner, [0, 0.08, 0]);
      break;
    case "kingCrown": {
      b.mesh(inner, geo.sphere(0.05, 18, 10, 0, PI * 2, 0, PI * 0.5), "cloth", { p: [0, 0.015, 0] });
      crownRing(b, inner, 0.055, 0.04, 4, 0.032);
      for (const rot of [0, PI / 2]) b.mesh(inner, geo.torus(0.053, 0.005, 6, 24, PI), "accent", { p: [0, 0.035, 0], r: [0, rot, 0], s: [1, 1.2, 1] });
      b.mesh(inner, geo.sphere(0.014, 12, 10), "accent", { p: [0, 0.1, 0] });
      b.mesh(inner, geo.extrude(shapes.cross(0.035, 0.05, 0.011, 0.15), 0.008, 0.0015), "accent", { p: [0, 0.132, 0] });
      b.anchor("crown", inner, [0, 0.13, 0]);
      break;
    }
    case "mitre": {
      b.mesh(inner, geo.cyl(0.056, 0.054, 0.03, 24), "accent", { p: [0, 0.012, 0] });
      for (const z of [-1, 1])
        b.mesh(inner, geo.extrude(shapes.mitre(0.056, 0.17), 0.016, 0.003), "body", { p: [0, 0.01, z * 0.012], r: [z * -0.07, 0, 0] });
      b.mesh(inner, geo.extrude(shapes.cross(0.045, 0.06, 0.012, 0.2), 0.005, 0.001), "accent", { p: [0, 0.1, 0.025], r: [-0.07, 0, 0] });
      b.mesh(inner, geo.sphere(0.006, 8, 6), "glow", { p: [0, 0.035, 0.028] });
      break;
    }
    case "helm": {
      b.mesh(inner, geo.cyl(0.058, 0.06, 0.11, 24), "metal");
      b.mesh(inner, geo.sphere(0.058, 24, 8, 0, PI * 2, 0, PI * 0.3), "metal", { p: [0, 0.04, 0] });
      b.mesh(inner, geo.box(0.09, 0.009, 0.02), "dark", { p: [0, 0.012, 0.052] });
      b.mesh(inner, geo.box(0.075, 0.005, 0.006), "glow", { p: [0, 0.012, 0.054] });
      b.mesh(inner, geo.box(0.012, 0.1, 0.012), "accent", { p: [0, -0.005, 0.058] });
      break;
    }
    case "crosier": {
      b.mesh(inner, geo.cyl(0.008, 0.008, 0.8, 10), "accent", { p: [0, 0.05, 0] });
      b.mesh(inner, geo.sphere(0.018, 12, 10), "accent", { p: [0, 0.42, 0] });
      const pts: THREE.Vector3[] = [new THREE.Vector3(0, 0.44, 0)];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, a = t * PI * 1.6, r = 0.055 * (1 - t * 0.55);
        pts.push(new THREE.Vector3(0, 0.49 + Math.sin(a) * r, -Math.cos(a) * r + 0.055));
      }
      b.mesh(inner, geo.tube(pts, 0.008, 48, 8), "accent");
      b.mesh(inner, geo.sphere(0.014, 12, 10), "glow", { p: [0, 0.495, 0.055] });
      b.anchor("staffTop", inner, [0, 0.495, 0.055]);
      break;
    }
    case "sceptre": {
      b.mesh(inner, geo.cyl(0.007, 0.006, 0.32, 10), "accent", { p: [0, 0.07, 0] });
      b.mesh(inner, geo.sphere(0.022, 16, 12), "glow", { p: [0, 0.24, 0] });
      b.mesh(inner, geo.cone(0.008, 0.06, 8), "accent", { p: [0, 0.29, 0] });
      b.anchor("sceptreTop", inner, [0, 0.24, 0]);
      break;
    }
  }
  optimize(g);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group: g, anchors: b.anchors };
}

/** Sensible attachment defaults for Mixamo-style skeletons (all overridable in the manifest). */
export const PROP_DEFAULTS: Record<BuiltinProp, { bone: string; position: [number, number, number]; rotation: [number, number, number] }> = {
  // Mixamo hand bones point +Y along the fingers: blades extend past the fist,
  // staffs are flipped so they rise upward through a hanging hand.
  sword: { bone: "RightHand", position: [0, 0.06, 0.01], rotation: [0, 0, 0] },
  greatsword: { bone: "RightHand", position: [0, 0.06, 0.01], rotation: [0, 0, 0] },
  mace: { bone: "RightHand", position: [0, 0.06, 0.01], rotation: [0, 0, 0] },
  sceptre: { bone: "RightHand", position: [0, 0.06, 0.01], rotation: [180, 0, 0] },
  crosier: { bone: "LeftHand", position: [0, 0.06, 0.01], rotation: [180, 0, 0] },
  shield: { bone: "LeftForeArm", position: [0.05, 0.12, 0], rotation: [0, 90, 0] },
  crown: { bone: "Head", position: [0, 0.16, 0.01], rotation: [0, 0, 0] },
  kingCrown: { bone: "Head", position: [0, 0.16, 0.01], rotation: [0, 0, 0] },
  mitre: { bone: "Head", position: [0, 0.15, 0], rotation: [0, 0, 0] },
  helm: { bone: "Head", position: [0, 0.09, 0.01], rotation: [0, 0, 0] },
};
