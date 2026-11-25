"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, Sky, Sparkles } from "@react-three/drei";
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
/* Scene themes                                                        */
/* ------------------------------------------------------------------ */

const THEMES = {
  night: {
    background: "#08080c",
    fog: "#08080c",
    fogNear: 18,
    fogFar: 42,
    hemiSky: "#c9d4ff",
    hemiGround: "#2a1d12",
    hemi: 0.5,
    sun: 2.6,
    sunColor: "#ffe5c2",
    sunPos: [5, 11, 6] as [number, number, number],
    rim: 1.6,
    rimColor: "#8fb0ff",
    spot: 40,
    env: [1.2, 1.1, 0.8, 1.0, 0.6],
    envTop: "#fff2dc",
    envGround: "#3a2a1a",
    bloom: 0.8,
    bloomThreshold: 1.6,
    vignette: 0.72,
  },
  day: {
    background: "#9fc3e6",
    fog: "#b9d2ea",
    fogNear: 26,
    fogFar: 75,
    hemiSky: "#dcebff",
    hemiGround: "#9c8a6c",
    hemi: 1.15,
    sun: 3.2,
    sunColor: "#fff3e0",
    sunPos: [6, 12, 8] as [number, number, number],
    rim: 1.4,
    rimColor: "#d6e4ff",
    spot: 0,
    env: [2.4, 1.6, 1.4, 1.3, 1.0],
    envTop: "#ffffff",
    envGround: "#d8c8a8",
    bloom: 0.35,
    bloomThreshold: 2.2,
    vignette: 0.35,
  },
} as const;

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
  const theme = useGame((s) => s.settings.theme);
  const high = quality === "high";
  const T = THEMES[theme];
  return (
    <>
      <color attach="background" args={[T.background]} />
      <fog attach="fog" args={[T.fog, T.fogNear, T.fogFar]} />
      {theme === "day" && (
        <Sky distance={100} sunPosition={[40, 18, 55]} turbidity={2.2} rayleigh={2.6} mieCoefficient={0.003} mieDirectionalG={0.8} />
      )}
      <hemisphereLight args={[T.hemiSky, T.hemiGround, T.hemi]} />
      <directionalLight
        castShadow
        position={T.sunPos}
        intensity={T.sun}
        color={T.sunColor}
        shadow-mapSize={high ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-6.5, 6.5, 6.5, -6.5, 1, 30]} />
      </directionalLight>
      <directionalLight position={[-6, 6, -8]} intensity={T.rim} color={T.rimColor} />
      <spotLight position={[0, 12, 0]} angle={0.55} penumbra={0.9} intensity={T.spot} decay={1.4} color="#fff0d8" />
      <Environment key={theme} resolution={256} frames={1}>
        <Lightformer form="rect" intensity={T.env[0]} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} color={T.envTop} />
        <Lightformer form="rect" intensity={T.env[1]} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} color="#ffd9a8" />
        <Lightformer form="rect" intensity={T.env[2]} position={[7, 3, -3]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} color="#9fb6ff" />
        <Lightformer form="ring" intensity={T.env[3]} position={[3, 5, 8]} scale={3} color="#ffffff" />
        <Lightformer form="rect" intensity={T.env[4]} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} color={T.envGround} />
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
      {theme === "night" ? (
        <Sparkles count={high ? 90 : 40} scale={[16, 5, 16]} position={[0, 2.5, 0]} size={2.2} speed={0.25} opacity={0.5} color="#ffcf8a" />
      ) : (
        <Sparkles count={high ? 40 : 20} scale={[16, 5, 16]} position={[0, 2.5, 0]} size={1.4} speed={0.15} opacity={0.25} color="#ffffff" />
      )}

      {high ? (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={0.35} intensity={1.6} distanceFalloff={0.6} halfRes />
          <Bloom mipmapBlur intensity={T.bloom} luminanceThreshold={T.bloomThreshold} luminanceSmoothing={0.3} />
          <Vignette offset={0.28} darkness={T.vignette} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={T.bloom * 0.75} luminanceThreshold={T.bloomThreshold} luminanceSmoothing={0.3} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
