import * as THREE from "three";
import { glowTexture, smokeTexture } from "../textures";
import type { Actor } from "../anim/actors";

/**
 * Imperative effects layer. Every effect is a plain object with an update()
 * that returns false when finished. The scene mounts `fx.group` once.
 */

interface Effect {
  update(dt: number): boolean;
  dispose?(): void;
}

export type ShatterStyle = "slash" | "crush" | "holy" | "arcane" | "explode" | "cleave";

const UP = new THREE.Vector3(0, 1, 0);
const FLOOR = 0.0;

class FXManager {
  group = new THREE.Group();
  light = new THREE.PointLight("#ffffff", 0, 7, 1.6);
  private effects: Effect[] = [];
  private lightLife = 0;
  private lightMax = 0;
  private lightDecay = 1;
  shake = 0;

  constructor() {
    this.group.name = "fx";
    this.light.position.set(0, 1.5, 0);
    this.group.add(this.light);
  }

  update(dt: number) {
    this.effects = this.effects.filter((e) => {
      const alive = e.update(dt);
      if (!alive) e.dispose?.();
      return alive;
    });
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      const k = Math.max(0, this.lightLife / this.lightDecay);
      this.light.intensity = this.lightMax * k * k;
    } else this.light.intensity = 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  clear() {
    for (const e of this.effects) e.dispose?.();
    this.effects = [];
    this.shake = 0;
  }

  add(e: Effect) {
    this.effects.push(e);
  }

  /* -------------------------------------------------------------- */

  pulse(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity = 30, dur = 0.5) {
    this.light.position.copy(pos);
    this.light.color.set(color);
    this.lightMax = intensity;
    this.lightLife = dur;
    this.lightDecay = dur;
  }

  addShake(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }

