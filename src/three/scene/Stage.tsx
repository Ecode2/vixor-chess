"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useGame, isGameOver } from "@/game/store";
import { timeline } from "../anim/timeline";
import { renderOpts } from "../anim/actors";
import { fx } from "../fx/fx";
import { aftermath, perform } from "../anim/director";
import { applyArmyStyle, materials } from "../pieces/materials";
import { glowTexture, smokeTexture } from "../textures";
import { setSoundEnabled } from "@/audio/sfx";
import { Board } from "./Board";
import { Pieces } from "./Pieces";
import { Markers } from "./Markers";

/* ------------------------------------------------------------------ */
/* Director driver: runs choreography for store events                 */
/* ------------------------------------------------------------------ */

function DirectorDriver() {
  const eventSeq = useGame((s) => s.eventSeq);
  const gameId = useGame((s) => s.gameId);
  const animSpeed = useGame((s) => s.settings.animSpeed);
  const sound = useGame((s) => s.settings.sound);
  const historyLen = useGame((s) => s.history.length);

  useEffect(() => {
    timeline.speed = animSpeed;
  }, [animSpeed]);

  useEffect(() => {
    setSoundEnabled(sound);
  }, [sound]);

  useEffect(() => {
    timeline.clear();
    fx.clear();
  }, [gameId]);

  useEffect(() => {
    const s = useGame.getState();
    const ev = s.event;
    if (!ev) return;
    const epoch = timeline.epoch;
    perform(ev, s.settings.cinematic)
      .catch((e) => console.error("[director]", e))
      .then(() => {
        const cur = useGame.getState();
        if (timeline.epoch === epoch && cur.event === ev) cur.finishEvent();
      });
  }, [eventSeq]);

  // reactions to check / mate after the board commits
  useEffect(() => {
    if (!historyLen) return;
    const s = useGame.getState();
    const st = s.status;
    if (st.kind !== "check" && st.kind !== "checkmate") return;
    const king = s.pieces.find((p) => p.kind === "k" && p.color === s.turn);
    const winners = s.pieces.filter((p) => p.color !== s.turn).map((p) => p.id);
    // wait a frame so freshly committed pieces have registered actors
    const id = requestAnimationFrame(() => aftermath(st.kind as "check" | "checkmate", king?.id, winners));
    return () => cancelAnimationFrame(id);
  }, [historyLen]);

  useFrame((_, dt) => {
    const d = timeline.update(Math.min(dt, 0.05));
    fx.update(d);
  });
  return <primitive object={fx.group} />;
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const turn = useGame((s) => s.turn);
  const players = useGame((s) => s.players);
  const follow = useGame((s) => s.settings.cameraFollow);
  const viewSide = useGame((s) => s.viewSide);
  const over = useGame((s) => isGameOver(s.status));

  const side = useMemo(() => {
    if (!follow || over) return viewSide;
    if (players.w === "human" && players.b === "human") return turn;
    return players.w === "human" ? "w" : "b";
  }, [follow, over, viewSide, players, turn]);

  const anim = useRef<{ from: number; to: number; t: number } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const target = side === "w" ? 0 : Math.PI;
    if (first.current) {
      first.current = false;
      return;
    }
    const c = controls.current;
    const cur = c ? c.getAzimuthalAngle() : 0;
    let d = (target - cur) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    anim.current = { from: cur, to: cur + d, t: 0 };
  }, [side]);

  // keep the whole board in frame on narrow / portrait screens
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const halfH = THREE.MathUtils.degToRad(cam.fov / 2);
    const halfW = Math.atan(Math.tan(halfH) * aspect);
    const dist = Math.min(28, Math.max(11.6, 5.0 / Math.tan(halfW)));
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.current?.update();
  }, [size.width, size.height, camera]);

  // shift (not zoom) the projection so HUD panels don't cover the board
  const panelOpen = useGame((s) => s.panelOpen);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const w = size.width, h = size.height;
    const mobile = w <= 820;
    const sx = panelOpen && !mobile ? 140 : 0;
    const sy = mobile ? (panelOpen ? 105 : 30) : 18;
    cam.setViewOffset(w, h, sx, sy, w, h);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, panelOpen]);

  const sph = useMemo(() => new THREE.Spherical(), []);
  useFrame((_, dt) => {
    const a = anim.current;
    const c = controls.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + dt / 1.4);
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
    const az = a.from + (a.to - a.from) * e;
    sph.setFromVector3(camera.position.clone().sub(c.target));
    sph.theta = az;
    camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
    c.update();
    if (a.t >= 1) anim.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={7}
      maxDistance={30}
      minPolarAngle={0.15}
      maxPolarAngle={1.32}
      enableDamping
      dampingFactor={0.08}
      target={[0, 0.3, 0]}
    />
  );
}

