"use client";

import * as THREE from "three";
import { create } from "zustand";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { PieceSymbol } from "chess.js";
import { MANIFEST_URL, MODELS_BASE, type ClipKey, type ClipRef, type Credit, type Manifest, type PartSpec, type PieceSpec } from "./manifest";

/* ------------------------------------------------------------------ */
/* asset loading (cached)                                              */
/* ------------------------------------------------------------------ */

export interface LoadedAsset {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

const assetCache = new Map<string, Promise<LoadedAsset>>();
let gltf: GLTFLoader | null = null;
let fbx: FBXLoader | null = null;

function resolveUrl(path: string) {
  if (/^(https?:)?\//.test(path)) return path;
  return MODELS_BASE + path;
}

export function loadAsset(path: string): Promise<LoadedAsset> {
  const url = resolveUrl(path);
  let p = assetCache.get(url);
  if (!p) {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
    if (ext === "fbx") {
      fbx ??= new FBXLoader();
      p = fbx.loadAsync(url).then((g) => ({ scene: g, animations: g.animations }));
    } else {
      if (!gltf) {
        gltf = new GLTFLoader();
        gltf.setMeshoptDecoder(MeshoptDecoder);
      }
      p = gltf.loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations }));
    }
    assetCache.set(url, p);
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* clip resolution + light retargeting                                 */
/* ------------------------------------------------------------------ */

/** Normalised bone key: "mixamorig:LeftArm" / "mixamorigLeftArm" / "LeftArm" -> "leftarm" */
export function boneKey(name: string) {
  return name
    .toLowerCase()
    .replace(/^.*mixamorig[0-9]*/, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const want = boneKey(name);
  let exact: THREE.Object3D | null = null;
  let loose: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (exact || !o.name) return;
    const k = boneKey(o.name);
    if (k === want) exact = o;
    else if (!loose && k.endsWith(want)) loose = o;
  });
  return exact ?? loose;
}

/**
 * Re-points a clip's tracks at the nodes that exist in `target` (handles the
 * different ways loaders spell Mixamo bone names) and strips root motion so
 * the game can drive the piece's position itself.
 */
export function fitClip(src: THREE.AnimationClip, target: THREE.Object3D, rootMotion: PartSpec["rootMotion"] = "strip-xz") {
  const names = new Map<string, string>();
  target.traverse((o) => {
    if (o.name) names.set(boneKey(o.name), o.name);
  });
  let hipsKey: string | null = null;
  for (const k of ["hips", "pelvis", "root"]) if (names.has(k)) { hipsKey = k; break; }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of src.tracks) {
    const dot = t.name.lastIndexOf(".");
    const node = t.name.slice(0, dot);
    const prop = t.name.slice(dot + 1);
    const key = boneKey(node);
    const real = names.get(key);
    if (!real) continue;
    const track = t.clone();
    track.name = `${real}.${prop}`;
    if (prop === "position" && key === hipsKey && rootMotion !== "keep") {
      if (rootMotion === "strip-all") continue;
      const v = track.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0;
        v[i + 2] = z0;
      }
    }
    tracks.push(track);
  }
  return new THREE.AnimationClip(src.name, src.duration, tracks);
}

export interface ResolvedClip {
  clip: THREE.AnimationClip;
  hitAt: number;
  speed: number;
}