  flash(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 1.2, dur = 0.45) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(color).multiplyScalar(3),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    this.group.add(s);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt / dur;
        s.scale.setScalar(size * (0.4 + t * 1.2));
        mat.opacity = Math.max(0, 1 - t);
        return t < 1;
      },
      dispose: () => {
        this.group.remove(s);
        mat.dispose();
      },
    });
  }

  /** Generic particle burst. */
  particles(
    pos: THREE.Vector3,
    opts: {
      count?: number;
      color?: THREE.ColorRepresentation;
      speed?: number;
      up?: number;
      gravity?: number;
      size?: number;
      life?: number;
      spread?: number;
      additive?: boolean;
      smoke?: boolean;
      dir?: THREE.Vector3;
      swirl?: number;
    } = {},
  ) {
    const n = opts.count ?? 40;
    const life = opts.life ?? 1;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const spread = opts.spread ?? 0.1;
      p[i * 3] = pos.x + (Math.random() - 0.5) * spread;
      p[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread;
      p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      d.multiplyScalar((opts.speed ?? 2) * (0.3 + Math.random() * 0.7));
      d.y += (opts.up ?? 1) * Math.random();
      if (opts.dir) d.addScaledVector(opts.dir, Math.random());
      v.push(d);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({
      map: opts.smoke ? smokeTexture() : glowTexture(),
      color: new THREE.Color(opts.color ?? "#ffcf80").multiplyScalar(opts.additive === false ? 1 : 2.5),
      size: opts.size ?? 0.08,
      transparent: true,
      depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      toneMapped: opts.additive === false,
      opacity: opts.smoke ? 0.55 : 1,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    let t = 0;
    const grav = opts.gravity ?? 4;
    const swirl = opts.swirl ?? 0;
    const startOpacity = mat.opacity;
    const baseSize = mat.size;
    this.add({
      update: (dt) => {
        t += dt;
        const k = t / life;
        for (let i = 0; i < n; i++) {
          const vi = v[i];
          vi.y -= grav * dt;
          if (swirl) {
            const dx = p[i * 3] - pos.x, dz = p[i * 3 + 2] - pos.z;
            vi.x += -dz * swirl * dt;
            vi.z += dx * swirl * dt;
          }
          vi.multiplyScalar(opts.smoke ? 0.96 : 0.99);
          p[i * 3] += vi.x * dt;
          p[i * 3 + 1] = Math.max(FLOOR + 0.01, p[i * 3 + 1] + vi.y * dt);
          p[i * 3 + 2] += vi.z * dt;
        }
        g.attributes.position.needsUpdate = true;
        mat.opacity = startOpacity * Math.max(0, 1 - k);
        if (opts.smoke) mat.size = baseSize * (1 + k * 2);
        return k < 1;
      },
      dispose: () => {
        this.group.remove(pts);
        g.dispose();
        mat.dispose();
      },
    });
  }

  dust(pos: THREE.Vector3, amount = 1) {
    this.particles(pos.clone().setY(0.05), {
      count: Math.floor(18 * amount),
      color: "#b8ad9a",
      smoke: true,
      additive: false,
      speed: 1.2 * amount,
      up: 0.3,
      gravity: -0.2,
      size: 0.35,
      life: 1.1,
      spread: 0.4,
    });
  }

  shockwave(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius = 1.4, dur = 0.6) {
    const geo = new THREE.RingGeometry(0.85, 1, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).setY(0.02);
    this.group.add(m);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt / dur;
        const e = 1 - Math.pow(1 - Math.min(t, 1), 3);
        m.scale.setScalar(0.05 + e * radius);
        mat.opacity = Math.max(0, 1 - t);
        return t < 1;
      },
      dispose: () => {
        this.group.remove(m);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /** Arc-shaped sword trail at pos, facing yaw. */
  slash(pos: THREE.Vector3, yaw: number, color: THREE.ColorRepresentation, size = 0.5, tilt = 0.6, dur = 0.35) {
    const geo = new THREE.TorusGeometry(size, 0.02, 4, 32, Math.PI * 0.9);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(4),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const m = new THREE.Mesh(geo, mat);
    const holder = new THREE.Group();
    holder.position.copy(pos);
    holder.rotation.set(0, yaw + Math.PI / 2, 0);
    m.rotation.set(tilt, 0, 0);
    holder.add(m);
    this.group.add(holder);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt / dur;
        m.rotation.z = -1.6 + t * 2.2;
        m.scale.set(1 + t * 0.3, 1 + t * 0.3, 0.3);
        mat.opacity = Math.max(0, 1 - t * t);
        return t < 1;
      },
      dispose: () => {
        this.group.remove(holder);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /** A beam of light from a to b (returns a handle to stop it). */
  beam(a: () => THREE.Vector3, b: () => THREE.Vector3, color: THREE.ColorRepresentation, width = 0.05) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    geo.translate(0, 0.5, 0);
    const outerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.55,
    });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(4), toneMapped: false, transparent: true });
    const outer = new THREE.Mesh(geo, outerMat);
    const core = new THREE.Mesh(geo, coreMat);
    const g = new THREE.Group();
    g.add(outer, core);
    this.group.add(g);
    let t = 0;
    let fading = -1;
    const q = new THREE.Quaternion();
    this.add({
      update: (dt) => {
        t += dt;
        const A = a(), B = b();
        const d = B.clone().sub(A);
        const len = d.length();
        q.setFromUnitVectors(UP, d.normalize());
        g.position.copy(A);
        g.quaternion.copy(q);
        const grow = Math.min(1, t / 0.15);
        let f = 1;
        if (fading >= 0) {
          fading += dt;
          f = Math.max(0, 1 - fading / 0.3);
        }
        const wob = 1 + Math.sin(t * 40) * 0.2;
        outer.scale.set(width * 2.2 * wob * f, len * grow, width * 2.2 * wob * f);
        core.scale.set(width * 0.6 * f, len * grow, width * 0.6 * f);
        return !(fading >= 0 && f <= 0);
      },
      dispose: () => {
        this.group.remove(g);
        geo.dispose();
        outerMat.dispose();
        coreMat.dispose();
      },
    });
    return { stop: () => (fading = 0) };
  }

  /** Radiant cross that descends upon a target and holds. */
  holyCross(pos: THREE.Vector3, color: THREE.ColorRepresentation, dur = 1.6) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(3.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), mat);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.09), mat);
    h.position.y = 0.2;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(color).multiplyScalar(2),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    halo.scale.setScalar(1.6);
    halo.position.y = 0.2;
    g.add(v, h, halo);
    // light pillar
    const pillarGeo = new THREE.CylinderGeometry(0.42, 0.42, 6, 24, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      opacity: 0,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.copy(pos).setY(3);
    this.group.add(pillar);
    g.position.copy(pos).add(new THREE.Vector3(0, 3.5, 0));
    this.group.add(g);
    let t = 0;
    const target = pos.y + 1.35;
    this.add({
      update: (dt) => {
        t += dt;
        const k = t / dur;
        const drop = Math.min(1, t / 0.45);
        g.position.y = THREE.MathUtils.lerp(pos.y + 3.5, target, 1 - Math.pow(1 - drop, 3));
        g.rotation.y = Math.sin(t * 1.5) * 0.2;
        const fade = k > 0.75 ? Math.max(0, 1 - (k - 0.75) / 0.25) : 1;
        mat.opacity = fade;
        (halo.material as THREE.SpriteMaterial).opacity = fade * (0.7 + Math.sin(t * 12) * 0.2);
        pillarMat.opacity = Math.min(0.35, t * 0.8) * fade;
        return k < 1;
      },
      dispose: () => {
        this.group.remove(g, pillar);
        v.geometry.dispose();
        h.geometry.dispose();
        mat.dispose();
        (halo.material as THREE.Material).dispose();
        pillarGeo.dispose();
        pillarMat.dispose();
      },
    });
  }

  /** Cannonball on a ballistic arc. Resolves on impact. */
  cannonball(from: THREE.Vector3, to: THREE.Vector3, dur: number, arc = 0.6): Promise<void> {
    return new Promise((resolve) => {
      const geo = new THREE.SphereGeometry(0.06, 16, 12);
      const mat = new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.8, roughness: 0.4 });
      const ball = new THREE.Mesh(geo, mat);
      ball.castShadow = true;
      const trailMat = new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color("#ff8a3a").multiplyScalar(3),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const glow = new THREE.Sprite(trailMat);
      glow.scale.setScalar(0.3);
      ball.add(glow);
      this.group.add(ball);
      let t = 0;
      let puff = 0;
      this.add({
        update: (dt) => {
          t += dt / dur;
          const k = Math.min(1, t);
          ball.position.lerpVectors(from, to, k);
          ball.position.y += Math.sin(Math.PI * k) * arc;
          ball.rotation.x += dt * 20;
          puff += dt;
          if (puff > 0.03) {
            puff = 0;
            this.particles(ball.position.clone(), {
              count: 2,
              smoke: true,
              additive: false,
              color: "#777",
              speed: 0.1,
              up: 0.1,
              gravity: -0.3,
              size: 0.18,
              life: 0.7,
            });
          }
          if (k >= 1) {
            resolve();
            return false;
          }
          return true;
        },
        dispose: () => {
          this.group.remove(ball);
          geo.dispose();
          mat.dispose();
          trailMat.dispose();
        },
      });
    });
  }

  /** Arcane orbs that circle a caster then streak to a target. */
  orbs(center: () => THREE.Vector3, target: THREE.Vector3, color: THREE.ColorRepresentation, orbitTime: number, flyTime: number): Promise<void> {
    return new Promise((resolve) => {
      const n = 3;
      const mats: THREE.SpriteMaterial[] = [];
      const sprites: THREE.Sprite[] = [];
      for (let i = 0; i < n; i++) {
        const m = new THREE.SpriteMaterial({
          map: glowTexture(),
          color: new THREE.Color(color).multiplyScalar(4),
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
        const s = new THREE.Sprite(m);
        s.scale.setScalar(0.28);
        mats.push(m);
        sprites.push(s);
        this.group.add(s);
      }
      let t = 0;
      let resolved = false;
      const starts: THREE.Vector3[] = [];
      let trailT = 0;
      this.add({
        update: (dt) => {
          t += dt;
          const c = center();
          trailT += dt;
          for (let i = 0; i < n; i++) {
            const s = sprites[i];
            if (t < orbitTime) {
              const a = t * 7 + (i / n) * Math.PI * 2;
              const r = 0.35 + 0.1 * Math.sin(t * 5);
              s.position.set(c.x + Math.cos(a) * r, c.y + 0.1 * Math.sin(a * 2 + i), c.z + Math.sin(a) * r);
            } else {
              if (!starts[i]) starts[i] = s.position.clone();
              const k = Math.min(1, (t - orbitTime) / flyTime);
              const e = k * k;
              s.position.lerpVectors(starts[i], target, e);
              s.position.y += Math.sin(Math.PI * k) * 0.3 * (i - 1);
            }
            if (trailT > 0.04)
              this.particles(s.position.clone(), { count: 1, color, speed: 0.05, up: 0, gravity: 0, size: 0.1, life: 0.35 });
          }
          if (trailT > 0.04) trailT = 0;
          if (!resolved && t >= orbitTime + flyTime) {
            resolved = true;
            resolve();
            return false;
          }
          return true;
        },
        dispose: () => {
          sprites.forEach((s) => this.group.remove(s));
          mats.forEach((m) => m.dispose());
        },
      });
    });
  }

  /** Swirling vortex column. */
  vortex(pos: THREE.Vector3, color: THREE.ColorRepresentation, dur = 1) {
    this.particles(pos.clone().setY(0.1), {
      count: 70,
      color,
      speed: 0.6,
      up: 2.2,
      gravity: -0.4,
      size: 0.09,
      life: dur,
      spread: 0.6,
      swirl: 14,
    });
  }

  /* -------------------------------------------------------------- */
  /* Dismantle a piece into its component parts                      */
  /* -------------------------------------------------------------- */

  shatter(actor: Actor, style: ShatterStyle, dir: THREE.Vector3, power = 1) {
    const root = actor.rig.root;
    root.updateMatrixWorld(true);
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(root).getCenter(center);
    const chunks: {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      ang: THREE.Vector3;
      mat: THREE.Material;
    }[] = [];
    const glowColor = new THREE.Color(style === "holy" ? "#ffd98a" : style === "arcane" ? (actor.color === "w" ? "#b06bff" : "#7fd7ff") : "#ff7a2a");
    root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      const mat = src.clone();
      mat.transparent = true;
      const mesh = new THREE.Mesh(m.geometry, mat);
      m.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = true;
      this.group.add(mesh);
      // world-space centre of this chunk
      const bc = new THREE.Vector3();
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      bc.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
      const out = bc.clone().sub(center);
      out.y *= 0.3;
      out.normalize();
      const vel = new THREE.Vector3();
      const ang = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      switch (style) {
        case "slash":
        case "cleave": {
          const side = new THREE.Vector3(-dir.z, 0, dir.x);
          const s = Math.sign(out.dot(side)) || 1;
          vel.copy(side).multiplyScalar(s * (1 + Math.random()) * power).addScaledVector(dir, (1.2 + Math.random()) * power);
          vel.y = (style === "cleave" ? 1 : 2) + Math.random() * 2 * power;
          break;
        }
        case "crush":
          vel.copy(out).multiplyScalar((1.5 + Math.random() * 1.5) * power).addScaledVector(dir, 0.8 * power);
          vel.y = 0.5 + Math.random() * 1.5;
          break;
        case "explode":
          vel.copy(out).multiplyScalar((2 + Math.random() * 3) * power).addScaledVector(dir, 2 * power);
          vel.y = 2.5 + Math.random() * 3.5 * power;
          ang.multiplyScalar(2);
          break;
        case "holy":
          vel.copy(out).multiplyScalar(0.3 + Math.random() * 0.4);
          vel.y = 0.6 + Math.random() * 0.8;
          ang.multiplyScalar(0.2);
          break;
        case "arcane":
          vel.copy(out).multiplyScalar(1.5 + Math.random() * 2);
          vel.y = 1.5 + Math.random() * 2.5;
          vel.add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(3));
          break;
      }
      chunks.push({ mesh, vel, ang, mat });
    });
    root.visible = false;
    actor.dead = true;

    const gravity = style === "holy" ? -0.6 : style === "arcane" ? 3 : 9.8;
    const life = style === "holy" ? 2.2 : 2.6;
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        const k = t / life;
        for (const c of chunks) {
          const { mesh, vel, ang } = c;
          vel.y -= gravity * dt;
          if (style === "arcane" && t < 0.8) {
            const dx = mesh.position.x - center.x, dz = mesh.position.z - center.z;
            vel.x += -dz * 6 * dt;
            vel.z += dx * 6 * dt;
          }
          mesh.position.addScaledVector(vel, dt);
          mesh.rotation.x += ang.x * dt;
          mesh.rotation.y += ang.y * dt;
          mesh.rotation.z += ang.z * dt;
          if (mesh.position.y < FLOOR + 0.02 && style !== "holy") {
            mesh.position.y = FLOOR + 0.02;
            if (Math.abs(vel.y) > 0.3) vel.y = -vel.y * 0.35;
            else vel.y = 0;
            vel.x *= 0.6;
            vel.z *= 0.6;
            ang.multiplyScalar(0.6);
          }
          const m = c.mat as THREE.MeshStandardMaterial;
          if (style === "holy" || style === "arcane") {
            if (m.emissive) {
              m.emissive.copy(glowColor);
              m.emissiveIntensity = Math.min(3, t * 4);
            }
          } else if (m.emissive && t < 0.25) {
            m.emissive.copy(glowColor);
            m.emissiveIntensity = (0.25 - t) * 8;
          } else if (m.emissive) m.emissiveIntensity = 0;
          const fadeStart = style === "holy" ? 0.35 : 0.65;
          const f = k < fadeStart ? 1 : Math.max(0, 1 - (k - fadeStart) / (1 - fadeStart));
          m.opacity = f;
          if (style === "holy") mesh.scale.multiplyScalar(1 - dt * 0.4);
        }
        return k < 1;
      },
      dispose: () => {
        for (const c of chunks) {
          this.group.remove(c.mesh);
          c.mat.dispose();
        }
      },
    });

    // accompanying burst
    const col = style === "holy" ? "#ffe0a0" : style === "arcane" ? glowColor : "#ffb070";
    this.particles(center, {
      count: style === "explode" ? 60 : 35,
      color: col,
      speed: style === "explode" ? 4 : 2,
      up: 1.5,
      gravity: style === "holy" ? -1 : 5,
      size: 0.07,
      life: style === "holy" ? 1.6 : 0.9,
      spread: 0.3,
    });
    if (style !== "holy") this.dust(center, style === "explode" ? 1.6 : 1);
  }
}

export const fx = new FXManager();
