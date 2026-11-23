import * as THREE from "three";
import type { PieceSymbol } from "chess.js";
import { Builder, geo, shapes, uvByHeight, type Rig } from "./kit";
import type { Side } from "./materials";
import { BASE_TOP as T, aimDown, arm, chainCoif, dirEuler, face, figure, mace, plinth, shield, sword } from "./parts";

const PI = Math.PI;

/* ================================================================== */
/* PAWN - man-at-arms with kettle helm, heater shield and sword        */
/* ================================================================== */

function humanLegs(b: Builder, hips: THREE.Object3D, hipW = 0.045) {
  for (const [name, x] of [
    ["L", hipW],
    ["R", -hipW],
  ] as const) {
    const leg = b.joint(`leg${name}`, hips, [x, 0, 0]);
    b.mesh(leg, geo.capsule(0.033, 0.1), "body", { p: [0, -0.08, 0] });
    const knee = b.joint(`knee${name}`, leg, [0, -0.16, 0]);
    b.mesh(knee, geo.sphere(0.03, 10, 8), "metal", { p: [0, 0, 0.012], s: [1, 1, 0.8] });
    b.mesh(knee, geo.capsule(0.028, 0.08), "body", { p: [0, -0.06, 0] });
    b.mesh(knee, geo.cyl(0.031, 0.027, 0.07, 12), "metal", { p: [0, -0.07, 0.004] });
    b.mesh(knee, geo.sphere(0.036, 12, 8), "dark", { p: [0, -0.123, 0.018], s: [0.85, 0.5, 1.5] });
  }
}

function pawnTorso(b: Builder, torso: THREE.Object3D, scale = 1) {
  b.mesh(
    torso,
    geo.lathe(
      [
        [0, 0],
        [0.08, 0],
        [0.086, 0.06],
        [0.096, 0.15],
        [0.102, 0.2],
        [0.088, 0.24],
        [0.042, 0.265],
        [0, 0.27],
      ].map(([r, y]) => [r * scale, y] as [number, number]),
      32,
    ),
    "metal",
    { s: [1, 1, 0.8] },
  );
  // surcoat over the mail
  b.mesh(
    torso,
    geo.lathe(
      [
        [0.088 * scale, 0.0],
        [0.093 * scale, 0.08],
        [0.1 * scale, 0.16],
        [0.1 * scale, 0.205],
        [0.096 * scale, 0.21],
      ],
      32,
    ),
    "cloth",
    { s: [1.04, 1, 0.84] },
  );
  b.mesh(torso, geo.torus(0.088 * scale, 0.011, 8, 32), "accent", { p: [0, 0.03, 0], r: [PI / 2, 0, 0], s: [1.06, 0.86, 1] });
  b.mesh(torso, geo.box(0.022, 0.02, 0.01), "accent", { p: [0, 0.03, 0.08 * scale] });
  b.mesh(torso, geo.extrude(shapes.chevron(0.04, 0.042, 0.016), 0.006, 0.0015), "accent", {
    p: [0, 0.13, 0.087 * scale],
    r: [-0.08, 0, 0],
  });
}

function buildPawn(side: Side): Rig {
  const b = new Builder("p", side);
  plinth(b, 0.33);
  const F = figure(b, 1.27);
  const hips = b.joint("hips", F, [0, T + 0.3, 0]);
  humanLegs(b, hips);
  // tassets / skirt
  b.mesh(
    hips,
    geo.lathe(
      [
        [0.084, 0.05],
        [0.092, 0.0],
        [0.106, -0.07],
        [0.118, -0.125],
        [0.112, -0.13],
      ],
      32,
    ),
    "cloth",
    { s: [1, 1, 0.86] },
  );
  const torso = b.joint("torso", hips, [0, 0.02, 0]);
  pawnTorso(b, torso);

  const head = b.joint("head", torso, [0, 0.265, 0]);
  b.mesh(head, geo.cyl(0.026, 0.03, 0.04, 12), "metal", { p: [0, 0.012, 0] });
  const hc = b.group(head, [0, 0.07, 0]);
  b.mesh(hc, geo.sphere(0.05, 20, 14), "body");
  face(b, hc, 0.05, "glow");
  chainCoif(b, hc, 0.05);
  // kettle helm
  b.mesh(hc, geo.sphere(0.057, 24, 12, 0, PI * 2, 0, PI * 0.5), "metal", { p: [0, 0.012, 0] });
  b.mesh(hc, geo.box(0.006, 0.012, 0.1), "metal", { p: [0, 0.066, 0] });
  b.mesh(
    hc,
    geo.lathe(
      [
        [0.052, 0.016],
        [0.1, -0.006],
        [0.106, -0.016],
        [0.1, -0.012],
        [0.052, 0.006],
      ],
      36,
    ),
    "metal",
    { p: [0, 0.012, 0] },
  );
  b.mesh(hc, geo.torus(0.057, 0.005, 6, 36), "accent", { p: [0, 0.016, 0], r: [PI / 2, 0, 0] });

  // sword arm
  const R = arm(b, torso, "R", [-0.108, 0.225, 0], { upper: "metal", fore: "metal" });
  b.mesh(R.elbow, geo.cyl(0.03, 0.024, 0.03, 12), "metal", { p: [0, -0.07, 0] });
  R.shoulder.rotation.set(-0.15, 0, -0.12);
  R.elbow.rotation.set(-1.15, 0, 0);
  const sw = sword(b, b.group(R.hand, [0, 0, 0], [1.25, 0, 0]), 0.2);
  sw.position.set(0, 0.0, 0);
  // shield arm
  const L = arm(b, torso, "L", [0.108, 0.225, 0], { upper: "metal", fore: "metal" });
  L.shoulder.rotation.set(-0.3, 0, 0.18);
  L.elbow.rotation.set(-1.0, 0, 0);
  const sh = shield(b, b.group(L.shoulder, [0.02, -0.1, 0.085], [0.05, 0.3, 0]), 0.072, 0.098, "chevron");
  b.j.shield = sh;
  return b.finish(1.1);
}

