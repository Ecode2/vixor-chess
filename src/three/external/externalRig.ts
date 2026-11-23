import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { PieceSymbol } from "chess.js";
import type { Rig } from "../pieces/kit";
import { deriveMaterial, type Side, type Slot } from "../pieces/materials";
import type { Actor } from "../anim/actors";
import { timeline } from "../anim/timeline";
import { DEFAULT_HEIGHT, type ClipKey, type PartSpec } from "./manifest";
import { findBone, fitClip, type PreparedPart, type PreparedPiece, type ResolvedClip } from "./loader";
import { PROP_DEFAULTS, buildProp } from "./props";

const DEG = Math.PI / 180;

interface ActionEntry {
  action: THREE.AnimationAction;
  info: ResolvedClip;
}

export interface ExternalPart {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<ClipKey, ActionEntry>>;
  weights: Partial<Record<ClipKey, number>>;
  head?: THREE.Object3D;
  headRest?: THREE.Quaternion;
  isRider: boolean;
}

export interface ExternalRigData {
  parts: ExternalPart[];
  /** durations (seconds) & hit fractions of one-shot clips, for the director */
  clipInfo: Partial<Record<ClipKey, { duration: number; hitAt: number }>>;
}

/* ------------------------------------------------------------------ */

function matchSlot(map: PartSpec["materialMap"], ...names: string[]): Slot | null {
  if (!map) return null;
  for (const [pattern, slot] of Object.entries(map)) {
    const re = new RegExp(pattern, "i");
    if (names.some((n) => n && re.test(n))) return slot;
  }
  return null;
}

function applyMaterials(root: THREE.Object3D, spec: PartSpec, side: Side) {
  const mode = spec.materials ?? "statue";
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // skinned bounds are unreliable once animated
    if (mode === "original") return;
    const convert = (m: THREE.Material) => {
      const slot = matchSlot(spec.materialMap, m.name, mesh.name) ?? "body";
      return deriveMaterial(side, slot, m, mode);
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}

/** Per-prepared-part normalisation, computed once and shared by all instances. */
const normCache = new WeakMap<PreparedPart, { scale: number; offset: THREE.Vector3; height: number }>();

function makeMixer(root: THREE.Object3D, prep: PreparedPart) {
  const mixer = new THREE.AnimationMixer(root);
  const actions: ExternalPart["actions"] = {};
  for (const [key, info] of Object.entries(prep.clips) as [ClipKey, ResolvedClip][]) {
    const clip = fitClip(info.clip, root, prep.spec.rootMotion);
    if (!clip.tracks.length) {
      console.warn(`[models] clip ${key} has no tracks matching the model's bones`);
      continue;
    }
    const action = mixer.clipAction(clip);
    action.setEffectiveWeight(key === "idle" ? 1 : 0);
    action.clampWhenFinished = true;
    action.play();
    actions[key] = { action, info };
  }
  return { mixer, actions };
}

function buildPart(prep: PreparedPart, side: Side, targetHeight: number, isRider: boolean): { holder: THREE.Group; part: ExternalPart; height: number } {
  const spec = prep.spec;
  const inst = cloneSkinned(prep.asset.scene);
  applyMaterials(inst, spec, side);
  const holder = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.y = (spec.rotationY ?? 0) * DEG;
  pivot.add(inst);
  holder.add(pivot);
  const { mixer, actions } = makeMixer(inst, prep);
  mixer.update(0);

  let norm = normCache.get(prep);
  if (!norm) {
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    const h = Math.max(1e-6, box.max.y - box.min.y);
    const scale = (spec.height ?? targetHeight) / h;
    const center = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale);
    if (spec.offset) offset.add(new THREE.Vector3(...spec.offset));
    norm = { scale, offset, height: spec.height ?? targetHeight };
    normCache.set(prep, norm);
  }
  pivot.scale.setScalar(norm.scale);
  pivot.position.copy(norm.offset);

  const head = findBone(inst, "Head") ?? undefined;
  const part: ExternalPart = {
    root: inst,
    mixer,
    actions,
    weights: { idle: 1 },
    head,
    headRest: head?.quaternion.clone(),
    isRider,
  };
  return { holder, part, height: norm.height };
}

