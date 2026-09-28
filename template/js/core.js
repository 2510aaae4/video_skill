'use strict';
// Shared helpers. Every frame is a pure function of t (seconds): no state carried between frames
// and no unseeded randomness, so frames can be rendered in any order and re-rendered identically.
const W = 1920, H = 1080;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let CUES = null, E = null;   // cues.json and its events (anchor name -> seconds)
const IMG = {};              // images from video.json "assets", by name

/* ---------- math and timing ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const prog = (t, a, b) => clamp((t - a) / (b - a));                    // 0 -> 1 between a and b
const easeOut = u => 1 - Math.pow(1 - u, 3);
const easeInOut = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOutBack = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const pulse = (t, a, dur = 0.7) => Math.sin(Math.PI * prog(t, a, a + dur));           // 0 -> 1 -> 0
const win = (t, a, b, fi = 0.35, fo = 0.35) => Math.min(easeOut(prog(t, a, a + fi)), 1 - prog(t, b - fo, b)); // visible in [a, b]
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(c1, c2, u) { // '#rrggbb' colours
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], clamp(u)))).join(',')})`;
}
const qbez = (P, u) => [
  (1 - u) * (1 - u) * P[0][0] + 2 * (1 - u) * u * P[1][0] + u * u * P[2][0],
  (1 - u) * (1 - u) * P[0][1] + 2 * (1 - u) * u * P[1][1] + u * u * P[2][1],
];

/* ---------- palette: tuned for a dark background ---------- */
const C = {
  ink: '#eef4f8', muted: '#a9bfd0', dim: '#6f8799', amber: '#f2b56b', coral: '#ff7a59',
  teal: '#43b8c9', cyan: '#5fe3ee', edge: '#6fb9cf', green: '#7fd8a4', red: '#e8505b',
  series: ['#9fb6c8', '#f2a35e', '#5fe3ee', '#c7b8dd', '#7fd8a4'], // one colour per entity, the whole video
};

/* ---------- text: *italic* and **bold** inline ---------- */
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
function parseRich(s) {
  const out = [], re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    const tok = m[0];
    out.push(tok.startsWith('**') ? { t: tok.slice(2, -2), b: true } : { t: tok.slice(1, -1), i: true });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
}
const fontFor = (seg, size, weight) => `${seg.i ? 'italic ' : ''}${seg.b ? 700 : weight} ${size}px ${FONT}`;
function richWidth(str, size, weight = 400) {
  let w = 0;
  for (const s of parseRich(str)) { ctx.font = fontFor(s, size, weight); w += ctx.measureText(s.t).width; }
  return w;
}
function drawRich(str, x, y, { size = 28, weight = 400, color = C.ink, align = 'left', alpha = 1, spacing = 0 } = {}) {
  if (alpha <= 0) return 0;
  ctx.save();
  ctx.letterSpacing = `${spacing}px`;
  const w = richWidth(str, size, weight);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  for (const s of parseRich(str)) {
    ctx.font = fontFor(s, size, weight);
    ctx.fillText(s.t, cx, y);
    cx += ctx.measureText(s.t).width;
  }
  ctx.restore();
  return w;
}
function pill(text, x, y, { size = 20, bg = C.teal, fg = '#071320', alpha = 1, scale = 1, align = 'left' } = {}) {
  if (alpha <= 0 || scale <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const w = richWidth(text, size, 600) + size * 1.3, h = size * 1.6;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.translate(x0 + w / 2, y); ctx.scale(scale, scale); ctx.translate(-(x0 + w / 2), -y);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x0, y - h / 2, w, h, h / 2); ctx.fill();
  drawRich(text, x0 + size * 0.65, y + size * 0.36, { size, weight: 600, color: fg });
  ctx.restore();
}

