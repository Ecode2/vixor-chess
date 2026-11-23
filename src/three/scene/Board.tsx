"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { boardTexture, frameTexture, grainTexture } from "../textures";
import { xzToSquare } from "@/game/coords";
import { useGame } from "@/game/store";
import { unlockAudio } from "@/audio/sfx";

export function Board() {
  const clickSquare = useGame((s) => s.clickSquare);
  const setHovered = useGame((s) => s.setHovered);

  const { surfaceMat, frameTopMat, sideMat, goldMat } = useMemo(() => {
    const surfaceMat = new THREE.MeshPhysicalMaterial({
      map: boardTexture(),
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      bumpMap: grainTexture(),
      bumpScale: 0.15,
    });
    const frameTopMat = new THREE.MeshPhysicalMaterial({
      map: frameTexture(),
      roughness: 0.45,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: "#16130f", roughness: 0.5, metalness: 0.2 });
    const goldMat = new THREE.MeshStandardMaterial({ color: "#c9a24a", roughness: 0.3, metalness: 1 });
    return { surfaceMat, frameTopMat, sideMat, goldMat };
  }, []);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(xzToSquare(e.point.x, e.point.z));
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    unlockAudio();
    const sq = xzToSquare(e.point.x, e.point.z);
    if (sq) clickSquare(sq);
  };

  return (
    <group>
      {/* playing surface */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.001, 0]}
        receiveShadow
        material={surfaceMat}
        onPointerMove={onMove}
        onPointerOut={() => setHovered(null)}
        onClick={onClick}
      >
        <planeGeometry args={[8, 8]} />
      </mesh>
      {/* frame: top textured, sides dark */}
      <mesh position={[0, -0.15, 0]} receiveShadow castShadow material={[sideMat, sideMat, frameTopMat, sideMat, sideMat, sideMat]}>
        <boxGeometry args={[10, 0.3, 10]} />
      </mesh>
      {/* gilded edge bands */}
      {[
        [0, -0.03, 5.005, 10.02, 0.025, 0.02],
        [0, -0.03, -5.005, 10.02, 0.025, 0.02],
        [5.005, -0.03, 0, 0.02, 0.025, 10.02],
        [-5.005, -0.03, 0, 0.02, 0.025, 10.02],
        [0, -0.27, 5.005, 10.02, 0.025, 0.02],
        [0, -0.27, -5.005, 10.02, 0.025, 0.02],
        [5.005, -0.27, 0, 0.02, 0.025, 10.02],
        [-5.005, -0.27, 0, 0.02, 0.025, 10.02],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} material={goldMat}>
          <boxGeometry args={[w, h, d]} />
        </mesh>
      ))}
      {/* plinth beneath the board */}
      <mesh position={[0, -0.55, 0]} receiveShadow material={sideMat}>
        <boxGeometry args={[9.4, 0.5, 9.4]} />
      </mesh>
      {/* stone floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.8, 0]} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#0d0c0b" roughness={0.9} />
      </mesh>
    </group>
  );
}
