import * as THREE from "three";
import { brickTexture, grainTexture } from "../textures";

export type Slot = "body" | "accent" | "cloth" | "dark" | "glow" | "fur" | "stone" | "metal";
export type Side = "w" | "b";

export type MaterialSet = Record<Slot, THREE.Material>;

const sets: Partial<Record<Side, MaterialSet>> = {};

export const PALETTE = {
  w: {
    body: "#ebe5d6", // aged ivory
    accent: "#d4a94e", // gold
    cloth: "#1c2a55", // deep sapphire
    dark: "#2a2622",
    glow: "#ffd27a",
    fur: "#f4f1ea",
    stone: "#e2dccb",
    metal: "#b9bcc2",
  },
  b: {
    body: "#1c1c22", // obsidian
    accent: "#9aa1ad", // gunmetal silver
    cloth: "#4f0f1a", // oxblood
    dark: "#08080a",
    glow: "#ff4a22",
    fur: "#5a5a62",
    stone: "#24242b",
    metal: "#6b707a",
  },
} as const;

export function materials(side: Side): MaterialSet {
  const existing = sets[side];
  if (existing) return existing;
  const p = PALETTE[side];
  const grain = grainTexture();
  const isW = side === "w";

  const body = new THREE.MeshPhysicalMaterial({
    color: p.body,
    roughness: isW ? 0.42 : 0.3,
    metalness: isW ? 0 : 0.15,
    clearcoat: isW ? 0.35 : 0.7,
    clearcoatRoughness: 0.35,
    sheen: isW ? 0.3 : 0,
    sheenColor: new THREE.Color("#fff3dd"),
    bumpMap: grain,
    bumpScale: 0.5,
    roughnessMap: grain,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: p.accent,
    roughness: 0.28,
    metalness: 1,
    bumpMap: grain,
    bumpScale: 0.4,
  });
  const cloth = new THREE.MeshPhysicalMaterial({
    color: p.cloth,
    roughness: 0.6,
    sheen: 0.8,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(isW ? "#6f86c8" : "#c85060"),
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
    side: THREE.DoubleSide,
  });
  const dark = new THREE.MeshStandardMaterial({ color: p.dark, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({
    color: p.glow,
    emissive: new THREE.Color(p.glow),
    emissiveIntensity: 2.2,
    toneMapped: false,
  });
  const fur = new THREE.MeshStandardMaterial({ color: p.fur, roughness: 1, bumpMap: grain, bumpScale: 3 });
  const brick = brickTexture();
  const stone = new THREE.MeshPhysicalMaterial({
    color: p.stone,
    roughness: isW ? 0.55 : 0.4,
    clearcoat: isW ? 0.2 : 0.5,
    bumpMap: brick,
    bumpScale: 2.5,
    roughnessMap: grain,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: p.metal,
    roughness: isW ? 0.32 : 0.28,
    metalness: 1,
    bumpMap: grain,
    bumpScale: 0.3,
  });

  const set: MaterialSet = { body, accent, cloth, dark, glow, fur, stone, metal };
  sets[side] = set;
  return set;
}

/** Live re-colour of an army's shared materials (instant, no rebuild). */
export function applyArmyStyle(side: Side, style: { body: string; accent: string; cloth: string; glow: string }) {
  const m = materials(side);
  const body = new THREE.Color(style.body);
  (m.body as THREE.MeshPhysicalMaterial).color.copy(body);
  (m.accent as THREE.MeshStandardMaterial).color.set(style.accent);
  const cloth = m.cloth as THREE.MeshPhysicalMaterial;
  cloth.color.set(style.cloth);
  cloth.sheenColor.set(style.cloth).lerp(new THREE.Color("#ffffff"), 0.35);
  const glow = m.glow as THREE.MeshStandardMaterial;
  glow.color.set(style.glow);
  glow.emissive.set(style.glow);
  // stone & fur follow the body tone
  (m.stone as THREE.MeshPhysicalMaterial).color.copy(body).multiplyScalar(0.95);
  const lum = body.r * 0.3 + body.g * 0.59 + body.b * 0.11;
  (m.fur as THREE.MeshStandardMaterial).color.copy(body).lerp(new THREE.Color(lum > 0.4 ? "#ffffff" : "#77777f"), 0.5);
  sideGlow[side] = style.glow;
  // keep materials derived for external models in sync
  for (const d of derived[side]) syncDerived(side, d);
}

/* ------------------------------------------------------------------ */
/* Materials derived for external (GLB/FBX) models                      */
/* ------------------------------------------------------------------ */

interface Derived {
  slot: Slot;
  mode: "statue" | "tint";
  mat: THREE.MeshStandardMaterial;
  baseColor?: THREE.Color;
}

const derived: Record<Side, Derived[]> = { w: [], b: [] };
const derivedCache = new Map<string, THREE.Material>();

function syncDerived(side: Side, d: Derived) {
  const base = materials(side)[d.slot] as THREE.MeshStandardMaterial;
  if (d.mode === "statue") {
    d.mat.color.copy(base.color);
    if (d.slot === "glow") d.mat.emissive.copy(base.emissive);
  } else if (d.baseColor) {
    d.mat.color.copy(d.baseColor).multiply(base.color).multiplyScalar(1.4);
  }
}

/**
 * statue: the army's own material for `slot`, but keeping the model's normal
 *         and AO maps so sculpted detail survives.
 * tint:   the model's material with its colour multiplied by the army colour.
 */
export function deriveMaterial(side: Side, slot: Slot, original: THREE.Material, mode: "statue" | "tint"): THREE.Material {
  const key = `${side}|${slot}|${mode}|${original.uuid}`;
  const hit = derivedCache.get(key);
  if (hit) return hit;
  const src = original as THREE.MeshStandardMaterial;
  let mat: THREE.MeshStandardMaterial;
  let baseColor: THREE.Color | undefined;
  if (mode === "statue") {
    mat = (materials(side)[slot] as THREE.MeshStandardMaterial).clone();
    if (src.normalMap) {
      mat.normalMap = src.normalMap;
      mat.normalScale = src.normalScale?.clone() ?? new THREE.Vector2(1, 1);
    }
    if (src.aoMap) mat.aoMap = src.aoMap;
  } else {
    const std = new THREE.MeshStandardMaterial();
    std.map = src.map ?? null;
    std.normalMap = src.normalMap ?? null;
    std.roughnessMap = src.roughnessMap ?? null;
    std.metalnessMap = src.metalnessMap ?? null;
    std.aoMap = src.aoMap ?? null;
    std.roughness = src.roughness ?? 0.6;
    std.metalness = src.metalness ?? 0;
    std.transparent = src.transparent;
    std.alphaTest = src.alphaTest;
    std.side = src.side;
    baseColor = (src.color ?? new THREE.Color(1, 1, 1)).clone();
    mat = std;
  }
  mat.name = `${original.name}|${side}|${slot}`;
  const d: Derived = { slot, mode, mat, baseColor };
  derived[side].push(d);
  syncDerived(side, d);
  derivedCache.set(key, mat);
  return mat;
}

/** Current glow colour per side (used by effects). */
export const sideGlow: Record<Side, string> = { w: PALETTE.w.glow, b: PALETTE.b.glow };