/* ---------- shapes ---------- */
function panel(x, y, w, h, { fill = 'rgba(8,16,26,0.86)', stroke = 'rgba(169,191,208,0.35)', radius = 18, alpha = 1, lineWidth = 1.5 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  ctx.restore();
}
// straight arrow drawn from (x0, y0) towards (x1, y1); progress 0..1 grows it
function arrow(x0, y0, x1, y1, { color = C.amber, width = 4, head = 16, progress = 1, alpha = 1, dash = null } = {}) {
  if (progress <= 0 || alpha <= 0) return;
  const x = lerp(x0, x1, progress), y = lerp(y0, y1, progress), an = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x - Math.cos(an) * head * 0.6, y - Math.sin(an) * head * 0.6); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(an - 0.45) * head, y - Math.sin(an - 0.45) * head);
  ctx.lineTo(x - Math.cos(an + 0.45) * head, y - Math.sin(an + 0.45) * head);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
// pulsing ring (ellipse when rx is given) to point at something
function highlight(x, y, r, { color = '#ffd08a', alpha = 1, t = 0, width = 4, rx = null } = {}) {
  if (alpha <= 0) return;
  const p = 1 + 0.07 * Math.sin(t * 5);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.ellipse(x, y, (rx ?? r) * p, r * p, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/* ---------- backdrop ---------- */
function backdrop(t) {
  const g = ctx.createRadialGradient(W * 0.55, H * 0.45, 60, W * 0.5, H * 0.5, W * 0.78);
  g.addColorStop(0, '#10243a');
  g.addColorStop(1, '#050a12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(7);
  ctx.save();
  ctx.fillStyle = '#9fd3e6';
  for (let i = 0; i < 70; i++) {
    const x0 = rnd() * W, y0 = rnd() * H, sp = 8 + rnd() * 18, ph = rnd() * 6.283, r = 0.8 + rnd() * 1.8;
    const x = (x0 + t * sp) % W, y = y0 + Math.sin(t * 0.4 + ph) * 12;
    ctx.globalAlpha = 0.08 + 0.12 * Math.pow(Math.sin(t * 0.7 + ph), 2);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ---------- photos: a rounded card with a camera (image focus point + zoom) ---------- */
// card = {x, y, w, h}; cam = {fx, fy, z}: image pixel (fx, fy) sits at the card centre, z = zoom over "cover".
// Returns map(px, py) -> [x, y, scale] to place overlays in the image's own pixel coordinates.
function photoCard(img, card, cam, { alpha = 1, radius = 18, border = 'rgba(160,210,225,0.35)' } = {}) {
  if (alpha <= 0 || !img) return null;
  const cover = Math.max(card.w / img.width, card.h / img.height), s = cover * cam.z;
  const half = [card.w / 2 / s, card.h / 2 / s]; // keep the image covering the card whatever the focus point
  const fx = clamp(cam.fx, half[0], img.width - half[0]), fy = clamp(cam.fy, half[1], img.height - half[1]);
  const cx = card.x + card.w / 2, cy = card.y + card.h / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.roundRect(card.x, card.y, card.w, card.h, radius); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.beginPath(); ctx.roundRect(card.x, card.y, card.w, card.h, radius); ctx.clip();
  ctx.drawImage(img, cx - fx * s, cy - fy * s, img.width * s, img.height * s);
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = border;
  ctx.beginPath(); ctx.roundRect(card.x, card.y, card.w, card.h, radius); ctx.stroke();
  ctx.restore();
  return (px, py) => [cx + (px - fx) * s, cy + (py - fy) * s, s];
}

/* ---------- captions: narration words, the current word in amber ---------- */
function karaoke(t) {
  const caps = CUES.captions;
  let i = -1;
  for (let k = 0; k < caps.length; k++) if (caps[k].start - 0.12 <= t) i = k;
  if (i < 0) return;
  const c = caps[i], prev = caps[i - 1], next = caps[i + 1];
  if (t > c.end + 0.18) return;
  const aIn = prev && c.start - prev.end < 0.1 ? 1 : easeOut(prog(t, c.start - 0.12, c.start + 0.06));
  const aOut = next && next.start - c.end < 0.1 ? 1 : 1 - prog(t, c.end, c.end + 0.18);
  const weight = 600;
  let size = 56;
  const measure = sz => {
    ctx.font = `${weight} ${sz}px ${FONT}`;
    const sp = ctx.measureText(' ').width;
    const widths = c.words.map(w => richWidth(w.d, sz, weight));
    return { sp, widths, total: widths.reduce((a, b) => a + b, 0) + sp * (c.words.length - 1) };
  };
  ctx.save();
  let m = measure(size);
  if (m.total > 1760) { size = Math.floor(size * 1760 / m.total); m = measure(size); } // long chunk: shrink to fit
  ctx.globalAlpha *= Math.min(aIn, aOut);
  const by = 1016 - size * 1.6;
  ctx.fillStyle = 'rgba(4,10,18,0.74)';
  ctx.beginPath(); ctx.roundRect((W - m.total) / 2 - 36, by, m.total + 72, size * 1.6 + 8, 20); ctx.fill();
  let x = (W - m.total) / 2;
  c.words.forEach((w, k) => {
    const spoken = t >= w.s, current = spoken && t < w.e;
    drawRich(w.d, x, by + size * 1.12, { size, weight, color: current ? '#ffd08a' : spoken ? '#f4f8fb' : 'rgba(244,248,251,0.42)' });
    x += m.widths[k] + m.sp;
  });
  ctx.restore();
}

/* ---------- chapter card: big title, then demoted to a top-left label ---------- */
function chapterOverlay(t) {
  const chs = CUES.chapters;
  for (let k = 0; k < chs.length; k++) {
    const c = chs[k], next = chs[k + 1];
    if (c.show === false) continue;
    const end = next ? next.card : CUES.duration + 1;
    if (t < c.card || t > end) continue;
    const inA = easeOut(prog(t, c.card, c.card + 0.3));
    const dem = easeInOut(prog(t, c.first - 0.35, c.first + 0.15));
    const outA = 1 - prog(t, end - 0.25, end);
    const scrim = 0.82 * inA * (1 - dem); // opaque enough that a busy scene does not show through
    if (scrim > 0) { ctx.fillStyle = `rgba(3,7,14,${scrim})`; ctx.fillRect(0, 0, W, H); }
    if (dem < 1) {
      const a = inA * (1 - dem), y = lerp(520, 470, dem);
      ctx.save();
      drawRich(`CHAPTER ${c.n}`, W / 2, y - 70, { size: 26, weight: 600, color: C.amber, align: 'center', alpha: a, spacing: 8 });
      drawRich(c.title, W / 2, y + 20, { size: 84, weight: 600, color: '#f4f8fb', align: 'center', alpha: a });
      ctx.fillStyle = C.amber; ctx.globalAlpha = a;
      const lw = 160 * easeOut(prog(t, c.card + 0.1, c.card + 0.6));
      ctx.fillRect(W / 2 - lw / 2, y + 52, lw, 3);
      ctx.restore();
    }
    if (dem > 0) drawRich(`${c.n} · ${c.title.toUpperCase()}`, 120, 112, { size: 22, weight: 600, color: C.amber, alpha: dem * outA, spacing: 4 });
  }
}

/* ---------- note in a corner while AI-generated imagery is on screen ---------- */
function aiNote(alpha, text = 'Background illustration: AI-generated') {
  if (alpha > 0) drawRich(text, W - 36, 44, { size: 16, color: '#ffffff', align: 'right', alpha: 0.5 * alpha });
}

/* ---------- compositor plumbing ---------- */
function resetContext() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.letterSpacing = '0px'; ctx.filter = 'none';
}
function fadeBlack(t) { // fade in from black at the start, out at the end
  const fb = Math.max(1 - easeOut(prog(t, 0, 0.35)), prog(t, E.fade_out, CUES.duration));
  if (fb > 0) { ctx.fillStyle = `rgba(0,0,0,${fb})`; ctx.fillRect(0, 0, W, H); }
}
function timeStamp(t) { // on preview stills only
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 250, 64);
  drawRich(`t = ${t.toFixed(2)} s`, 18, 44, { size: 32, weight: 700, color: '#ffe066' });
  ctx.restore();
}
async function loadAssets(map = {}) {
  await Promise.all(Object.entries(map).map(async ([name, src]) => {
    const img = new Image();
    img.src = src;
    try { await img.decode(); } catch { throw new Error(`asset "${name}" did not load: ${src}`); }
    IMG[name] = img;
  }));
}
