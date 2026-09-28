'use strict';
/* Demo scenes for the template: replace them with the video's own scenes.
   Contract with scene.html: sceneTitle(t, a), CHAPTER_SCENES[n](t, a), sceneEnd(t, a), optional setupScenes().
   a = the scene's opacity (0..1). Time everything from E (events in cues.json), never from fixed seconds. */

function sceneTitle(t, a) {
  const img = IMG.sample;
  ctx.save();
  ctx.globalAlpha = a;
  if (img) { // slow push-in on the title image
    const u = prog(t, 0, CUES.chapters[0].card + 0.6);
    const s = Math.max(W / img.width, H / img.height) * lerp(1.05, 1.12, easeInOut(u));
    ctx.drawImage(img, W / 2 - img.width / 2 * s, H / 2 - img.height / 2 * s, img.width * s, img.height * s);
  }
  const lg = ctx.createLinearGradient(0, 0, W * 0.7, 0);
  lg.addColorStop(0, 'rgba(3,7,14,0.94)'); lg.addColorStop(0.6, 'rgba(3,7,14,0.6)'); lg.addColorStop(1, 'rgba(3,7,14,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  const k1 = easeOut(prog(t, E.title_in, E.title_in + 0.45)), k2 = easeOut(prog(t, E.subtitle_in, E.subtitle_in + 0.5));
  drawRich('VIDEO_SKILL', 140, 420 - (1 - k1) * 14, { size: 22, weight: 600, color: C.amber, alpha: k1, spacing: 6 });
  ctx.fillStyle = C.amber; ctx.globalAlpha = a * k1; ctx.fillRect(140, 440, lerp(0, 120, k1), 3); ctx.globalAlpha = a;
  drawRich(CUES.title, 140, 530 - (1 - k1) * 18, { size: 60, weight: 600, color: '#f4f8fb', alpha: k1 });
  drawRich(CUES.constants.subtitle || '', 140, 590, { size: 28, color: '#c3d6e4', alpha: k2 });
  ctx.restore();
}

/* ---------- chapter 1: frames, then script -> voice -> timestamps, each on its spoken word ---------- */
const PIPE = [
  { key: 'script', label: 'Script', note: 'video.json', x: 520 },
  { key: 'voice', label: 'Voice', note: 'local TTS', x: 960 },
  { key: 'timestamp', label: 'Timestamps', note: 'one per word', x: 1400 },
];
const PIPE_Y = 640;

function filmstrip(t) { // six frames appear between the first and the second "frame"
  const n = 6, fw = 150, fh = 84, gap = 18, x0 = W / 2 - (n * fw + (n - 1) * gap) / 2, y = 400;
  for (let i = 0; i < n; i++) {
    const at = lerp(E.frame1, E.frame2 + 0.3, i / (n - 1)), u = easeOutBack(prog(t, at, at + 0.3));
    if (u <= 0) continue;
    const x = x0 + i * (fw + gap);
    ctx.save();
    ctx.globalAlpha *= clamp(u);
    panel(x, y, fw, fh, { fill: 'rgba(12,28,44,0.94)', stroke: C.edge, radius: 8 });
    ctx.fillStyle = C.amber;
    ctx.beginPath(); ctx.arc(x + 20 + (fw - 40) * i / (n - 1), y + fh / 2 + Math.sin(i * 1.3) * 16, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawRich(`t = ${(i / 30).toFixed(3)} s`, x + fw / 2, y + fh + 28, { size: 18, color: C.muted, align: 'center', alpha: clamp(u) });
  }
}

function waveform(cx, cy, w, h, t, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const n = 36;
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + (i + 0.5) * w / n;
    const amp = h * (0.2 + 0.8 * Math.abs(Math.sin(t * 7 + i * 0.9) * Math.sin(t * 3.1 + i * 0.37)));
    ctx.beginPath(); ctx.moveTo(x, cy - amp / 2); ctx.lineTo(x, cy + amp / 2); ctx.stroke();
  }
  ctx.restore();
}

function sceneNarration(t, a) {
  ctx.save();
  ctx.globalAlpha = a;
  drawRich('The narration drives the timeline', W / 2, 230, { size: 44, weight: 600, align: 'center',
    alpha: easeOut(prog(t, E.N1_start, E.N1_start + 0.5)) });
  pill('renderFrame(t)  →  one image', W / 2, 320, { size: 24, bg: C.teal, align: 'center',
    scale: easeOutBack(prog(t, E.code - 0.05, E.code + 0.4)) });
  filmstrip(t);
  for (const p of PIPE) {
    const up = easeOutBack(prog(t, E[p.key] - 0.05, E[p.key] + 0.4));
    if (up <= 0) continue;
    ctx.save();
    ctx.translate(p.x, PIPE_Y); ctx.scale(up, up);
    panel(-150, -80, 300, 160, { fill: 'rgba(12,28,44,0.94)', stroke: C.edge });
    drawRich(p.label, 0, -6, { size: 36, weight: 600, align: 'center' });
    drawRich(p.note, 0, 38, { size: 22, color: C.muted, align: 'center' });
    ctx.restore();
  }
  const linkAt = Math.max(E.script, E.voice); // arrow once both ends are on screen
  arrow(680, PIPE_Y, 800, PIPE_Y, { progress: easeOut(prog(t, linkAt + 0.2, linkAt + 0.7)) });
  arrow(1120, PIPE_Y, 1240, PIPE_Y, { progress: easeOut(prog(t, E.timestamp + 0.1, E.timestamp + 0.6)) });
  const wv = win(t, E.voice, E.N2_end + 0.6, 0.3, 0.4);
  if (wv > 0) waveform(960, PIPE_Y + 130, 280, 40, t, wv);
  ['every', 'word', 'gets', 'a', 'time'].forEach((w, i) => { // ticks under the timestamps box
    const at = E.timestamp + 0.25 + i * 0.12, u = easeOutBack(prog(t, at, at + 0.35));
    if (u <= 0) return;
    const x = 1270 + i * 65;
    ctx.save();
    ctx.globalAlpha *= clamp(u);
    ctx.fillStyle = C.amber; ctx.fillRect(x - 1.5, PIPE_Y + 100, 3, 24 * clamp(u));
    ctx.restore();
    drawRich(w, x, PIPE_Y + 152, { size: 20, color: C.muted, align: 'center', alpha: clamp(u) });
  });
  ctx.restore();
}

/* ---------- chapter 2: a photo card that zooms when "zoom" is spoken ---------- */
const PHOTO = { x: 360, y: 190, w: 1200, h: 650 }; // below the chapter label, above the captions
const FOCUS = [800, 500]; // image pixel the camera lands on (read off: image_tools.py grid assets/sample.jpg)

function scenePictures(t, a) {
  const z = easeInOut(prog(t, E.zoom - 0.1, E.zoom + 1.0));
  const cam = { fx: lerp(800, FOCUS[0], z), fy: lerp(500, FOCUS[1], z), z: lerp(1.0, 2.6, z) };
  const map = photoCard(IMG.sample, PHOTO, cam, { alpha: a });
  drawRich('assets/sample.jpg · the camera is a focus point plus a zoom', PHOTO.x, PHOTO.y - 16, { size: 20, color: C.dim, alpha: a });
  if (map) {
    const ring = easeOut(prog(t, E.zoom + 0.8, E.zoom + 1.2));
    if (ring > 0) {
      const [x, y] = map(...FOCUS);
      highlight(x, y, 70, { alpha: a * ring, t });
      pill('zoomed on the word "zoom"', x + 100, y, { size: 22, bg: '#ffd08a', alpha: a * ring });
    }
  }
  const ok = easeOutBack(prog(t, E.check - 0.05, E.check + 0.4));
  if (ok > 0) pill('✓ words and timing checked by Whisper', W / 2, PHOTO.y + PHOTO.h - 44, { size: 24, bg: C.green, align: 'center', alpha: a, scale: ok });
}

function sceneEnd(t, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(5,10,18,0.96)'; ctx.fillRect(0, 0, W, H);
  drawRich('MADE WITH VIDEO_SKILL', W / 2, 430, { size: 22, weight: 600, color: C.amber, align: 'center', spacing: 6 });
  drawRich(CUES.title, W / 2, 520, { size: 54, weight: 600, align: 'center' });
  drawRich('Narration synthesized locally · every frame drawn by code', W / 2, 580, { size: 26, color: C.muted, align: 'center' });
  ctx.restore();
}

const CHAPTER_SCENES = { 1: sceneNarration, 2: scenePictures };