function attachProps(prep: PreparedPart, inst: THREE.Object3D, side: Side, height: number, rigRoot: THREE.Object3D, anchors: Record<string, THREE.Object3D>) {
  rigRoot.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  const sizeK = height / 1.5;
  for (const { spec: p, asset } of prep.props) {
    const def = p.builtin ? PROP_DEFAULTS[p.builtin] : undefined;
    const boneName = p.bone ?? def?.bone ?? "RightHand";
    const bone = findBone(inst, boneName);
    if (!bone) {
      console.warn(`[models] prop bone "${boneName}" not found`);
      continue;
    }
    let obj: THREE.Object3D;
    if (p.builtin) {
      const built = buildProp(p.builtin, side);
      obj = built.group;
      Object.assign(anchors, built.anchors);
    } else if (asset) {
      obj = cloneSkinned(asset.scene);
      applyMaterials(obj, { model: "", materials: p.slot ? "statue" : "original", materialMap: p.slot ? { ".*": p.slot } : undefined }, side);
    } else continue;
    bone.getWorldScale(ws);
    const k = 1 / Math.max(1e-6, ws.x);
    const holder = new THREE.Group();
    const pos = p.position ?? def?.position ?? [0, 0, 0];
    const rot = p.rotation ?? def?.rotation ?? [0, 0, 0];
    holder.position.set(pos[0] * sizeK * k, pos[1] * sizeK * k, pos[2] * sizeK * k);
    holder.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    holder.scale.setScalar((p.scale ?? 1) * sizeK * k);
    holder.add(obj);
    bone.add(holder);
  }
  for (const [name, boneName] of Object.entries(prep.spec.anchors ?? {})) {
    const bone = findBone(inst, boneName);
    if (bone) anchors[name] = bone;
  }
}

/* ------------------------------------------------------------------ */

