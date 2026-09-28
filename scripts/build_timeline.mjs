// Narration-first timeline.
//   node build_timeline.mjs <project> [--no-tts]
//
// 1. Voice every line locally (tts.ps1: Windows OneCore voice with word cues). Lines whose text,
//    voice and rate are unchanged since the last run are reused.
// 2. Map each word cue to a display word by its character position in the spoken text.
// 3. Lay the lines end to end (a chapter opener with a card gets a title-card gap) and derive
//    every visual event from the spoken word it is anchored to.
// 4. Write cues.json, vo/narration.wav, out/<output>.srt and out/<output>_transcript.txt.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ROOT = path.resolve(argv.find(a => !a.startsWith('--')) || '.');
const skipTTS = argv.includes('--no-tts');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const V = {
  title: 'Untitled video', output: 'video', voice: 'Mark', rate: 1.0, fps: 30,
  lead: 4.0, chapter_gap: 1.15, line_gap: 0.35, end_hold: 3.0,
  assets: {}, constants: {}, music: {}, sfx: [], anchors: {},
  ...readJson(path.join(ROOT, 'video.json')),
};
const VO = path.join(ROOT, 'vo'), OUT = path.join(ROOT, 'out');
const SR = 48000, FPS = V.fps;
const round = x => Math.round(x * 1000) / 1000;

/* ---- checks ---- */
if (!Array.isArray(V.lines) || !V.lines.length) throw new Error('video.json: "lines" is empty');
if (!V.lines[0].chapter) throw new Error('video.json: the first line must open chapter 1 ("chapter": {"n": 1, "title": "..."})');
const seenIds = new Set(), seenChapters = new Set();
for (const l of V.lines) {
  if (!l.id || seenIds.has(l.id)) throw new Error(`video.json: line id missing or repeated: ${l.id}`);
  seenIds.add(l.id);
  if (l.chapter) {
    if (seenChapters.has(l.chapter.n)) throw new Error(`video.json: chapter ${l.chapter.n} opened twice`);
    seenChapters.add(l.chapter.n);
  }
}
if (V.lead - V.chapter_gap < 2) console.warn(`note: lead ${V.lead}s leaves the title only ${(V.lead - V.chapter_gap).toFixed(1)}s on screen`);

/* ---- text: display vs speech tokens ---- */
// "{display|speech}" = pronunciation override, " / " = caption break, "*x*" = italic on screen
function tokenize(text) {
  const out = [], re = /\{([^|}]+)\|([^}]+)\}(\S*)|(\S+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[4] === '/') out.push({ brk: true });
    else if (m[4] !== undefined) out.push({ display: m[4], speech: m[4].replace(/\*/g, '') });
    else out.push({ display: m[1] + m[3], speech: m[2] + m[3].replace(/\*/g, '') });
  }
  return out;
}
const bare = d => d.replace(/\*/g, '').replace(/[^\w'-]/g, '');
const plain = text => tokenize(text).filter(t => !t.brk).map(t => t.display.replace(/\*/g, '')).join(' ');

/* ---- WAV helpers (16-bit PCM) ---- */
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) };
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + size); break; }
    p += 8 + size + (size % 2);
  }
  const n = Math.floor(data.length / 2 / fmt.ch), s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
  return { sr: fmt.sr, s };
}
function writeWav(file, s, sr) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}
function speechBounds({ sr, s }) { // first/last 10 ms window above -40 dBFS
  const win = Math.round(sr * 0.01);
  let first = -1, last = -1;
  for (let w = 0; w * win < s.length; w++) {
    let acc = 0;
    const a = w * win, z = Math.min(s.length, a + win);
    for (let i = a; i < z; i++) acc += s[i] * s[i];
    if (Math.sqrt(acc / (z - a)) > 0.01) { if (first < 0) first = w; last = w; }
  }
  return [first * 0.01, (last + 1) * 0.01];
}

/* ---- 1. TTS (only for new or changed lines) ---- */
const lines = V.lines.map(l => {
  const tokens = tokenize(l.text);
  let speech = '';
  for (const tk of tokens) {
    if (tk.brk) continue;
    if (speech) speech += ' ';
    tk.from = speech.length;
    speech += tk.speech;
    tk.to = speech.length;
  }
  return { ...l, tokens, speech };
});
fs.mkdirSync(VO, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const upToDate = l => {
  try {
    const j = readJson(path.join(VO, `${l.id}.json`));
    return j.text === l.speech && String(j.voice).includes(V.voice) && Math.abs(j.rate - V.rate) < 1e-9
      && fs.existsSync(path.join(VO, `${l.id}.wav`));
  } catch { return false; }
};
if (!skipTTS) {
  const todo = lines.filter(l => !upToDate(l));
  if (todo.length) {
    fs.writeFileSync(path.join(VO, 'lines.json'), JSON.stringify(todo.map(l => ({ id: l.id, text: l.speech })), null, 1));
    const tts = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'tts.ps1'),
      '-InFile', path.join(VO, 'lines.json'), '-OutDir', VO, '-Voice', V.voice, '-Rate', String(V.rate)], { stdio: 'inherit' });
    if (tts.status !== 0) throw new Error('tts.ps1 failed');
  }
  console.log(`tts: ${todo.length} line(s) synthesized, ${lines.length - todo.length} reused`);
}