/* ================================================================== */
/* KNIGHT - armoured rider on a caparisoned destrier                    */
/* ================================================================== */

function buildKnight(side: Side): Rig {
  const b = new Builder("n", side);
  plinth(b, 0.37);
  const F = figure(b, 1.27);
  // Pivot at the hind hooves so the horse can rear up.
  const pivot: [number, number, number] = [0, T, -0.13];
  const horseJ = b.joint("horse", F, pivot);
  const H = b.group(horseJ, [-pivot[0], -pivot[1], -pivot[2]]);

  // barrel, chest, rump
  b.mesh(H, geo.sphere(1, 28, 18), "body", { p: [0, 0.43, 0], s: [0.098, 0.105, 0.19] });
  b.mesh(H, geo.sphere(0.1, 20, 14), "body", { p: [0, 0.425, 0.12], s: [1, 1.05, 0.95] });
  b.mesh(H, geo.sphere(0.102, 20, 14), "body", { p: [0, 0.44, -0.12], s: [1, 1, 1] });

  // caparison (horse cloth) drape - follows the barrel, leaves legs free
  const capS: [number, number, number] = [0.9, 1, 1.62];
  b.mesh(
    H,
    geo.lathe(
      [
        [0.112, 0.49],
        [0.122, 0.44],
        [0.13, 0.385],
        [0.134, 0.345],
        [0.13, 0.342],
      ],
      44,
    ),
    "cloth",
    { s: capS },
  );
  b.mesh(H, geo.torus(0.134, 0.0055, 6, 48), "accent", { p: [0, 0.345, 0], r: [PI / 2, 0, 0], s: [capS[0], capS[2], 1] });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2;
    b.mesh(H, geo.cone(0.008, 0.022, 4), "accent", {
      p: [Math.sin(a) * 0.134 * capS[0], 0.333, Math.cos(a) * 0.134 * capS[2]],
      r: [PI, 0, 0],
    });
  }
  for (const x of [-1, 1]) {
    b.mesh(H, geo.extrude(shapes.chevron(0.034, 0.036, 0.014), 0.005, 0.0015), "accent", {
      p: [x * 0.122, 0.405, -0.03],
      r: [0, (x * PI) / 2, 0],
    });
  }
  // saddle
  b.mesh(H, geo.box(0.13, 0.03, 0.12), "dark", { p: [0, 0.535, -0.01] });
  b.mesh(H, geo.box(0.1, 0.05, 0.015), "accent", { p: [0, 0.555, 0.05] });
  b.mesh(H, geo.box(0.11, 0.06, 0.015), "accent", { p: [0, 0.56, -0.07] });

  // neck & head
  const neck = b.joint("neck", H, [0, 0.47, 0.16]);
  b.mesh(neck, geo.capsule(0.056, 0.15), "body", { p: [0, 0.085, 0.03], r: [0.42, 0, 0] });
  b.mesh(neck, geo.sphere(0.06, 14, 10), "body", { p: [0, 0.0, 0.0], s: [1, 1, 1.1] });
  // mane: a crest of carved locks
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    b.mesh(neck, geo.box(0.014, 0.05, 0.03), "body", {
      p: [0, 0.03 + t * 0.19, -0.04 + t * 0.075],
      r: [0.15 - t * 0.2, 0, (i % 2 ? 1 : -1) * 0.12],
    });
  }
  // crinet plates on the crest
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    b.mesh(neck, geo.box(0.07, 0.012, 0.04), "metal", { p: [0, 0.06 + t * 0.12, 0.05 + t * 0.03], r: [0.42 - PI / 2 + 0.2, 0, 0] });
  }
  const head = b.joint("hhead", neck, [0, 0.215, 0.09]);
  b.mesh(head, geo.capsule(0.043, 0.1), "body", { p: [0, -0.015, 0.05], r: [1.95, 0, 0] });
  b.mesh(head, geo.sphere(0.041, 16, 12), "body", { p: [0, -0.045, 0.12], s: [0.88, 0.85, 1.05] });
  b.mesh(head, geo.sphere(0.046, 16, 12), "body", { p: [0, 0.008, 0.005], s: [0.95, 1, 1] });
  for (const x of [-1, 1]) {
    b.mesh(head, geo.cone(0.014, 0.055, 8), "body", { p: [x * 0.024, 0.05, -0.01], r: [-0.25, 0, -x * 0.28] });
    b.mesh(head, geo.sphere(0.008, 8, 6), "dark", { p: [x * 0.038, 0.012, 0.035] });
    b.mesh(head, geo.sphere(0.007, 6, 4), "dark", { p: [x * 0.015, -0.058, 0.155] });
  }
  // chanfron (armoured face plate) + bridle
  b.mesh(head, geo.box(0.045, 0.01, 0.12), "metal", { p: [0, 0.024, 0.06], r: [0.38, 0, 0] });
  b.mesh(head, geo.cone(0.009, 0.045, 8), "accent", { p: [0, 0.05, 0.04], r: [-0.55, 0, 0] });
  for (const x of [-1, 1]) b.mesh(head, geo.torus(0.012, 0.004, 6, 12), "accent", { p: [x * 0.038, -0.045, 0.11], r: [0, PI / 2, 0] });
  b.mesh(head, geo.torus(0.04, 0.004, 6, 24, PI), "accent", { p: [0, -0.04, 0.105], r: [0.35, 0, PI] });

  // legs
  const legs: [string, number, number, boolean][] = [
    ["FL", 0.055, 0.13, true],
    ["FR", -0.055, 0.13, true],
    ["BL", 0.055, -0.13, false],
    ["BR", -0.055, -0.13, false],
  ];
  for (const [n, x, z, front] of legs) {
    const leg = b.joint(`leg${n}`, H, [x, 0.385, z]);
    if (!front) b.mesh(leg, geo.sphere(0.055, 14, 10), "body", { p: [0, 0.01, -0.01], s: [0.6, 1, 1] });
    b.mesh(leg, geo.capsule(front ? 0.028 : 0.032, 0.08), "body", { p: [0, -0.055, 0] });
    const knee = b.joint(`knee${n}`, leg, [0, -0.115, 0]);
    b.mesh(knee, geo.sphere(0.022, 10, 8), "body");
    b.mesh(knee, geo.capsule(0.018, 0.07), "body", { p: [0, -0.05, 0] });
    b.mesh(knee, geo.sphere(0.022, 10, 8), "body", { p: [0, -0.095, 0.004] });
    b.mesh(knee, geo.cyl(0.021, 0.026, 0.028, 12), "dark", { p: [0, -0.113, 0.006] });
  }

  // tail
  const tail = b.joint("tail", H, [0, 0.47, -0.21]);
  b.mesh(
    tail,
    geo.tube(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.01, -0.05),
        new THREE.Vector3(0, -0.08, -0.08),
        new THREE.Vector3(0, -0.18, -0.07),
        new THREE.Vector3(0, -0.24, -0.05),
      ],
      0.017,
      24,
      8,
    ),
    "body",
  );

  // --- rider ---
  const rider = b.joint("rider", H, [0, 0.54, -0.02]);
  for (const x of [-1, 1]) {
    b.mesh(rider, geo.capsule(0.03, 0.08), "metal", { p: [x * 0.07, -0.015, 0.04], r: [1.95, 0, x * 0.25] });
    b.mesh(rider, geo.capsule(0.026, 0.08), "metal", { p: [x * 0.135, -0.09, 0.075], r: [0.15, 0, x * 0.12] });
    b.mesh(rider, geo.sphere(0.033, 10, 8), "dark", { p: [x * 0.142, -0.15, 0.09], s: [0.85, 0.55, 1.5] });
  }
  const torso = b.joint("torso", rider, [0, 0.01, 0]);
  torso.scale.setScalar(0.88);
  pawnTorso(b, torso, 1.0);
  // tabard skirt draped on saddle
  b.mesh(
    torso,
    geo.lathe(
      [
        [0.09, 0.03],
        [0.12, -0.03],
        [0.14, -0.08],
        [0.136, -0.085],
      ],
      32,
    ),
    "cloth",
    { s: [1, 1, 0.9] },
  );
  const head2 = b.joint("head", torso, [0, 0.27, 0]);
  b.mesh(head2, geo.cyl(0.028, 0.032, 0.04, 12), "metal", { p: [0, 0.012, 0] });
  const helm = b.group(head2, [0, 0.07, 0]);
  // great helm
  b.mesh(helm, geo.cyl(0.054, 0.056, 0.1, 24), "metal", { p: [0, 0, 0] });
  b.mesh(helm, geo.sphere(0.054, 24, 8, 0, PI * 2, 0, PI * 0.3), "metal", { p: [0, 0.035, 0] });
  b.mesh(helm, geo.box(0.085, 0.009, 0.02), "dark", { p: [0, 0.012, 0.048] });
  b.mesh(helm, geo.box(0.07, 0.005, 0.006), "glow", { p: [0, 0.012, 0.05] });
  b.mesh(helm, geo.box(0.012, 0.09, 0.012), "accent", { p: [0, -0.005, 0.054] });
  b.mesh(helm, geo.box(0.07, 0.01, 0.01), "accent", { p: [0, -0.02, 0.054] });
  for (let i = 0; i < 4; i++) b.mesh(helm, geo.sphere(0.0035, 6, 4), "dark", { p: [0.02, -0.035 + i * 0.008, 0.055] });
  b.mesh(helm, geo.torus(0.055, 0.005, 6, 32), "accent", { p: [0, -0.048, 0], r: [PI / 2, 0, 0] });
  // crest + plume
  b.mesh(helm, geo.cone(0.02, 0.05, 12), "accent", { p: [0, 0.085, 0] });
  b.mesh(
    helm,
    geo.tube(
      [
        new THREE.Vector3(0, 0.1, 0),
        new THREE.Vector3(0, 0.14, -0.02),
        new THREE.Vector3(0, 0.16, -0.07),
        new THREE.Vector3(0, 0.14, -0.12),
        new THREE.Vector3(0, 0.09, -0.15),
      ],
      0.016,
      24,
      8,
    ),
    "cloth",
  );
  const R = arm(b, torso, "R", [-0.112, 0.225, 0], { upper: "metal", fore: "metal" });
  R.shoulder.rotation.set(-2.5, 0, -0.25);
  R.elbow.rotation.set(-0.5, 0, 0);
  mace(b, b.group(R.hand, [0, 0, 0], [PI - 0.3, 0, 0]));
  const L = arm(b, torso, "L", [0.112, 0.225, 0], { upper: "metal", fore: "metal" });
  L.shoulder.rotation.set(-0.5, 0, 0.25);
  L.elbow.rotation.set(-0.9, 0, 0);
  b.j.shield = shield(b, b.group(L.shoulder, [0.06, -0.1, 0.03], [0.1, 1.05, 0]), 0.07, 0.095, "star");
  return b.finish(1.5);
}