async function resolveClip(
  ref: ClipRef,
  own: LoadedAsset,
  library: Manifest["animationLibrary"],
  depth = 0,
): Promise<ResolvedClip | null> {
  const opts = typeof ref === "string" ? { src: ref } : ref;
  let src = opts.src;
  if (src.startsWith("@")) {
    const lib = library?.[src.slice(1)];
    if (!lib || depth > 3) return null;
    const inner = await resolveClip(lib, own, library, depth + 1);
    if (!inner) return null;
    return { ...inner, hitAt: typeof ref === "string" ? inner.hitAt : opts.hitAt ?? inner.hitAt, speed: typeof ref === "string" ? inner.speed : opts.speed ?? inner.speed };
  }
  let asset = own;
  let clipName: string | undefined;
  const isFile = /\.(glb|gltf|fbx)(#|$)/i.test(src);
  if (isFile) {
    const [file, name] = src.split("#");
    asset = await loadAsset(file);
    clipName = name;
  } else clipName = src;
  let clip = clipName ? asset.animations.find((c) => c.name === clipName) ?? asset.animations.find((c) => c.name.toLowerCase() === clipName!.toLowerCase()) : asset.animations[0];
  if (!clip) {
    console.warn(`[models] clip "${src}" not found. Available:`, asset.animations.map((c) => c.name));
    return null;
  }
  const o: Exclude<ClipRef, string> = typeof ref === "string" ? { src: ref } : ref;
  if (o.start !== undefined || o.end !== undefined) {
    const fps = 30;
    clip = THREE.AnimationUtils.subclip(clip, clip.name, Math.round((o.start ?? 0) * fps), Math.round((o.end ?? clip.duration) * fps), fps);
  }
  return { clip, hitAt: o.hitAt ?? 0.5, speed: o.speed ?? 1 };
}

/* ------------------------------------------------------------------ */
/* library preparation                                                 */
/* ------------------------------------------------------------------ */

export interface PreparedPart {
  spec: PartSpec;
  asset: LoadedAsset;
  clips: Partial<Record<ClipKey, ResolvedClip>>;
  props: { spec: NonNullable<PartSpec["props"]>[number]; asset?: LoadedAsset }[];
}

export interface PreparedPiece extends PreparedPart {
  spec: PieceSpec;
  rider?: PreparedPart;
}

async function preparePart(spec: PartSpec, library: Manifest["animationLibrary"]): Promise<PreparedPart> {
  const asset = await loadAsset(spec.model);
  const clips: PreparedPart["clips"] = {};
  await Promise.all(
    Object.entries(spec.clips ?? {}).map(async ([key, ref]) => {
      try {
        const r = await resolveClip(ref as ClipRef, asset, library);
        if (r) clips[key as ClipKey] = r;
      } catch (e) {
        console.warn(`[models] failed to load clip ${key}`, e);
      }
    }),
  );
  // sensible defaults: use the model's own clips by common names if not mapped
  const auto: Partial<Record<ClipKey, RegExp>> = {
    idle: /idle/i,
    walk: /walk/i,
    run: /run|gallop/i,
    attack: /attack|slash|punch|strike/i,
    hit: /hit|react/i,
    death: /death|die|dying/i,
    victory: /victory|cheer|wave|thumbs/i,
  };
  for (const [key, re] of Object.entries(auto) as [ClipKey, RegExp][]) {
    if (clips[key]) continue;
    const c = asset.animations.find((a) => re.test(a.name));
    if (c) clips[key] = { clip: c, hitAt: 0.5, speed: 1 };
  }
  if (!clips.idle && asset.animations[0]) clips.idle = { clip: asset.animations[0], hitAt: 0.5, speed: 1 };
  const props = await Promise.all(
    (spec.props ?? []).map(async (p) => ({ spec: p, asset: p.model ? await loadAsset(p.model).catch(() => undefined) : undefined })),
  );
  return { spec, asset, clips, props };
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

interface ModelLibraryState {
  status: "loading" | "ready" | "none" | "error";
  progress: number;
  error: string | null;
  pieces: Partial<Record<PieceSymbol, PreparedPiece>>;
  credits: Credit[];
}

export const useModels = create<ModelLibraryState>(() => ({
  status: "loading",
  progress: 0,
  error: null,
  pieces: {},
  credits: [],
}));

let started = false;

/** Load /models/manifest.json (if any) and everything it references. */
export function startModelLibrary() {
  if (started) return;
  started = true;
  (async () => {
    let manifest: Manifest | null = null;
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) manifest = await res.json();
    } catch {}
    if (!manifest?.pieces || !Object.keys(manifest.pieces).length) {
      useModels.setState({ status: "none", progress: 1 });
      return;
    }
    const entries = Object.entries(manifest.pieces) as [PieceSymbol, PieceSpec][];
    let done = 0;
    const pieces: ModelLibraryState["pieces"] = {};
    const errors: string[] = [];
    await Promise.all(
      entries.map(async ([kind, spec]) => {
        try {
          const part = await preparePart(spec, manifest!.animationLibrary);
          const prepared: PreparedPiece = { ...part, spec };
          if (spec.rider) prepared.rider = await preparePart(spec.rider, manifest!.animationLibrary);
          pieces[kind] = prepared;
        } catch (e) {
          console.error(`[models] ${kind} failed - using procedural piece`, e);
          errors.push(`${kind}: ${(e as Error)?.message ?? e}`);
        }
        done++;
        useModels.setState({ progress: done / entries.length });
      }),
    );
    useModels.setState({
      status: "ready",
      pieces,
      credits: manifest.credits ?? [],
      error: errors.length ? `Some models failed to load (${errors.join("; ")}) - using built-in pieces for those.` : null,
    });
  })();
}
