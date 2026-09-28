// Soundtrack: a pad chord per chapter plus event sounds on the picture's clock (cues.json), ducked
// under the narration and mixed with vo/narration.wav into score.wav. Everything is synthesized here.
//   node score.mjs <project>
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || '.');
const cues = JSON.parse(fs.readFileSync(path.join(ROOT, 'cues.json'), 'utf8'));
const E = cues.events, SR = 48000, DUR = cues.duration, N = Math.round(SR * DUR);
const TAU = 2 * Math.PI;
const M = { pad: true, sfx: true, level: 1, duck: 0.32, title_chord: 'Am(add9)', end_chord: 'Asus2', ...(cues.music || {}) };
const pad = new Float32Array(N), sfx = new Float32Array(N);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const span = (t0, dur) => [Math.max(0, Math.floor(t0 * SR)), Math.min(N, Math.floor((t0 + dur) * SR))];
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let seedN = 100;
const seed = () => ++seedN; // deterministic: same cues, same sound

/* ---- pad: one chord per chapter, 1.0 s crossfades ---- */
const CHORDS = {
  'Am(add9)': [110.0, 164.81, 246.94, 261.63],
  Asus2: [110.0, 164.81, 246.94, 329.63],
  Am7: [110.0, 164.81, 261.63, 392.0],
  Fmaj7: [87.31, 130.81, 220.0, 329.63],
  Fsus2: [87.31, 130.81, 196.0, 261.63],
  'Dm(add9)': [146.83, 174.61, 220.0, 329.63],
  Cadd9: [130.81, 196.0, 293.66, 329.63],
  Gadd9: [98.0, 146.83, 246.94, 440.0],
};
const CYCLE = ['Fmaj7', 'Dm(add9)', 'Cadd9', 'Gadd9', 'Fsus2', 'Am7'];
const chord = name => {
  if (!CHORDS[name]) throw new Error(`music: unknown chord "${name}" (choose: ${Object.keys(CHORDS).join(', ')})`);
  return CHORDS[name];
};
if (M.pad) {
  const plan = [[0, chord(M.title_chord)]];
  cues.chapters.forEach((c, k) => plan.push([c.card, chord((M.chords && M.chords[k]) || CYCLE[k % CYCLE.length])]));
  plan.push([E.end_title, chord(M.end_chord)]);
  plan.forEach(([a, freqs], c) => {
    const b = c + 1 < plan.length ? plan[c + 1][0] : DUR + 5;
    const [i0, i1] = span(a, b + 1.0 - a);
    for (let i = i0; i < i1; i++) {
      const t = i / SR, env = Math.min(clamp((t - a) / 1.0), 1 - clamp((t - b) / 1.0));
      let v = 0;
      freqs.forEach((f, k) => {
        const trem = 1 + 0.18 * Math.sin(TAU * (0.11 + 0.04 * k) * t + k);
        v += trem * (Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * 2 * f * t + 0.3) + 0.08 * Math.sin(TAU * 3 * f * t + 1.1));
      });
      pad[i] += 0.035 * env * v;
    }
  });
}

/* ---- event sounds ---- */
function tone(t0, f, { amp = 0.1, decay = 0.4, attack = 0.005, dur = 2.0, harm = 0.3 } = {}) {
  const [i0, i1] = span(t0, dur);
  for (let i = i0; i < i1; i++) {
    const tt = i / SR - t0, env = Math.min(1, tt / attack) * Math.exp(-tt / decay);
    sfx[i] += amp * env * (Math.sin(TAU * f * tt) + harm * Math.sin(TAU * 2 * f * tt));
  }
}
function sweep(t0, dur, f0, f1, amp) {
  const [i0, i1] = span(t0, dur);
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const u = (i / SR - t0) / dur;
    ph += TAU * f0 * Math.pow(f1 / f0, u) / SR;
    sfx[i] += amp * Math.sin(Math.PI * u) * Math.sin(ph);
  }
}
function noise(t0, dur, amp, cutoff, sd, swell = false) {
  const [i0, i1] = span(t0, dur), rnd = mulberry32(sd), a = Math.exp(-TAU * cutoff / SR);
  let y = 0;
  for (let i = i0; i < i1; i++) {
    const u = (i / SR - t0) / dur;
    y = (1 - a) * (rnd() * 2 - 1) + a * y;
    sfx[i] += amp * 3 * y * (swell ? Math.sin(Math.PI * u) : Math.exp(-u * 6));
  }
}
function thump(t0, amp = 0.25) {
  const [i0, i1] = span(t0, 0.6);
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const tt = i / SR - t0;
    ph += TAU * (45 + 30 * Math.exp(-tt * 18)) / SR;
    sfx[i] += amp * Math.exp(-tt / 0.18) * Math.sin(ph);
  }
}
const arp = (t0, freqs, step, opts) => freqs.forEach((f, i) => tone(t0 + i * step, f, opts));