/* ================================================================== */
/* BISHOP - mitred prelate with crosier and blessing hand              */
/* ================================================================== */

function buildBishop(side: Side): Rig {
  const b = new Builder("b", side);
  plinth(b, 0.35);
  const F = figure(b, 1.34);
  // alb (under-robe)
  b.mesh(
    F,
    geo.lathe(
      [
        [0, T],
        [0.152, T],
        [0.154, T + 0.02],
        [0.14, 0.25],
        [0.118, 0.38],
        [0.098, 0.5],
        [0.092, 0.56],
        [0, 0.57],
      ],
      40,
    ),
    "body",
  );
  // hem detail
  b.mesh(F, geo.torus(0.149, 0.007, 6, 40), "accent", { p: [0, T + 0.018, 0], r: [PI / 2, 0, 0] });
  b.mesh(F, geo.torus(0.142, 0.005, 6, 40), "accent", { p: [0, T + 0.07, 0], r: [PI / 2, 0, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    b.mesh(F, geo.extrude(shapes.cross(0.018, 0.022, 0.006, 0.2), 0.004, 0.001), "accent", {
      p: [Math.sin(a) * 0.146, T + 0.04, Math.cos(a) * 0.146],
      r: [-0.05, a, 0],
    });
  }
  const torso = b.joint("torso", F, [0, 0.55, 0]);
  b.mesh(
    torso,
    geo.lathe(
      [
        [0, 0],
        [0.092, 0],
        [0.1, 0.1],
        [0.112, 0.2],
        [0.098, 0.25],
        [0.045, 0.28],
        [0, 0.285],
      ],
      32,
    ),
    "body",
    { s: [1, 1, 0.85] },
  );
  // chasuble
  b.mesh(
    torso,
    geo.lathe(
      [
        [0.055, 0.29],
        [0.112, 0.255],
        [0.123, 0.17],
        [0.126, 0.0],
        [0.134, -0.15],
        [0.128, -0.158],
      ],
      40,
    ),
    "cloth",
    { s: [1, 1, 0.9] },
  );
  // orphrey (gold Y-cross band)
  b.mesh(torso, geo.box(0.026, 0.4, 0.008), "accent", { p: [0, 0.06, 0.118], r: [0.03, 0, 0] });
  b.mesh(torso, geo.box(0.026, 0.4, 0.008), "accent", { p: [0, 0.06, -0.118], r: [-0.03, 0, 0] });
  b.mesh(torso, geo.extrude(shapes.cross(0.07, 0.1, 0.02, 0.2), 0.008, 0.002), "accent", { p: [0, 0.13, 0.122] });
  b.mesh(torso, geo.sphere(0.009, 8, 6), "glow", { p: [0, 0.15, 0.128] });
  // pectoral cross on chain
  b.mesh(torso, geo.torus(0.06, 0.003, 4, 24, PI), "accent", { p: [0, 0.27, 0.03], r: [-1.2, 0, PI] });

  const head = b.joint("head", torso, [0, 0.285, 0]);
  b.mesh(head, geo.cyl(0.024, 0.028, 0.04, 12), "body", { p: [0, 0.012, 0] });
  const hc = b.group(head, [0, 0.07, 0]);
  b.mesh(hc, geo.sphere(0.05, 20, 14), "body");
  face(b, hc, 0.05);
  b.mesh(hc, geo.sphere(0.044, 14, 10), "body", { p: [0, -0.038, 0.022], s: [1, 1.3, 0.7] }); // beard
  for (const x of [-1, 1]) b.mesh(hc, geo.capsule(0.006, 0.025, 3, 6), "body", { p: [x * 0.016, -0.018, 0.047], r: [0, 0, x * 1.1] }); // moustache
  // mitre
  const mitre = b.group(hc, [0, 0.025, 0]);
  b.mesh(mitre, geo.cyl(0.054, 0.052, 0.03, 24), "accent", { p: [0, 0.012, 0] });
  b.mesh(mitre, geo.extrude(shapes.mitre(0.054, 0.16), 0.016, 0.003), "body", { p: [0, 0.01, 0.012], r: [-0.07, 0, 0] });
  b.mesh(mitre, geo.extrude(shapes.mitre(0.054, 0.16), 0.016, 0.003), "body", { p: [0, 0.01, -0.012], r: [0.07, 0, 0] });
  b.mesh(mitre, geo.box(0.014, 0.13, 0.006), "accent", { p: [0, 0.075, 0.022], r: [-0.07, 0, 0] });
  b.mesh(mitre, geo.extrude(shapes.cross(0.045, 0.06, 0.012, 0.2), 0.005, 0.001), "accent", {
    p: [0, 0.1, 0.025],
    r: [-0.07, 0, 0],
  });
  b.mesh(mitre, geo.sphere(0.006, 8, 6), "glow", { p: [0, 0.035, 0.028] });
  for (const x of [-1, 1]) b.mesh(mitre, geo.box(0.016, 0.09, 0.004), "cloth", { p: [x * 0.022, -0.05, -0.05], r: [0.2, 0, 0] });

  // blessing arm
  const R = arm(b, torso, "R", [-0.112, 0.235, 0], { sleeve: "cloth", pauldron: null, hand: "body", upper: "cloth", fore: "cloth" });
  R.shoulder.rotation.set(-0.45, 0, -0.22);
  R.elbow.rotation.set(-2.15, 0, 0.1);
  for (const x of [-0.006, 0.006]) b.mesh(R.hand, geo.capsule(0.005, 0.02), "body", { p: [x, 0.025, 0] });
  // crosier arm
  const L = arm(b, torso, "L", [0.112, 0.235, 0], { sleeve: "cloth", pauldron: null, hand: "body", upper: "cloth", fore: "cloth" });
  L.shoulder.rotation.set(-0.35, 0, 0.1);
  L.elbow.rotation.set(-0.95, 0, 0);
  const staff = b.group(L.hand, [0, 0, 0], [1.3, 0, -0.1]);
  b.j.staff = staff;
  b.mesh(staff, geo.cyl(0.008, 0.008, 0.72, 10), "accent", { p: [0, 0.04, 0] });
  b.mesh(staff, geo.sphere(0.018, 12, 10), "accent", { p: [0, 0.37, 0] });
  b.mesh(staff, geo.cyl(0.014, 0.01, 0.03, 10), "accent", { p: [0, 0.395, 0] });
  const crook: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = t * PI * 1.6;
    const r = 0.055 * (1 - t * 0.55);
    crook.push(new THREE.Vector3(0, 0.44 + Math.sin(a) * r - 0.0 + (t < 0.05 ? -0.03 * (1 - t / 0.05) : 0), -Math.cos(a) * r + 0.055));
  }
  crook.unshift(new THREE.Vector3(0, 0.4, 0));
  b.mesh(staff, geo.tube(crook, 0.008, 48, 8), "accent");
  b.mesh(staff, geo.sphere(0.014, 12, 10), "glow", { p: [0, 0.445, 0.055] });
  b.anchor("staffTop", staff, [0, 0.445, 0.055]);
  return b.finish(1.35);
}

/* ================================================================== */
/* ROOK - living siege tower with banner and a hidden cannon           */
/* ================================================================== */

function buildRook(side: Side): Rig {
  const b = new Builder("r", side);
  plinth(b, 0.38);
  const F = figure(b, 1.2);
  const tower = b.joint("tower", F, [0, T, 0]);
  const TW = b.group(tower, [0, -T, 0]);
  b.mesh(
    TW,
    uvByHeight(
      geo.lathe(
        [
          [0, T],
          [0.245, T],
          [0.245, T + 0.05],
          [0.232, T + 0.06],
          [0.222, 0.22],
          [0.2, 0.8],
          [0, 0.8],
        ],
        48,
      ),
      3,
      1.6,
    ),
    "stone",
  );
  b.mesh(TW, geo.torus(0.226, 0.013, 8, 48), "body", { p: [0, 0.22, 0], r: [PI / 2, 0, 0] });
  b.mesh(TW, geo.torus(0.209, 0.009, 8, 48), "body", { p: [0, 0.52, 0], r: [PI / 2, 0, 0] });
  // corbelled machicolation ring
  b.mesh(TW, geo.lathe([[0.199, 0.74], [0.215, 0.79], [0.255, 0.84], [0.2, 0.845]], 48), "body");
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    b.mesh(TW, geo.box(0.02, 0.05, 0.04), "body", {
      p: [Math.sin(a) * 0.215, 0.77, Math.cos(a) * 0.215],
      r: [0, a, 0],
    });
  }
  // arrow slits
  for (const [a, y] of [
    [PI / 2, 0.45],
    [-PI / 2, 0.45],
    [PI, 0.45],
    [PI / 4, 0.6],
    [-PI / 4, 0.6],
    [(3 * PI) / 4, 0.62],
    [(-3 * PI) / 4, 0.62],
  ]) {
    const r = 0.212 - (y - 0.22) * 0.04;
    b.mesh(TW, geo.box(0.018, 0.085, 0.02), "dark", { p: [Math.sin(a) * r, y, Math.cos(a) * r], r: [0, a, 0] });
    b.mesh(TW, geo.box(0.05, 0.008, 0.02), "dark", { p: [Math.sin(a) * r, y, Math.cos(a) * r], r: [0, a, 0] });
  }
  // glowing "eyes" - two lit windows facing forward
  for (const a of [-0.32, 0.32]) {
    const r = 0.2;
    const g = b.group(TW, [Math.sin(a) * r, 0.62, Math.cos(a) * r], [0, a, 0]);
    b.mesh(g, geo.extrude(shapes.arch(0.042, 0.07), 0.012, 0.002), "accent", { p: [0, -0.035, 0.004], s: [1.3, 1.15, 1] });
    b.mesh(g, geo.extrude(shapes.arch(0.032, 0.06), 0.014, 0.001), "glow", { p: [0, -0.03, 0.008] });
  }
  // gate
  const gate = b.group(TW, [0, 0.21, 0.226], [-0.03, 0, 0]);
  b.mesh(gate, geo.extrude(shapes.arch(0.12, 0.17), 0.02, 0.004), "accent", { p: [0, -0.01, 0] });
  b.mesh(gate, geo.extrude(shapes.arch(0.095, 0.15), 0.022, 0.002), "dark", { p: [0, 0, 0.004] });
  for (let i = -1; i <= 1; i++) b.mesh(gate, geo.box(0.006, 0.14, 0.006), "metal", { p: [i * 0.028, 0.07, 0.017] });
  for (let i = 0; i < 3; i++) b.mesh(gate, geo.box(0.09, 0.006, 0.006), "metal", { p: [0, 0.025 + i * 0.045, 0.017] });

  // --- turret top (rotates to "look around") ---
  const top = b.joint("top", TW, [0, 0.84, 0]);
  b.mesh(
    top,
    geo.lathe(
      [
        [0.205, 0],
        [0.258, 0],
        [0.258, 0.07],
        [0.205, 0.07],
        [0.205, 0],
      ],
      48,
    ),
    "body",
  );
  b.mesh(top, geo.cyl(0.206, 0.206, 0.02, 32), "dark", { p: [0, 0.02, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8;
    b.mesh(top, geo.box(0.075, 0.075, 0.053), "stone", { p: [Math.sin(a) * 0.231, 0.107, Math.cos(a) * 0.231], r: [0, a, 0] });
    b.mesh(top, geo.box(0.083, 0.012, 0.06), "body", { p: [Math.sin(a) * 0.231, 0.148, Math.cos(a) * 0.231], r: [0, a, 0] });
  }
  // banner pole + waving flag
  b.mesh(top, geo.cyl(0.006, 0.007, 0.36, 8), "dark", { p: [-0.09, 0.2, -0.09] });
  b.mesh(top, geo.sphere(0.012, 10, 8), "accent", { p: [-0.09, 0.385, -0.09] });
  const flagGeo = new THREE.PlaneGeometry(0.17, 0.1, 14, 6);
  flagGeo.translate(0.085, 0, 0);
  const flag = b.mesh(top, flagGeo, "cloth", { p: [-0.09, 0.32, -0.09], keep: true, name: "flag" });
  b.extras.flag = { mesh: flag, base: Float32Array.from(flagGeo.attributes.position.array as Float32Array) };
  b.j.flag = flag;

  // hidden cannon - rises out of the battlements to fire
  const cannon = b.joint("cannon", top, [0, -0.09, 0.02]);
  const barrel = b.group(cannon, [0, 0, -0.06], [PI / 2, 0, 0]);
  b.mesh(
    barrel,
    geo.lathe(
      [
        [0, 0],
        [0.038, 0],
        [0.042, 0.03],
        [0.034, 0.045],
        [0.03, 0.17],
        [0.036, 0.18],
        [0.036, 0.2],
        [0.024, 0.2],
        [0.024, 0.19],
        [0, 0.19],
      ],
      24,
    ),
    "metal",
  );
  b.mesh(barrel, geo.torus(0.034, 0.005, 6, 24), "accent", { p: [0, 0.06, 0], r: [PI / 2, 0, 0] });
  b.mesh(barrel, geo.torus(0.031, 0.005, 6, 24), "accent", { p: [0, 0.13, 0], r: [PI / 2, 0, 0] });
  b.mesh(cannon, geo.box(0.1, 0.04, 0.12), "dark", { p: [0, -0.03, -0.02] });
  b.anchor("muzzle", barrel, [0, 0.21, 0]);
  return b.finish(1.28);
}

/* ================================================================== */
/* QUEEN - sorceress-queen with crown, high collar, cape and sceptre   */
/* ================================================================== */

function crownRing(b: Builder, parent: THREE.Object3D, r: number, h: number, points: number, pointH: number) {
  b.mesh(
    parent,
    geo.lathe(
      [
        [r * 0.9, 0],
        [r, 0],
        [r * 1.08, h],
        [r * 0.98, h],
        [r * 0.9, 0],
      ],
      32,
    ),
    "accent",
  );
  for (let i = 0; i < points; i++) {
    const a = (i / points) * PI * 2;
    const x = Math.sin(a) * r * 1.04, z = Math.cos(a) * r * 1.04;
    b.mesh(parent, geo.cone(0.009, pointH, 8), "accent", { p: [x, h + pointH / 2, z], r: [Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15] });
    b.mesh(parent, geo.sphere(0.006, 8, 6), "glow", { p: [x * 1.06, h + pointH + 0.002, z * 1.06] });
    b.mesh(parent, geo.sphere(0.0055, 8, 6), i % 2 ? "glow" : "accent", { p: [x * 1.02, h * 0.5, z * 1.02] });
  }
}

function buildQueen(side: Side): Rig {
  const b = new Builder("q", side);
  plinth(b, 0.36);
  const F = figure(b, 1.5);
  // gown
  const gown = b.joint("gown", F, [0, T, 0]);
  const G = b.group(gown, [0, -T, 0]);
  b.mesh(
    G,
    geo.lathe(
      [
        [0, T],
        [0.168, T],
        [0.171, T + 0.014],
        [0.158, 0.2],
        [0.13, 0.3],
        [0.1, 0.42],
        [0.078, 0.54],
        [0.071, 0.6],
        [0, 0.61],
      ],
      44,
    ),
    "body",
  );
  b.mesh(G, geo.torus(0.165, 0.008, 6, 44), "accent", { p: [0, T + 0.016, 0], r: [PI / 2, 0, 0] });
  for (const [y, r] of [
    [0.22, 0.152],
    [0.3, 0.131],
  ])
    b.mesh(G, geo.torus(r, 0.01, 8, 44), "body", { p: [0, y, 0], r: [PI / 2, 0, 0] });
  // jewelled front panel
  for (let i = 0; i < 5; i++) b.mesh(G, geo.sphere(0.007, 8, 6), "accent", { p: [0, 0.2 + i * 0.075, 0.163 - i * 0.021] });
  // open-front overskirt
  b.mesh(
    G,
    geo.lathe(
      [
        [0.077, 0.6],
        [0.1, 0.5],
        [0.136, 0.35],
        [0.176, 0.16],
        [0.18, 0.152],
      ],
      44,
      0.55,
      PI * 2 - 1.1,
    ),
    "cloth",
  );
  const torso = b.joint("torso", F, [0, 0.6, 0]);
  b.mesh(
    torso,
    geo.lathe(
      [
        [0, 0],
        [0.072, 0],
        [0.08, 0.06],
        [0.092, 0.13],
        [0.086, 0.17],
        [0.05, 0.2],
        [0, 0.205],
      ],
      32,
    ),
    "body",
    { s: [1, 1, 0.85] },
  );
  b.mesh(torso, geo.torus(0.074, 0.008, 6, 32), "accent", { p: [0, 0.01, 0], r: [PI / 2, 0, 0], s: [1, 0.85, 1] });
  b.mesh(torso, geo.torus(0.048, 0.004, 6, 32), "accent", { p: [0, 0.185, 0.008], r: [PI / 2 - 0.3, 0, 0] });
  b.mesh(torso, geo.extrude(shapes.star(0.016, 0.007, 4), 0.006, 0.001), "glow", { p: [0, 0.15, 0.072] });
  // cape
  b.mesh(
    torso,
    geo.lathe(
      [
        [0.075, 0.2],
        [0.11, 0.16],
        [0.14, -0.1],
        [0.2, -0.42],
        [0.205, -0.455],
      ],
      36,
      PI / 2 + 0.35,
      PI - 0.7,
    ),
    "cloth",
  );
  // Medici collar
  b.mesh(
    torso,
    geo.lathe(
      [
        [0.05, 0.18],
        [0.07, 0.25],
        [0.095, 0.31],
        [0.097, 0.315],
      ],
      28,
      PI / 2 + 0.2,
      PI - 0.4,
    ),
    "cloth",
  );
  b.mesh(torso, geo.torus(0.097, 0.004, 4, 28, PI - 0.4), "accent", { p: [0, 0.313, 0], r: [PI / 2, 0, PI / 2 + 0.2 + PI / 2] });

  const head = b.joint("head", torso, [0, 0.205, 0]);
  b.mesh(head, geo.cyl(0.021, 0.026, 0.05, 12), "body", { p: [0, 0.015, 0] });
  const hc = b.group(head, [0, 0.07, 0]);
  b.mesh(hc, geo.sphere(0.048, 20, 14), "body", { s: [0.95, 1.06, 1] });
  face(b, hc, 0.048);
  b.mesh(hc, geo.sphere(0.052, 20, 14, 0, PI * 2, 0, PI * 0.62), "body", { p: [0, 0.006, -0.008], r: [-0.35, 0, 0] });
  b.mesh(hc, geo.sphere(0.03, 14, 10), "body", { p: [0, 0.01, -0.055] });
  for (const x of [-1, 1]) b.mesh(hc, geo.capsule(0.014, 0.07), "body", { p: [x * 0.042, -0.05, -0.02], r: [0.15, 0, x * 0.1] });
  const crown = b.group(hc, [0, 0.035, -0.004], [-0.12, 0, 0]);
  crownRing(b, crown, 0.046, 0.028, 8, 0.04);
  b.anchor("crown", crown, [0, 0.07, 0]);

  // sceptre arm
  const R = arm(b, torso, "R", [-0.09, 0.165, 0], { sleeve: "cloth", pauldron: null, hand: "body", upper: "cloth", fore: "body", upperR: 0.02, foreR: 0.017 });
  R.shoulder.rotation.set(-0.25, 0, -0.15);
  R.elbow.rotation.set(-1.25, 0, 0.1);
  const sc = b.group(R.hand, [0, 0, 0], [1.45, 0, 0]);
  b.j.sceptre = sc;
  b.mesh(sc, geo.cyl(0.007, 0.006, 0.32, 10), "accent", { p: [0, 0.07, 0] });
  b.mesh(sc, geo.sphere(0.011, 8, 6), "accent", { p: [0, -0.09, 0] });
  b.mesh(sc, geo.torus(0.012, 0.004, 6, 16), "accent", { p: [0, 0.2, 0], r: [PI / 2, 0, 0] });
  b.mesh(sc, geo.sphere(0.022, 16, 12), "glow", { p: [0, 0.24, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    b.mesh(sc, geo.cone(0.006, 0.05, 6), "accent", {
      p: [Math.sin(a) * 0.02, 0.25, Math.cos(a) * 0.02],
      r: dirEuler(Math.sin(a) * 0.5, 1, Math.cos(a) * 0.5),
    });
  }
  b.mesh(sc, geo.cone(0.008, 0.06, 8), "accent", { p: [0, 0.29, 0] });
  b.anchor("sceptreTop", sc, [0, 0.24, 0]);
  const L = arm(b, torso, "L", [0.09, 0.165, 0], { sleeve: "cloth", pauldron: null, hand: "body", upper: "cloth", fore: "body", upperR: 0.02, foreR: 0.017 });
  L.shoulder.rotation.set(-0.35, 0, 0.35);
  L.elbow.rotation.set(-1.1, 0, -0.3);
  return b.finish(1.58);
}

/* ================================================================== */
/* KING - bearded monarch, ermine mantle, greatsword planted           */
/* ================================================================== */

function buildKing(side: Side): Rig {
  const b = new Builder("k", side);
  plinth(b, 0.37);
  const F = figure(b, 1.58);
  b.mesh(
    F,
    geo.lathe(
      [
        [0, T],
        [0.16, T],
        [0.162, T + 0.02],
        [0.148, 0.25],
        [0.125, 0.4],
        [0.105, 0.52],
        [0.1, 0.57],
        [0, 0.58],
      ],
      44,
    ),
    "body",
  );
  // ermine hem with tails
  b.mesh(F, geo.torus(0.158, 0.018, 8, 44), "fur", { p: [0, T + 0.02, 0], r: [PI / 2, 0, 0] });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * PI * 2;
    b.mesh(F, geo.capsule(0.004, 0.012), "dark", { p: [Math.sin(a) * 0.174, T + 0.02, Math.cos(a) * 0.174] });
  }
  // embroidered front panel
  b.mesh(F, geo.box(0.05, 0.36, 0.01), "cloth", { p: [0, 0.36, 0.13], r: [-0.16, 0, 0] });
  for (let i = 0; i < 4; i++)
    b.mesh(F, geo.extrude(shapes.star(0.014, 0.006, 6), 0.005, 0.001), "accent", { p: [0, 0.22 + i * 0.08, 0.15 - i * 0.012] });
  const torso = b.joint("torso", F, [0, 0.56, 0]);
  b.mesh(
    torso,
    geo.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.106, 0.1],
        [0.118, 0.2],
        [0.105, 0.25],
        [0.05, 0.28],
        [0, 0.285],
      ],
      32,
    ),
    "body",
    { s: [1, 1, 0.86] },
  );
  b.mesh(torso, geo.torus(0.1, 0.012, 8, 32), "accent", { p: [0, 0.03, 0], r: [PI / 2, 0, 0], s: [1.02, 0.88, 1] });
  // royal mantle
  b.mesh(
    torso,
    geo.lathe(
      [
        [0.08, 0.27],
        [0.125, 0.22],
        [0.14, 0.0],
        [0.18, -0.25],
        [0.205, -0.41],
        [0.21, -0.43],
      ],
      40,
      PI / 2 + 0.25,
      PI - 0.5,
    ),
    "cloth",
  );
  // ermine collar
  b.mesh(torso, geo.torus(0.088, 0.03, 10, 32), "fur", { p: [0, 0.245, 0], r: [PI / 2, 0, 0], s: [1.05, 0.9, 1] });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    b.mesh(torso, geo.capsule(0.004, 0.01), "dark", { p: [Math.sin(a) * 0.113, 0.245, Math.cos(a) * 0.1], r: [PI / 2, a, 0] });
  }
  b.mesh(torso, geo.torus(0.05, 0.004, 4, 24, PI), "accent", { p: [0, 0.22, 0.06], r: [-1.1, 0, PI] });
  b.mesh(torso, geo.extrude(shapes.star(0.02, 0.008, 6), 0.006, 0.001), "accent", { p: [0, 0.165, 0.103] });

  const head = b.joint("head", torso, [0, 0.285, 0]);
  b.mesh(head, geo.cyl(0.024, 0.028, 0.04, 12), "body", { p: [0, 0.012, 0] });
  const hc = b.group(head, [0, 0.07, 0]);
  b.mesh(hc, geo.sphere(0.052, 20, 14), "body");
  face(b, hc, 0.052);
  // long beard and hair
  b.mesh(
    hc,
    geo.lathe(
      [
        [0, -0.13],
        [0.02, -0.11],
        [0.04, -0.06],
        [0.05, -0.02],
        [0.05, 0.0],
        [0, 0.005],
      ],
      20,
    ),
    "body",
    { p: [0, -0.005, 0.02], s: [1, 1, 0.65], r: [0.15, 0, 0] },
  );
  // braided beard strands (sculpted ridges)
  for (let i = 0; i < 5; i++)
    b.mesh(hc, geo.capsule(0.006, 0.07, 3, 6), "body", { p: [(i - 2) * 0.013, -0.07, 0.05 - Math.abs(i - 2) * 0.006], r: [0.2, 0, (i - 2) * 0.06] });
  for (const x of [-1, 1]) b.mesh(hc, geo.capsule(0.007, 0.03, 3, 6), "body", { p: [x * 0.018, -0.02, 0.05], r: [0, 0, x * 1.2] });
  b.mesh(hc, geo.sphere(0.056, 20, 14, 0, PI * 2, 0, PI * 0.55), "body", { p: [0, 0.004, -0.01], r: [-0.5, 0, 0] });
  // crown with arches, orb & cross
  const crown = b.group(hc, [0, 0.035, 0]);
  b.mesh(crown, geo.sphere(0.047, 18, 10, 0, PI * 2, 0, PI * 0.5), "cloth", { p: [0, 0.02, 0] });
  crownRing(b, crown, 0.052, 0.038, 4, 0.03);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    b.mesh(crown, geo.extrude(shapes.cross(0.03, 0.035, 0.01, 0.15), 0.006, 0.001), "accent", {
      p: [Math.sin(a) * 0.055, 0.05, Math.cos(a) * 0.055],
      r: [0, a, 0],
    });
  }
  for (const rot of [0, PI / 2])
    b.mesh(crown, geo.torus(0.05, 0.005, 6, 24, PI), "accent", { p: [0, 0.035, 0], r: [0, rot, 0], s: [1, 1.2, 1] });
  b.mesh(crown, geo.sphere(0.014, 12, 10), "accent", { p: [0, 0.098, 0] });
  b.mesh(crown, geo.extrude(shapes.cross(0.035, 0.05, 0.011, 0.15), 0.008, 0.0015), "accent", { p: [0, 0.13, 0] });
  b.mesh(crown, geo.sphere(0.006, 8, 6), "glow", { p: [0, 0.134, 0.006] });
  b.anchor("crown", crown, [0, 0.13, 0]);

  // arms resting on the pommel of a planted greatsword
  const R = arm(b, torso, "R", [-0.12, 0.235, 0], { sleeve: "cloth", pauldron: "accent", upper: "cloth", fore: "cloth", upperR: 0.026, foreR: 0.024 });
  R.shoulder.rotation.set(...aimDown(0.085, -0.1, 0.16));
  R.elbow.rotation.set(-0.35, 0, 0);
  const L = arm(b, torso, "L", [0.12, 0.235, 0], { sleeve: "cloth", pauldron: "accent", upper: "cloth", fore: "cloth", upperR: 0.026, foreR: 0.024 });
  L.shoulder.rotation.set(...aimDown(-0.085, -0.1, 0.16));
  L.elbow.rotation.set(-0.35, 0, 0);
  // the sword hangs off the torso (pivot at the grip) so the attack can swing it freely
  const gs = b.joint("greatsword", torso, [0, 0.07, 0.13], [PI, 0, 0]);
  sword(b, gs, 0.44, 0.03);
  return b.finish(1.78);
}

/* ================================================================== */

const builders: Record<PieceSymbol, (s: Side) => Rig> = {
  p: buildPawn,
  n: buildKnight,
  b: buildBishop,
  r: buildRook,
  q: buildQueen,
  k: buildKing,
};

export function buildRig(kind: PieceSymbol, side: Side): Rig {
  return builders[kind](side);
}