export function buildExternalRig(kind: PieceSymbol, side: Side, prep: PreparedPiece): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.name = `${side}${kind}-ext`;
  const anchors: Record<string, THREE.Object3D> = {};

  const main = buildPart(prep, side, DEFAULT_HEIGHT[kind], false);
  body.add(main.holder);
  attachProps(prep, main.part.root, side, main.height, root, anchors);
  const parts = [main.part];
  let height = main.height;

  if (prep.rider) {
    const r = buildPart(prep.rider, side, prep.rider.spec.height ?? 0.85, true);
    const seat = prep.spec.rider?.seat ?? [0, main.height * 0.62, 0];
    const mountBone = prep.spec.rider?.attachTo ? findBone(main.part.root, prep.spec.rider.attachTo) : null;
    if (mountBone) {
      root.updateMatrixWorld(true);
      const ws = mountBone.getWorldScale(new THREE.Vector3());
      r.holder.scale.divide(ws);
      r.holder.position.set(seat[0] / ws.x, seat[1] / ws.y, seat[2] / ws.z);
      mountBone.add(r.holder);
    } else {
      r.holder.position.set(...seat);
      main.holder.add(r.holder);
    }
    attachProps(prep.rider, r.part.root, side, r.height, root, anchors);
    parts.push(r.part);
    height = seat[1] + r.height * 0.75;
  }

  // default effect anchors
  const hand = findBone(parts[parts.length - 1].root, "RightHand");
  const head = findBone(parts[parts.length - 1].root, "Head");
  if (!anchors.weaponTip && hand) anchors.weaponTip = hand;
  if (!anchors.staffTop) anchors.staffTop = findBone(parts[parts.length - 1].root, "LeftHand") ?? hand ?? root;
  if (!anchors.sceptreTop && hand) anchors.sceptreTop = hand;
  if (!anchors.muzzle) anchors.muzzle = head ?? root;
  if (!anchors.crown && head) anchors.crown = head;

  const clipInfo: ExternalRigData["clipInfo"] = {};
  for (const p of parts) {
    for (const [key, e] of Object.entries(p.actions) as [ClipKey, ActionEntry][]) {
      if (clipInfo[key]) continue;
      clipInfo[key] = { duration: e.action.getClip().duration / (e.info.speed || 1), hitAt: e.info.hitAt };
    }
  }

  const data: ExternalRigData = { parts, clipInfo };
  return {
    kind,
    color: side,
    root,
    body,
    j: {},
    rest: new Map(),
    restPos: new Map(),
    anchors,
    height,
    extras: { external: data },
    dispose() {
      for (const p of parts) {
        p.mixer.stopAllAction();
        p.mixer.uncacheRoot(p.root);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* per-frame driver                                                     */
/* ------------------------------------------------------------------ */

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

const ACTION_CLIPS: Record<string, ClipKey[]> = {
  attack: ["attack", "cast"],
  brace: ["block", "hit"],
  cheer: ["victory"],
  death: ["death"],
  hit: ["hit"],
};

export function animateExternal(a: Actor, rig: Rig, dt: number) {
  const data = rig.extras.external as ExternalRigData;
  const speed = timeline.speed;
  for (const part of data.parts) {
    // which one-shot (if any) is being scrubbed?
    let scrub: { key: ClipKey; t: number } | null = null;
    if (a.action) {
      let keys = ACTION_CLIPS[a.action] ?? [];
      if (a.action === "attack" && (a.kind === "b" || a.kind === "q")) keys = ["cast", "attack"];
      const key = keys.find((k) => part.actions[k]);
      if (key) scrub = { key, t: a.action === "brace" ? a.actionT * 0.4 : a.actionT };
    } else if (a.idleGesture && part.actions.idleAlt) {
      scrub = { key: "idleAlt", t: a.idleT };
    }

    const targets: Partial<Record<ClipKey, number>> = {};
    if (scrub) targets[scrub.key] = 1;
    else {
      const wantsRun = a.loco === "gallop" || a.loco === "float";
      const loco: ClipKey | undefined = wantsRun ? (part.actions.run ? "run" : part.actions.walk ? "walk" : undefined) : part.actions.walk ? "walk" : undefined;
      if (loco && a.locoAmt > 0.01) {
        targets[loco] = a.locoAmt;
        targets.idle = 1 - a.locoAmt;
      } else targets.idle = 1;
      if (!part.actions.idle) {
        // no idle clip: let a looping clip stand in
        const any = (Object.keys(part.actions) as ClipKey[])[0];
        if (any && !loco) targets[any] = 1;
      }
    }

    for (const [key, e] of Object.entries(part.actions) as [ClipKey, ActionEntry][]) {
      const w = damp(part.weights[key] ?? 0, targets[key] ?? 0, 12, dt);
      part.weights[key] = w;
      e.action.enabled = w > 0.001;
      e.action.setEffectiveWeight(w);
      const dur = e.action.getClip().duration;
      if (scrub && scrub.key === key) {
        e.action.paused = true;
        e.action.time = Math.min(dur - 1e-3, Math.max(0, scrub.t) * dur);
      } else if (key === "idle" || key === "walk" || key === "run" || key === "victory") {
        e.action.paused = false;
        e.action.timeScale = (e.info.speed || 1) * (key === "walk" || key === "run" ? 1.15 : 1);
      } else {
        e.action.paused = true;
      }
    }
    if (part.head && part.headRest) part.head.quaternion.copy(part.headRest);
    part.mixer.update(dt * speed);
    // look around on top of whatever the clip does
    if (part.head && !scrub) {
      part.head.rotateY(a.lookYaw * 0.55 * (1 - a.locoAmt));
      part.head.rotateX(a.lookPitch * 0.4);
    }
  }
}
