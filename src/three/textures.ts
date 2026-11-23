import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Tiny value-noise implementation (deterministic, no deps)           */
/* ------------------------------------------------------------------ */

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise with period p. */
function vnoise(x: number, y: number, p: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, octaves: number, period: number, seed = 1) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, period * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Piece surface: fine carved-stone grain used as bump + roughness     */
/* ------------------------------------------------------------------ */

export function grainTexture(): THREE.Texture {
  return cached("grain", () => {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 16, y / 16, 4, 16, 7) * 0.7 + hash(x, y, 3) * 0.3;
        const v = Math.floor(n * 255);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  });
}

/** Brick/stone-block pattern for the rook tower. */
export function brickTexture(): THREE.Texture {
  return cached("brick", () => {
    const size = 512;
    const c = canvas(size);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    const rows = 12, cols = 8;
    const bh = size / rows, bw = size / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw * 0.5;
      for (let col = -1; col < cols + 1; col++) {
        const x = col * bw + off;
        const shade = 150 + Math.floor(hash(col, r, 11) * 70);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
      }
    }
    // grain over the top
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const p = i / 4;
      const n = (hash(p % size, Math.floor(p / size), 5) - 0.5) * 30;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1);
    return t;
  });
}

/* ------------------------------------------------------------------ */
/* Board marble                                                        */
/* ------------------------------------------------------------------ */

type RGB = [number, number, number];

function marblePixel(x: number, y: number, base: RGB, vein: RGB, seed: number, scale: number) {
  const n = fbm(x * scale, y * scale, 5, 64, seed);
  const n2 = fbm(x * scale * 2.3 + 40, y * scale * 2.3, 4, 128, seed + 3);
  const v = Math.abs(Math.sin((x * 0.6 + y * 1.1) * scale * 6 + n * 9 + n2 * 3));
  const veinAmt = Math.pow(1 - v, 9) * 0.9 + Math.pow(1 - Math.abs(Math.sin(n2 * 14 + y * scale * 3)), 24) * 0.5;
  const cloud = (n - 0.5) * 0.18;
  const t = Math.min(1, veinAmt);
  return [
    (base[0] * (1 + cloud)) * (1 - t) + vein[0] * t,
    (base[1] * (1 + cloud)) * (1 - t) + vein[1] * t,
    (base[2] * (1 + cloud)) * (1 - t) + vein[2] * t,
  ] as RGB;
}

/** Full 8x8 playing surface painted into one texture (one draw call). */
export function boardTexture(): THREE.Texture {
  return cached("board", () => {
    const size = 1024;
    const sq = size / 8;
    const c = canvas(size);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    const light: RGB = [232, 228, 218];
    const lightVein: RGB = [150, 146, 140];
    const dark: RGB = [38, 44, 48];
    const darkVein: RGB = [140, 150, 150];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = Math.floor(x / sq), fy = Math.floor(y / sq);
        const isLight = (fx + fy) % 2 === 0;
        const seed = fx * 8 + fy;
        // per-square offset so every tile looks like a different slab
        const ox = x + hash(fx, fy, 1) * 3000, oy = y + hash(fx, fy, 2) * 3000;
        const col = isLight
          ? marblePixel(ox, oy, light, lightVein, (seed % 5) + 1, 0.012)
          : marblePixel(ox, oy, dark, darkVein, (seed % 5) + 9, 0.012);
        // grout lines
        const gx = x % sq, gy = y % sq;
        const edge = Math.min(gx, gy, sq - 1 - gx, sq - 1 - gy);
        const g = edge < 1.5 ? 0.55 : edge < 3 ? 0.85 : 1;
        const i = (y * size + x) * 4;
        img.data[i] = col[0] * g;
        img.data[i + 1] = col[1] * g;
        img.data[i + 2] = col[2] * g;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

/** Board frame with engraved coordinates and a gilded inlay. */
export function frameTexture(): THREE.Texture {
  return cached("frame", () => {
    const size = 1024;
    const c = canvas(size);
    const ctx = c.getContext("2d")!;
    // dark stone
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 40, y / 40, 4, 64, 21);
        const v = 22 + n * 26;
        const i = (y * size + x) * 4;
        img.data[i] = v * 1.05;
        img.data[i + 1] = v;
        img.data[i + 2] = v * 0.95;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // geometry: frame plane spans 10 units -> board 8 units centered
    const u = size / 10;
    const inner = u; // 1 unit border
    // gold inlay lines
    ctx.strokeStyle = "#c9a24a";
    ctx.lineWidth = 6;
    ctx.strokeRect(inner - 14, inner - 14, size - 2 * inner + 28, size - 2 * inner + 28);
    ctx.lineWidth = 2;
    ctx.strokeRect(inner - 30, inner - 30, size - 2 * inner + 60, size - 2 * inner + 60);
    ctx.strokeRect(14, 14, size - 28, size - 28);
    // corner sigils
    const sigil = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "#c9a24a";
      ctx.lineWidth = 3;
      ctx.strokeRect(-16, -16, 32, 32);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = "#c9a24a";
      ctx.font = "bold 26px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("V", 0, 2);
      ctx.restore();
    };
    sigil(inner / 2, inner / 2);
    sigil(size - inner / 2, inner / 2);
    sigil(inner / 2, size - inner / 2);
    sigil(size - inner / 2, size - inner / 2);
    // coordinates
    ctx.fillStyle = "#d8c08a";
    ctx.font = "bold 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const files = "abcdefgh";
    for (let i = 0; i < 8; i++) {
      const x = inner + u * (i + 0.5);
      ctx.fillText(files[i].toUpperCase(), x, size - inner / 2 + 4); // white side (bottom = +z)
      ctx.save();
      ctx.translate(x, inner / 2);
      ctx.rotate(Math.PI);
      ctx.fillText(files[i].toUpperCase(), 0, -4);
      ctx.restore();
      const y = inner + u * (7 - i + 0.5);
      ctx.fillText(String(i + 1), inner / 2, y + 2);
      ctx.save();
      ctx.translate(size - inner / 2, y);
      ctx.rotate(Math.PI);
      ctx.fillText(String(i + 1), 0, -2);
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

/** Soft round sprite used by particles, flashes, glows. */
export function glowTexture(): THREE.Texture {
  return cached("glow", () => {
    const size = 128;
    const c = canvas(size);
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.6)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  });
}

/** Soft smoke puff. */
export function smokeTexture(): THREE.Texture {
  return cached("smoke", () => {
    const size = 128;
    const c = canvas(size);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x / size - 0.5, dy = y / size - 0.5;
        const d = Math.sqrt(dx * dx + dy * dy) * 2;
        const n = fbm(x / 20, y / 20, 3, 8, 33);
        const a = Math.max(0, 1 - d) * (0.4 + n * 0.8);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  });
}
