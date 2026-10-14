/**
 * Tiny Web Audio cues: a bright chime per hit that climbs a pentatonic
 * scale as hits accumulate, and a warm chord when the case closes.
 */
let ctx: AudioContext | null = null;
const PENTA = [0, 2, 4, 7, 9];

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at);
  o.stop(a.currentTime + at + dur + 0.05);
}

export const sound = {
  unlock: () => void audio(),
  hit(index: number) {
    const step = PENTA[index % 5] + 12 * Math.min(2, Math.floor(index / 5));
    const f = 523.25 * Math.pow(2, step / 12);
    tone(f, 0, 0.5, 0.05);
    tone(f * 2, 0.02, 0.3, 0.015, "triangle");
  },
  start() {
    tone(220, 0, 0.6, 0.04, "triangle");
    tone(330, 0.08, 0.6, 0.03, "triangle");
  },
  solved() {
    [392, 493.88, 587.33, 783.99].forEach((f, i) => tone(f, i * 0.09, 1.6, 0.045));
  },
  click() {
    tone(1200, 0, 0.05, 0.02, "square");
  },
};
