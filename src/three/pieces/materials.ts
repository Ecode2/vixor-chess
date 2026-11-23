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
