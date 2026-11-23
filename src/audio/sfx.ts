/**
 * Fully synthesised sound effects (no audio files). Everything is built
 * from oscillators + filtered noise via WebAudio.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (master) master.gain.value = v ? 0.55 : 0;
}

/** Must be called from a user gesture at least once. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.55 : 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
}

function ready() {
  return enabled && ctx && master && ctx.state === "running";
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noise(dur: number, filter: BiquadFilterType, freq: number, q = 1, peak = 0.5, attack = 0.005, freqEnd?: number, delay = 0) {
  if (!ready()) return;
  const c = ctx!;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + attack + dur + 0.05);
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", peak = 0.3, attack = 0.005, freqEnd?: number, delay = 0) {
  if (!ready()) return;
  const c = ctx!;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

export const sfx = {
  select() {
    tone(880, 0.08, "triangle", 0.08);
    tone(1320, 0.12, "sine", 0.05, 0.005, undefined, 0.03);
  },
  step() {
    noise(0.06, "lowpass", 500, 1, 0.25);
  },
  thud(power = 1) {
    tone(90 * power, 0.25, "sine", 0.5, 0.003, 40);
    noise(0.18, "lowpass", 300, 1, 0.35 * power);
  },
  clop() {
    tone(420 + Math.random() * 80, 0.05, "square", 0.04, 0.002, 220);
    noise(0.05, "bandpass", 1600, 3, 0.25);
  },
  whoosh(delay = 0) {
    noise(0.28, "bandpass", 400, 2, 0.35, 0.05, 2400, delay);
  },
  clang() {
    for (const [f, p] of [
      [523, 0.2],
      [1187, 0.12],
      [2021, 0.08],
      [3150, 0.05],
    ])
      tone(f * (0.98 + Math.random() * 0.04), 0.7, "sine", p, 0.002);
    noise(0.12, "highpass", 3000, 1, 0.4);
  },
  crumble() {
    for (let i = 0; i < 8; i++) noise(0.08 + Math.random() * 0.1, "bandpass", 600 + Math.random() * 2400, 2, 0.25, 0.003, undefined, i * 0.04 + Math.random() * 0.05);
    noise(0.6, "lowpass", 800, 1, 0.3, 0.01, 200);
  },
  boom() {
    tone(70, 0.9, "sine", 0.9, 0.005, 28);
    noise(0.9, "lowpass", 1400, 1, 0.8, 0.003, 120);
    noise(0.15, "highpass", 2000, 1, 0.4);
  },
  chime() {
    const base = 523.25;
    [1, 1.25, 1.5, 2].forEach((m, i) => {
      tone(base * m, 1.6, "sine", 0.12, 0.01, undefined, i * 0.07);
      tone(base * m * 2.01, 1.0, "sine", 0.03, 0.01, undefined, i * 0.07);
    });
    noise(1.2, "bandpass", 5000, 8, 0.06, 0.3);
  },
  choir() {
    [261.6, 329.6, 392, 523.3].forEach((f) => {
      tone(f, 1.4, "sawtooth", 0.025, 0.4);
      tone(f * 1.005, 1.4, "sine", 0.06, 0.4);
    });
  },
  arcane() {
    tone(220, 0.9, "sawtooth", 0.06, 0.2, 880);
    tone(330, 0.9, "sine", 0.1, 0.2, 1320);
    noise(0.9, "bandpass", 300, 6, 0.15, 0.2, 4000);
  },
  zap() {
    tone(1600, 0.25, "sawtooth", 0.08, 0.002, 200);
    noise(0.2, "highpass", 2500, 1, 0.3);
  },
  check() {
    tone(196, 1.4, "triangle", 0.25, 0.005, 190);
    tone(392, 1.0, "sine", 0.12, 0.005);
    tone(294, 1.2, "sine", 0.1, 0.005);
  },
  victory() {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6 + i * 0.1, "triangle", 0.12, 0.01, undefined, i * 0.12));
  },
  promote() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.8, "sine", 0.1, 0.01, undefined, i * 0.06));
    noise(1.0, "bandpass", 3000, 4, 0.08, 0.2, 9000);
  },
};
