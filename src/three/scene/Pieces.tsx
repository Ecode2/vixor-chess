"use client";

import { useEffect, useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { buildRig } from "../pieces/models";
import { actors, createActor, spawnFx } from "../anim/actors";
import { updateActor } from "../anim/animators";
import { homeYaw, squareToXZ } from "@/game/coords";
import { useGame } from "@/game/store";
import type { PieceData } from "@/game/types";
import { unlockAudio, sfx } from "@/audio/sfx";
import { fx } from "../fx/fx";
import { sideGlow } from "../pieces/materials";

function Piece({ data }: { data: PieceData }) {
  const rig = useMemo(() => buildRig(data.kind, data.color), [data.kind, data.color]);
  const actor = useMemo(() => createActor(data.id, data.kind, data.color, rig), [data.id, data.kind, data.color, rig]);
  const selected = useGame((s) => s.selected === data.square);
  const clickSquare = useGame((s) => s.clickSquare);
  const setHovered = useGame((s) => s.setHovered);

  useEffect(() => {
    actors.set(data.id, actor);
    return () => {
      if (actors.get(data.id) === actor) actors.delete(data.id);
      // geometry may still be referenced by flying debris for a few seconds
      setTimeout(() => {
        if (actors.get(data.id) !== actor) rig.dispose();
      }, 6000);
    };
  }, [actor, data.id, rig]);

  // snap to the logical square whenever it changes (also handles undo)
  useEffect(() => {
    const [x, z] = squareToXZ(data.square);
    actor.pos.set(x, 0, z);
    actor.yaw = homeYaw(data.color);
    actor.lift = 0;
    actor.pitch = 0;
    actor.roll = 0;
    actor.spin = 0;
    actor.scale = 1;
    actor.dead = false;
    rig.root.visible = true;
    if (spawnFx.has(data.square)) {
      spawnFx.delete(data.square);
      actor.appear = 0;
    }
  }, [actor, data.square, data.color, rig]);

  useEffect(() => {
    actor.selected = selected;
    if (selected) sfx.select();
  }, [actor, selected]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (actor.appear < 1) {
      const before = actor.appear;
      actor.appear = Math.min(1, actor.appear + dt * 1.6);
      if (before === 0) {
        fx.flash(actor.pos.clone().setY(0.6), sideGlow[actor.color], 2.5, 0.8);
      }
    }
    updateActor(actor, dt);
  });

  return (
    <primitive
      object={rig.root}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        unlockAudio();
        clickSquare(data.square);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        actor.hovered = true;
        setHovered(data.square);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        actor.hovered = false;
        document.body.style.cursor = "";
      }}
    />
  );
}

export function Pieces() {
  const pieces = useGame((s) => s.pieces);
  return (
    <group>
      {pieces.map((p) => (
        <Piece key={p.id} data={p} />
      ))}
    </group>
  );
}
