import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { materials, type MaterialSet, type Side, type Slot } from "./materials";
import type { PieceSymbol } from "chess.js";

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */

export interface Rig {
  kind: PieceSymbol;
  color: Side;
  /** Placed on the board; position + yaw. */
  root: THREE.Group;
  /** Child of root: lift, lean, squash. */
  body: THREE.Group;
  /** Named joints the animators drive. */
  j: Record<string, THREE.Object3D>;
  /** Rest rotations of joints, captured after build. */
  rest: Map<THREE.Object3D, THREE.Euler>;
  restPos: Map<THREE.Object3D, THREE.Vector3>;
  /** Named anchor points for effects (sword tip, staff top, muzzle...). */
  anchors: Record<string, THREE.Object3D>;
  height: number;
  /** Things that need per-frame custom updates (flag cloth etc). */
  extras: Record<string, unknown>;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const V2 = (x: number, y: number) => new THREE.Vector2(x, y);

export const geo = {
  lathe(profile: [number, number][], segs = 40, phiStart = 0, phiLength = Math.PI * 2) {
    return new THREE.LatheGeometry(profile.map(([r, y]) => V2(Math.max(r, 0.0001), y)), segs, phiStart, phiLength);
  },
  cyl(rt: number, rb: number, h: number, segs = 24, open = false) {
    return new THREE.CylinderGeometry(rt, rb, h, segs, 1, open);
  },
  sphere(r: number, ws = 24, hs = 16, phiStart = 0, phiLen = Math.PI * 2, thetaStart = 0, thetaLen = Math.PI) {
    return new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, thetaStart, thetaLen);
  },
  capsule(r: number, len: number, cap = 6, rad = 14) {
    return new THREE.CapsuleGeometry(r, len, cap, rad);
  },
  box(w: number, h: number, d: number) {
    return new THREE.BoxGeometry(w, h, d);
  },
  torus(R: number, r: number, rs = 10, ts = 40, arc = Math.PI * 2) {
    return new THREE.TorusGeometry(R, r, rs, ts, arc);
  },
  cone(r: number, h: number, segs = 16) {
    return new THREE.ConeGeometry(r, h, segs);
  },
  ico(r: number, detail = 0) {
    return new THREE.IcosahedronGeometry(r, detail);
  },
  extrude(shape: THREE.Shape, depth: number, bevel = 0.004, curveSegments = 12) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  },
  tube(points: THREE.Vector3[], r: number, segs = 48, radial = 8) {
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, radial, false);
  },
};

/** Re-map a lathe's UVs so V follows world height (for tiling brick textures). */
export function uvByHeight(g: THREE.BufferGeometry, uRepeat: number, vPerUnit: number) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uRepeat, pos.getY(i) * vPerUnit);
  }
  uv.needsUpdate = true;
  return g;
}

/* Shapes ------------------------------------------------------------ */

export const shapes = {
  heater(w: number, h: number) {
    const s = new THREE.Shape();
    s.moveTo(-w, h);
    s.lineTo(w, h);
    s.lineTo(w, h * 0.15);
    s.quadraticCurveTo(w * 0.95, -h * 0.6, 0, -h);
    s.quadraticCurveTo(-w * 0.95, -h * 0.6, -w, h * 0.15);
    s.lineTo(-w, h);
    return s;
  },
  chevron(w: number, h: number, t: number) {
    // Vixor "V"
    const s = new THREE.Shape();
    s.moveTo(-w, h);
    s.lineTo(-w + t, h);
    s.lineTo(0, -h + t * 1.6);
    s.lineTo(w - t, h);
    s.lineTo(w, h);
    s.lineTo(0, -h);
    s.lineTo(-w, h);
    return s;
  },
  star(rOuter: number, rInner: number, points = 6) {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  },
  cross(w: number, h: number, t: number, armY = 0.25) {
    const s = new THREE.Shape();
    const ay = h * armY;
    s.moveTo(-t / 2, -h / 2);
    s.lineTo(t / 2, -h / 2);
    s.lineTo(t / 2, ay - t / 2);
    s.lineTo(w / 2, ay - t / 2);
    s.lineTo(w / 2, ay + t / 2);
    s.lineTo(t / 2, ay + t / 2);
    s.lineTo(t / 2, h / 2);
    s.lineTo(-t / 2, h / 2);
    s.lineTo(-t / 2, ay + t / 2);
    s.lineTo(-w / 2, ay + t / 2);
    s.lineTo(-w / 2, ay - t / 2);
    s.lineTo(-t / 2, ay - t / 2);
    s.closePath();
    return s;
  },
  mitre(w: number, h: number) {
    const s = new THREE.Shape();
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    s.bezierCurveTo(w * 1.15, h * 0.45, w * 0.5, h * 0.8, 0, h);
    s.bezierCurveTo(-w * 0.5, h * 0.8, -w * 1.15, h * 0.45, -w, 0);
    return s;
  },
  blade(len: number, w: number) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w * 0.42, len * 0.82);
    s.lineTo(0, len);
    s.lineTo(-w * 0.42, len * 0.82);
    s.closePath();
    return s;
  },
  arch(w: number, h: number) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    return s;
  },
  flag(w: number, h: number) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(w, 0);
    s.lineTo(w * 0.8, h / 2);
    s.lineTo(w, h);
    s.lineTo(0, h);
    s.closePath();
    return s;
  },
};

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

