/**
 * External model manifest - lives at /public/models/manifest.json.
 *
 * When the file is missing, the game uses the built-in procedural pieces.
 * Any piece type left out of the manifest also falls back to procedural, so
 * you can replace pieces one at a time.
 *
 * See public/models/README.md for a walkthrough and manifest.example.json.
 */
import type { PieceSymbol } from "chess.js";
import type { Slot } from "../pieces/materials";

/** Animation states the game knows how to drive. */
export type ClipKey =
  | "idle" // looping stand
  | "walk" // looping walk (in place)
  | "run" // looping run / gallop (knight leaps, queen glides)
  | "attack" // one-shot strike; `hitAt` marks the impact moment
  | "cast" // one-shot spell (bishop / queen prefer this over attack)
  | "hit" // one-shot hit reaction (victim bracing)
  | "block" // one-shot block (used instead of hit if present)
  | "death" // one-shot fall (checkmated king)
  | "victory" // looping or one-shot celebration
  | "idleAlt"; // occasional idle variation (look around, stretch...)

/**
 * A clip reference:
 *  - "Walk"                     -> clip named "Walk" inside the piece's own model file
 *  - "anims/walk.fbx"           -> first clip in another file (e.g. Mixamo "without skin" download)
 *  - "anims/pack.glb#Slash"     -> clip "Slash" inside another file
 *  - "@walk"                    -> entry "walk" from the manifest's animationLibrary
 *  - or an object with extra options.
 */
export type ClipRef =
  | string
  | {
      src: string;
      /** 0..1 - when the blow lands (attack / cast). Default 0.5 */
      hitAt?: number;
      /** playback speed multiplier */
      speed?: number;
      /** trim (seconds) */
      start?: number;
      end?: number;
    };

/** Built-in procedural props that can be attached to bones. */
export type BuiltinProp = "sword" | "greatsword" | "shield" | "mace" | "crown" | "kingCrown" | "mitre" | "crosier" | "sceptre" | "helm";

export interface PropSpec {
  /** a built-in prop... */
  builtin?: BuiltinProp;
  /** ...or a model file (glb/gltf/fbx) */
  model?: string;
  /** bone to attach to, e.g. "RightHand", "Head" (mixamorig prefix optional, case-insensitive) */
  bone: string;
  /** offset in board units (1 = one square) */
  position?: [number, number, number];
  /** rotation in degrees */
  rotation?: [number, number, number];
  scale?: number;
  /** recolour a model prop with an army material slot */
  slot?: Slot;
}

export interface PartSpec {
  /** model file, relative to /models/ (glb, gltf or fbx) */
  model: string;
  /** final height in board units (default per piece type) */
  height?: number;
  /** extra yaw in degrees if the model doesn't face +Z */
  rotationY?: number;
  /** offset in board units after normalisation */
  offset?: [number, number, number];
  /**
   * statue   - replace all materials with the army's carved stone (keeps normal/AO maps) [default]
   * tint     - keep textures, multiply by the army stone colour
   * original - keep the model's own materials untouched
   */
  materials?: "statue" | "tint" | "original";
  /** per-material overrides: { "Cape": "cloth", "Armor|Helmet": "metal", "Gold": "accent" } (regex on material or mesh name) */
  materialMap?: Record<string, Slot>;
  /** remove root motion so the game controls position: strip-xz [default], strip-all, keep */
  rootMotion?: "strip-xz" | "strip-all" | "keep";
  clips?: Partial<Record<ClipKey, ClipRef>>;
  props?: PropSpec[];
  /** effect anchors -> bone names: weaponTip, staffTop, sceptreTop, muzzle, crown */
  anchors?: Record<string, string>;
}

export interface PieceSpec extends PartSpec {
  /** knight: a rider mounted on this model (which is then the horse) */
  rider?: PartSpec & {
    /** bone of the mount to sit on (e.g. "Spine"); if omitted, `seat` is relative to the mount root */
    attachTo?: string;
    /** seat position in board units */
    seat?: [number, number, number];
  };
}

export interface Credit {
  title: string;
  author: string;
  url?: string;
  license?: string;
}

export interface Manifest {
  version: 1;
  /** shared animations usable as "@name" from any piece (great for Mixamo) */
  animationLibrary?: Record<string, ClipRef>;
  pieces: Partial<Record<PieceSymbol, PieceSpec>>;
  credits?: Credit[];
}

export const DEFAULT_HEIGHT: Record<PieceSymbol, number> = {
  p: 1.0,
  n: 0.95, // the horse; the rider adds height
  b: 1.35,
  r: 1.25,
  q: 1.45,
  k: 1.55,
};

export const MANIFEST_URL = "/models/manifest.json";
export const MODELS_BASE = "/models/";