/** Applies camera-shake from the FX layer to the world. */
function Shaker({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const s = fx.shake * fx.shake * 0.12;
    const t = clock.elapsedTime * 60;
    g.current.position.set(Math.sin(t * 1.1) * s, Math.sin(t * 1.7) * s * 0.6, Math.cos(t * 1.3) * s);
  });
  return <group ref={g}>{children}</group>;
}

/** Keeps the shared army materials in sync with each player's chosen colours. */
function ArmyStyler() {
  const armies = useGame((s) => s.settings.armies);
  const bases = useGame((s) => s.settings.bases);
  useEffect(() => {
    renderOpts.bases = bases;
  }, [bases]);
  useEffect(() => {
    applyArmyStyle("w", armies.w);
    applyArmyStyle("b", armies.b);
  }, [armies]);
  return null;
}

/** Exposes the three state for console debugging (window.__vixor.three). */
function DebugHook() {
  const state = useThree();
  useEffect(() => {
    const w = window as unknown as { __vixor?: Record<string, unknown> };
    w.__vixor = { ...(w.__vixor ?? {}), three: state, fx, timeline };
  }, [state]);
  return null;
}

/** Compile transparent material variants up front so the first capture doesn't hitch. */
function Prewarm() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const mats: THREE.Material[] = [];
    for (const side of ["w", "b"] as const) {
      for (const m of Object.values(materials(side))) {
        for (const transparent of [false, true]) {
          const c = m.clone();
          c.transparent = transparent;
          mats.push(c);
          const mesh = new THREE.Mesh(geo, c);
          mesh.position.y = -5;
          g.add(mesh);
        }
      }
    }
    // effect materials (beams, sprites, particles, cannonball)
    const fxMats: THREE.Material[] = [
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }),
      new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.8, roughness: 0.4 }),
    ];
    for (const m of fxMats) {
      mats.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = -5;
      g.add(mesh);
    }
    const sm = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    mats.push(sm);
    const sp = new THREE.Sprite(sm);
    sp.position.y = -5;
    g.add(sp);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute([0, -5, 0], 3));
    for (const [map, add] of [
      [glowTexture(), true],
      [smokeTexture(), false],
    ] as const) {
      const pm = new THREE.PointsMaterial({ map, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !add });
      mats.push(pm);
      g.add(new THREE.Points(pg, pm));
    }
    scene.add(g);
    try {
      gl.compile(scene, camera);
    } catch {}
    const id = setTimeout(() => {
      scene.remove(g);
      geo.dispose();
      mats.forEach((m) => m.dispose());
    }, 500);
    return () => clearTimeout(id);
  }, [gl, scene, camera]);
  return null;
}

/* ------------------------------------------------------------------ */

export function Stage() {
  const quality = useGame((s) => s.settings.quality);
  const high = quality === "high";
  return (
    <>
      <color attach="background" args={["#08080c"]} />
      <fog attach="fog" args={["#08080c", 18, 42]} />
      <hemisphereLight args={["#c9d4ff", "#2a1d12", 0.35]} />
      <directionalLight
        castShadow
        position={[5, 11, 6]}
        intensity={2.6}
        color="#ffe5c2"
        shadow-mapSize={high ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-6.5, 6.5, 6.5, -6.5, 1, 30]} />
      </directionalLight>
      <directionalLight position={[-6, 5, -8]} intensity={1.2} color="#8fb0ff" />
      <spotLight position={[0, 12, 0]} angle={0.55} penumbra={0.9} intensity={40} decay={1.4} color="#fff0d8" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1.2} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} color="#fff2dc" />
        <Lightformer form="rect" intensity={1.1} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} color="#ffd9a8" />
        <Lightformer form="rect" intensity={0.7} position={[7, 3, -3]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} color="#9fb6ff" />
        <Lightformer form="ring" intensity={1.0} position={[3, 5, 8]} scale={3} color="#ffffff" />
        <Lightformer form="rect" intensity={0.6} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} color="#3a2a1a" />
      </Environment>

      <CameraRig />
      <Prewarm />
      <ArmyStyler />
      <DebugHook />
      <Shaker>
        <Board />
        <Markers />
        <Pieces />
        <DirectorDriver />
      </Shaker>
      <Sparkles count={high ? 90 : 40} scale={[16, 5, 16]} position={[0, 2.5, 0]} size={2.2} speed={0.25} opacity={0.5} color="#ffcf8a" />

      {high ? (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={0.35} intensity={1.6} distanceFalloff={0.6} halfRes />
          <Bloom mipmapBlur intensity={0.8} luminanceThreshold={1.6} luminanceSmoothing={0.3} />
          <Vignette offset={0.28} darkness={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1.6} luminanceSmoothing={0.3} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