// presets for video.json "sfx": [{ "at": "<event>" | seconds, "type": "<preset>", "offset": 0, "gain": 1 }]
const PRESETS = {
  tick: (t, g) => tone(t, 1046.5, { amp: 0.035 * g, decay: 0.2 }),
  pop: (t, g) => tone(t, 783.99, { amp: 0.035 * g, decay: 0.35 }),
  low: (t, g) => tone(t, 392.0, { amp: 0.045 * g, decay: 0.35 }),
  chime: (t, g) => { tone(t, 1318.51, { amp: 0.035 * g, decay: 0.9, harm: 0.05 }); tone(t + 0.06, 1760, { amp: 0.025 * g, decay: 0.8, harm: 0.05 }); },
  steps: (t, g) => arp(t, [523.25, 587.33, 659.25], 0.12, { amp: 0.045 * g, decay: 0.35 }),
  sparkle: (t, g) => arp(t, [1318.51, 1567.98, 1760], 0.05, { amp: 0.03 * g, decay: 0.7, harm: 0.05 }),
  confirm: (t, g) => arp(t, [659.25, 739.99, 830.61, 880, 987.77], 0.15, { amp: 0.035 * g, decay: 0.25 }),
  rise: (t, g) => sweep(t, 0.7, 330, 660, 0.04 * g),
  fall: (t, g) => sweep(t, 0.6, 880, 440, 0.035 * g),
  swell: (t, g) => noise(t - 0.2, 1.0, 0.02 * g, 1200, seed(), true),
  whoosh: (t, g) => { sweep(t, 0.8, 660, 165, 0.05 * g); noise(t, 0.8, 0.025 * g, 1500, seed(), true); },
  thump: (t, g) => { thump(t, 0.13 * g); tone(t, 220, { amp: 0.035 * g, decay: 0.4 }); },
  snap: (t, g) => { noise(t, 0.08, 0.1 * g, 2500, seed()); noise(t + 0.08, 0.08, 0.08 * g, 2500, seed()); },
  alert: (t, g) => {
    noise(t, 0.3, 0.09 * g, 4000, seed());
    tone(t, 1760, { amp: 0.06 * g, decay: 0.45, harm: 0.05 }); tone(t + 0.03, 2349.32, { amp: 0.045 * g, decay: 0.35, harm: 0.05 });
    thump(t, 0.2 * g);
  },
};

if (M.sfx) {
  arp(E.title_in, [880, 1318.51, 1760], 0.07, { amp: 0.045, decay: 0.6, harm: 0.1 });   // title
  for (const c of cues.chapters) if (c.show !== false) PRESETS.chime(c.card, 1);         // chapter cards
  arp(E.end_title, [440, 659.25, 880], 0.08, { amp: 0.04, decay: 1.2, harm: 0.1 });     // end card
  for (const s of cues.sfx || []) {
    const base = typeof s.at === 'number' ? s.at : E[s.at];
    if (base === undefined) throw new Error(`sfx: unknown event "${s.at}"`);
    const fn = PRESETS[s.type];
    if (!fn) throw new Error(`sfx: unknown type "${s.type}" (choose: ${Object.keys(PRESETS).join(', ')})`);
    fn(base + (s.offset || 0), s.gain ?? 1);
  }
}

/* ---- duck music under speech (attack 80 ms, release 400 ms) ---- */
const duck = new Float32Array(N);
const aAtk = Math.exp(-1 / (0.08 * SR)), aRel = Math.exp(-1 / (0.4 * SR));
let g = 1, seg = 0;
const segs = cues.narration;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  while (seg < segs.length && t > segs[seg].end + 0.25) seg++;
  const speaking = seg < segs.length && t >= segs[seg].start - 0.15;
  const target = speaking ? M.duck : 1;
  g = target < g ? aAtk * g + (1 - aAtk) * target : aRel * g + (1 - aRel) * target;
  duck[i] = g;
}

/* ---- narration ---- */
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + size); break; }
    p += 8 + size + (size % 2);
  }
  const s = new Float32Array(data.length / 2);
  for (let i = 0; i < s.length; i++) s[i] = data.readInt16LE(i * 2) / 32768;
  return s;
}
const vo = readWav(path.join(ROOT, 'vo', 'narration.wav'));

/* ---- mix: music bus to peak 0.3 x level, voice to peak 0.9, soft-limit, fades ---- */
const music = new Float32Array(N);
let mPeak = 0, vPeak = 0;
for (let i = 0; i < N; i++) {
  music[i] = pad[i] * duck[i] + sfx[i] * (0.55 + 0.45 * duck[i]);
  mPeak = Math.max(mPeak, Math.abs(music[i]));
  if (i < vo.length) vPeak = Math.max(vPeak, Math.abs(vo[i]));
}
const mg = mPeak ? 0.3 * M.level / mPeak : 1, vg = vPeak ? 0.9 / vPeak : 1;
const wav = Buffer.alloc(44 + N * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(clamp(t / 0.35), 1 - clamp((t - E.fade_out) / (DUR - E.fade_out)));
  const v = Math.tanh(music[i] * mg * fade + (i < vo.length ? vo[i] * vg : 0));
  wav.writeInt16LE(Math.round(clamp(v, -1, 1) * 32767), 44 + i * 2);
}
fs.writeFileSync(path.join(ROOT, 'score.wav'), wav);
console.log(`wrote score.wav: ${DUR.toFixed(1)}s, ${(cues.sfx || []).length} sfx cues `
  + `(music peak ${mPeak.toFixed(3)} -> ${(0.3 * M.level).toFixed(2)}, voice peak ${vPeak.toFixed(3)} -> 0.90)`);