/* ---- 2 + 3. word timing and layout ---- */
let cursor = 0;
const placed = [], chapters = [];
lines.forEach((l, k) => {
  const cue = readJson(path.join(VO, `${l.id}.json`));
  const words = [].concat(cue.words || []);
  const [on, off] = speechBounds(readWav(path.join(VO, `${l.id}.wav`)));
  const card = Boolean(l.chapter) && l.chapter.card !== false;
  // gap = pause before this line. A chapter card needs chapter_gap; a longer gap on a chapter
  // opener keeps the previous scene on screen for the difference before the card comes in.
  let gap = k === 0 ? 0 : (l.gap ?? (card ? V.chapter_gap : V.line_gap));
  if (k > 0 && card && gap < V.chapter_gap) {
    console.warn(`note: ${l.id} opens chapter ${l.chapter.n}: gap raised from ${gap} to chapter_gap ${V.chapter_gap}`);
    gap = V.chapter_gap;
  }
  const start = k === 0 ? V.lead : cursor + gap;
  const offset = start - on, end = offset + off;
  if (l.chapter) {
    chapters.push({ n: l.chapter.n, title: l.chapter.title || '', show: card,
      card: round(card ? start - V.chapter_gap + 0.05 : start - Math.min(0.4, gap || 0.4)), first: round(start) });
  }
  const toks = l.tokens.filter(t => !t.brk);
  toks.forEach((tk, i) => {
    const hits = words.filter(w => w.pos >= tk.from && w.pos < tk.to);
    tk.s = hits.length ? offset + Math.min(...hits.map(w => w.start)) : (i ? toks[i - 1].s + 0.08 : start);
  });
  toks.forEach((tk, i) => { tk.e = i + 1 < toks.length ? toks[i + 1].s : end; });
  placed.push({ id: l.id, text: l.text, offset, start, end, tokens: l.tokens });
  cursor = end;
});
const duration = Math.ceil((cursor + V.end_hold) * FPS) / FPS;
const byId = id => placed.find(p => p.id === id);

const events = {};
for (const [name, [lid, word, nth = 0]] of Object.entries(V.anchors)) {
  const line = byId(lid);
  if (!line) throw new Error(`anchor ${name}: no line "${lid}"`);
  const cands = line.tokens.filter(tk => !tk.brk);
  const hit = cands.filter(tk => bare(tk.display) === word)[nth];
  if (!hit) throw new Error(`anchor ${name}: "${word}" (#${nth}) not in ${lid}. Words: ${cands.map(tk => bare(tk.display)).join(' ')}`);
  events[name] = round(hit.s);
}
for (const p of placed) { events[`${p.id}_start`] = round(p.start); events[`${p.id}_end`] = round(p.end); }
for (const c of chapters) events[`ch${c.n}`] = c.card;
Object.assign(events, {
  title_in: 0.15,
  subtitle_in: 0.45,
  end_title: round(cursor + 0.45),
  fade_out: round(duration - 0.8),
});

/* captions: one chunk per ' / ' segment, held until the next chunk starts */
const captions = [];
for (const p of placed) {
  let chunk = [];
  const flush = () => {
    if (!chunk.length) return;
    captions.push({ start: round(chunk[0].s), end: round(chunk[chunk.length - 1].e),
      words: chunk.map(tk => ({ d: tk.display, s: round(tk.s), e: round(tk.e) })) });
    chunk = [];
  };
  for (const tk of p.tokens) { if (tk.brk) flush(); else chunk.push(tk); }
  flush();
}
captions.forEach((c, i) => {
  const next = captions[i + 1];
  c.end = round(Math.min(next ? next.start - 0.02 : duration, c.end + 0.6));
});

/* ---- 4. outputs ---- */
const cues = {
  title: V.title, output: V.output, fps: FPS, width: 1920, height: 1080, duration,
  voice: `${V.voice} (Windows OneCore, local)`, rate: V.rate,
  assets: V.assets, constants: V.constants, music: V.music, sfx: V.sfx,
  chapters, events, captions,
  narration: placed.map(p => ({ id: p.id, offset: round(p.offset), start: round(p.start), end: round(p.end) })),
};
fs.writeFileSync(path.join(ROOT, 'cues.json'), JSON.stringify(cues, null, 1));

const total = Math.round(duration * SR), mix = new Float32Array(total);
for (const p of placed) {
  const src = path.join(VO, `${p.id}.wav`), dst = path.join(VO, `${p.id}_48k.wav`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', dst]);
  if (r.status !== 0) throw new Error(`resample ${p.id} failed`);
  const w = readWav(dst), o = Math.round(p.offset * SR);
  for (let i = 0; i < w.s.length; i++) if (o + i >= 0 && o + i < total) mix[o + i] += w.s[i];
}
writeWav(path.join(VO, 'narration.wav'), mix, SR);

const ts = (t, sep) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
fs.writeFileSync(path.join(OUT, `${V.output}.srt`), captions.map((c, i) =>
  `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.words.map(w => w.d.replace(/\*/g, '')).join(' ')}\n`).join('\n'));
const lineOut = [];
for (const p of placed) {
  const ch = chapters.find(c => c.first === round(p.start));
  if (ch) lineOut.push('', `Chapter ${ch.n}: ${ch.title}`);
  lineOut.push(`[${ts(p.start, '.').slice(3, 11)}] ${plain(p.text)}`);
}
fs.writeFileSync(path.join(OUT, `${V.output}_transcript.txt`), [
  V.title,
  `Narration: ${V.voice} (Windows OneCore voice, synthesized locally), rate ${V.rate}. Duration ${duration.toFixed(1)} s.`,
  ...lineOut, '',
].join('\n'));

for (const p of placed) console.log(`${p.id} ${p.start.toFixed(2)}-${p.end.toFixed(2)}s`);
console.log(`duration ${duration.toFixed(2)} s (${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, '0')}), `
  + `${captions.length} caption chunks, ${chapters.length} chapters, ${Object.keys(V.anchors).length} anchors`);