type Vec3 = [number, number, number];

export interface MeshOpts {
  p?: Vec3;
  r?: Vec3;
  s?: Vec3 | number;
  /** Keep as standalone mesh (don't merge). */
  keep?: boolean;
  name?: string;
}

export class Builder {
  get m(): MaterialSet {
    return materials(this.side);
  }
  readonly j: Record<string, THREE.Object3D> = {};
  readonly anchors: Record<string, THREE.Object3D> = {};
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly extras: Record<string, unknown> = {};

  constructor(readonly kind: PieceSymbol, readonly side: Side) {
    this.root.add(this.body);
    this.root.name = `${side}${kind}`;
  }

  mesh(parent: THREE.Object3D, g: THREE.BufferGeometry, slot: Slot, o: MeshOpts = {}) {
    const mesh = new THREE.Mesh(g, this.m[slot]);
    if (o.p) mesh.position.set(...o.p);
    if (o.r) mesh.rotation.set(...o.r);
    if (o.s !== undefined) typeof o.s === "number" ? mesh.scale.setScalar(o.s) : mesh.scale.set(...o.s);
    mesh.castShadow = slot !== "glow";
    mesh.receiveShadow = true;
    mesh.userData.slot = slot;
    if (o.keep) mesh.userData.keep = true;
    if (o.name) mesh.name = o.name;
    parent.add(mesh);
    return mesh;
  }

  /** Create a named joint group. */
  joint(name: string, parent: THREE.Object3D, p: Vec3 = [0, 0, 0], r: Vec3 = [0, 0, 0]) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...p);
    g.rotation.set(...r);
    parent.add(g);
    this.j[name] = g;
    return g;
  }

  anchor(name: string, parent: THREE.Object3D, p: Vec3) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(...p);
    parent.add(o);
    this.anchors[name] = o;
    return o;
  }

  group(parent: THREE.Object3D, p: Vec3 = [0, 0, 0], r: Vec3 = [0, 0, 0], s?: Vec3 | number) {
    const g = new THREE.Group();
    g.position.set(...p);
    g.rotation.set(...r);
    if (s !== undefined) typeof s === "number" ? g.scale.setScalar(s) : g.scale.set(...s);
    parent.add(g);
    return g;
  }

  finish(height: number): Rig {
    optimize(this.root);
    const rest = new Map<THREE.Object3D, THREE.Euler>();
    const restPos = new Map<THREE.Object3D, THREE.Vector3>();
    for (const o of Object.values(this.j)) {
      rest.set(o, o.rotation.clone());
      restPos.set(o, o.position.clone());
    }
    const root = this.root;
    return {
      kind: this.kind,
      color: this.side,
      root,
      body: this.body,
      j: this.j,
      rest,
      restPos,
      anchors: this.anchors,
      height,
      extras: this.extras,
      dispose() {
        root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
        });
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Optimisation: merge static sibling meshes per material              */
/* ------------------------------------------------------------------ */

function normaliseGeometry(g: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  let out = g.index ? g.toNonIndexed() : g.clone();
  out.applyMatrix4(matrix);
  out.clearGroups();
  for (const name of Object.keys(out.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") out.deleteAttribute(name);
  }
  if (!out.attributes.uv) {
    const count = out.attributes.position.count;
    out.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

export function optimize(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.keep || mesh.children.length) continue;
      const mat = mesh.material as THREE.Material;
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat)!.push(mesh);
    }
    for (const [mat, meshes] of buckets) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => {
        m.updateMatrix();
        return normaliseGeometry(m.geometry, m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      for (const m of meshes) {
        parent.remove(m);
        m.geometry.dispose();
      }
      const mm = new THREE.Mesh(merged, mat);
      mm.castShadow = meshes[0].castShadow;
      mm.receiveShadow = true;
      mm.userData.slot = meshes[0].userData.slot;
      parent.add(mm);
    }
  }
}
