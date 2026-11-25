// Tiny chiptune sound effects, synthesized with Web Audio (no audio files).
import type { TierId } from "./game";

let ctx: AudioContext | null = null;
let muted = typeof window !== "undefined" && localStorage.getItem("tg-muted") === "1";

const listeners = new Set<() => void>();
export const isMuted = () => muted;
export function setMuted(value: boolean) {
  muted = value;
  try { localStorage.setItem("tg-muted", value ? "1" : "0"); } catch {}
  listeners.forEach((l) => l());
}
// For useSyncExternalStore.
export function subscribeMuted(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function audio() {
  if (muted || typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  gain.gain.setValueAtTime(opts.vol ?? 0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Filtered white noise, for whooshes.
function noise(dur: number, opts: { from?: number; to?: number; vol?: number; at?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + (opts.at ?? 0);
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(opts.from ?? 500, t);
  filter.frequency.exponentialRampToValueAtTime(opts.to ?? 2500, t + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.08, t + dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const notes = (seq: number[], step = 0.08, opts: { type?: OscillatorType; vol?: number } = {}) =>
  seq.forEach((f, i) => tone(f, step * 1.4, { ...opts, at: i * step }));

export const sfx = {
  blip: () => tone(1240, 0.025, { vol: 0.018 }),
  select: () => notes([880, 1320], 0.05, { vol: 0.04 }),
  start: () => notes([523, 659, 784, 1047], 0.07, { vol: 0.045 }),
  rustle: () => tone(180, 0.18, { type: "triangle", vol: 0.04, slide: 90 }),
  wrong: () => { tone(220, 0.12, { type: "sawtooth", vol: 0.035 }); tone(165, 0.2, { type: "sawtooth", vol: 0.035, at: 0.1 }); },
  tick: () => tone(1760, 0.04, { vol: 0.025 }),
  miss: () => notes([523, 440, 349, 262], 0.09, { type: "triangle", vol: 0.05 }),
  catch: (tier: TierId) => {
    const runs: Record<string, number[]> = {
      common: [659, 784], meme: [659, 523, 659], uncommon: [659, 784, 988],
      rare: [659, 784, 988, 1319], ultra: [523, 659, 784, 1047, 1319],
      shiny: [784, 988, 1175, 1568, 1976, 2349],
    };
    notes(runs[tier] ?? runs.common, tier === "shiny" ? 0.065 : 0.08, { vol: 0.045 });
    if (tier === "shiny") notes([2637, 3136, 2637, 3136], 0.05, { type: "triangle", vol: 0.03 });
  },
  step: () => tone(150 + Math.random() * 40, 0.045, { type: "triangle", vol: 0.035 }),
  biome: () => { notes([784, 988, 1175, 1568], 0.09, { vol: 0.045 }); notes([392, 494, 587, 784], 0.09, { type: "triangle", vol: 0.03 }); },
  throw: () => noise(0.55, { from: 400, to: 2600, vol: 0.09 }),
  pop: () => { tone(420, 0.09, { slide: 1500, vol: 0.05 }); noise(0.18, { from: 3000, to: 6000, vol: 0.05, at: 0.02 }); },
  wiggle: () => { tone(260, 0.05, { vol: 0.045 }); tone(200, 0.06, { vol: 0.04, at: 0.07 }); },
  click: () => { tone(1500, 0.035, { vol: 0.05 }); tone(900, 0.05, { vol: 0.04, at: 0.04 }); },
  sendout: () => { tone(380, 0.08, { slide: 1200, vol: 0.04 }); notes([660, 990], 0.06, { vol: 0.035 }); },
  reveal: () => { noise(0.25, { from: 1200, to: 300, vol: 0.06 }); notes([523, 784], 0.07, { vol: 0.04 }); },
  fanfare: () => notes([523, 523, 523, 659, 784, 659, 784, 1047], 0.1, { vol: 0.045 }),
  // You hit Enter: the grass bursts before the server has even answered.
  burst: () => { noise(0.16, { from: 700, to: 2600, vol: 0.06 }); tone(170, 0.12, { type: "triangle", vol: 0.05, slide: 95 }); },
  // The ball drops through the floor.
  hole: () => { noise(0.3, { from: 900, to: 160, vol: 0.07 }); tone(240, 0.22, { type: "triangle", vol: 0.05, slide: 70 }); },
  // "Hm?" for a "Did you mean…?" suggestion.
  hmm: () => { tone(587, 0.07, { type: "triangle", vol: 0.045 }); tone(880, 0.12, { type: "triangle", vol: 0.045, at: 0.08 }); },
  recall: () => tone(980, 0.26, { type: "triangle", vol: 0.03, slide: 300 }),
  // Smashing through a ledge: each one rings a step higher.
  crack: (i: number) => {
    const f = [523, 659, 784, 988, 1175, 1397][Math.min(i, 5)];
    noise(0.14, { from: 2600, to: 500, vol: 0.09 });
    tone(f, 0.13, { vol: 0.05 });
    tone(f * 2, 0.09, { type: "triangle", vol: 0.03, at: 0.03 });
  },
  // Landing: a thud, then a jingle that grows with the tier.
  land: (tier: TierId) => {
    const big = tier === "rare" || tier === "ultra" || tier === "shiny";
    tone(big ? 90 : 120, big ? 0.32 : 0.18, { type: "triangle", vol: big ? 0.11 : 0.07, slide: big ? 40 : 60 });
    noise(big ? 0.35 : 0.18, { from: 500, to: 90, vol: big ? 0.1 : 0.06 });
    if (tier === "common") { tone(330, 0.14, { type: "triangle", vol: 0.035, at: 0.1 }); return; }
    if (tier === "meme") { tone(260, 0.22, { slide: 620, vol: 0.04, at: 0.08 }); tone(620, 0.2, { slide: 300, vol: 0.035, at: 0.3 }); return; }
    setTimeout(() => sfx.catch(tier), 90);
  },
  sparkle: () => notes([2637, 3136, 3520, 4186, 3520, 4186], 0.055, { type: "triangle", vol: 0.03 }),
};
