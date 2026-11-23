"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "@/three/scene/Stage";
import { Hud } from "./hud/Hud";
import { useGame } from "@/game/store";

// Handy console hook for debugging / scripted demos: window.__vixor.useGame.getState()
if (typeof window !== "undefined") (window as unknown as { __vixor: unknown }).__vixor = { useGame };

export default function VixorChess() {
  const [ready, setReady] = useState(false);
  return (
    <main className="app">
      <Canvas
        className="canvas"
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        camera={{ position: [0, 8.4, 9.4], fov: 38, near: 0.1, far: 120 }}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={() => requestAnimationFrame(() => setReady(true))}
      >
        <Suspense fallback={null}>
          <Stage />
        </Suspense>
      </Canvas>
      <Hud ready={ready} />
    </main>
  );
}
