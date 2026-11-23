"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGame } from "@/game/store";
import { squareToXZ } from "@/game/coords";
import { glowTexture } from "../textures";
import type { Square } from "@/game/types";

function squareFrameTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  ctx.strokeStyle = "white";
  for (let i = 0; i < 10; i++) {
    ctx.globalAlpha = 0.09 * (10 - i);
    ctx.lineWidth = 2;
    ctx.strokeRect(4 + i * 2, 4 + i * 2, 120 - i * 4, 120 - i * 4);
  }
  void g;
  return new THREE.CanvasTexture(c);
}

const Y = 0.012;

export function Markers() {
  const selected = useGame((s) => s.selected);
  const legal = useGame((s) => s.legalMoves);
  const lastMove = useGame((s) => s.lastMove);
  const hovered = useGame((s) => s.hovered);
  const status = useGame((s) => s.status);
  const turn = useGame((s) => s.turn);
  const pieces = useGame((s) => s.pieces);
  const busy = useGame((s) => s.busy);
  const showHints = useGame((s) => s.settings.showHints);

  const mats = useMemo(() => {
    const frame = squareFrameTexture();
    const mk = (color: string, map: THREE.Texture | null, opacity = 1, mult = 2) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(mult),
        map,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    return {
      sel: mk("#ffd27a", frame, 1, 2.5),
      move: mk("#ffd27a", glowTexture(), 0.9, 1.6),
      capture: mk("#ff4a2a", frame, 1, 2.2),
      last: mk("#d9a441", null, 0.13, 1),
      hover: mk("#ffffff", frame, 0.35, 1),
      check: mk("#ff2a10", glowTexture(), 1, 3),
    };
  }, []);

  const pulse = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (pulse.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.12;
      pulse.current.children.forEach((c) => {
        if (c.userData.pulse) c.scale.set(s * c.userData.base, s * c.userData.base, 1);
      });
    }
  });

  const kingSq = useMemo(() => {
    if (status.kind !== "check" && status.kind !== "checkmate") return null;
    return pieces.find((p) => p.kind === "k" && p.color === turn)?.square ?? null;
  }, [status, pieces, turn]);

  const plane = (sq: Square, mat: THREE.Material, size = 1, key?: string, pulseIt = false, y = Y) => {
    const [x, z] = squareToXZ(sq);
    return (
      <mesh
        key={key ?? sq + mat.uuid}
        position={[x, y, z]}
        rotation-x={-Math.PI / 2}
        material={mat}
        scale={[size, size, 1]}
        userData={{ pulse: pulseIt, base: size }}
        renderOrder={2}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
    );
  };

  const targets = new Set(legal.map((m) => m.to));

  return (
    <group ref={pulse}>
      {lastMove && plane(lastMove.from, mats.last, 0.98, "lf")}
      {lastMove && plane(lastMove.to, mats.last, 0.98, "lt")}
      {selected && !busy && plane(selected, mats.sel, 0.98, "sel", false, Y + 0.002)}
      {showHints &&
        !busy &&
        legal.map((m) =>
          m.captured ? plane(m.to, mats.capture, 0.96, "c" + m.to + m.promotion, true, Y + 0.003) : plane(m.to, mats.move, 0.42, "m" + m.to + m.promotion, true, Y + 0.003),
        )}
      {hovered && !busy && hovered !== selected && (targets.has(hovered) || !selected) && plane(hovered, mats.hover, 0.98, "hov", false, Y + 0.001)}
      {kingSq && plane(kingSq, mats.check, 1.6, "chk", true, Y + 0.004)}
    </group>
  );
}
