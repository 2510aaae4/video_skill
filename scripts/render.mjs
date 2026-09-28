// Frame renderer. Serves the project folder on localhost, drives a headless Chromium through the
// DevTools protocol (Node's built-in WebSocket, no npm packages) and writes JPEG frames.
//
//   node render.mjs <project> --stills=auto         stills after chapter starts and anchors + out/stills_sheet.jpg
//   node render.mjs <project> --stills=2.5,8,13.5   stills at chosen times (seconds)
//   node render.mjs <project>                       every frame into frames/ (old frames are cleared)
//   node render.mjs <project> --resume              continue an interrupted frame render
//   node render.mjs <project> --sheet               contact sheet of the frames: out/contact_sheet.jpg
//   node render.mjs <project> --encode              frames + score.wav -> out/<output>.mp4
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { findChrome } from './chrome_path.mjs';

const argv = process.argv.slice(2);
const ROOT = path.resolve(argv.find(a => !a.startsWith('--')) || '.');
const args = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const cues = JSON.parse(fs.readFileSync(path.join(ROOT, 'cues.json'), 'utf8'));
const FPS = cues.fps, DUR = cues.duration, NAME = cues.output || 'video';
const TOTAL = Math.round(DUR * FPS);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
function serve() { // http, not file://: a file:// page taints the canvas and toDataURL fails
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push(`${d.exception?.description || d.text} (${d.url || 'inline'}:${d.lineNumber + 1})`);
        return;
      }
      const p = msg.id && this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    };
    this.opened = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

async function launchChrome() {
  const exe = findChrome();
  if (!exe) throw new Error('no Chrome or Edge found: install one, or set CHROME to a Chromium-based browser');
  // throwaway profile: never touches the user's browser profile; no extensions, no background downloads
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'video-skill-chrome-'));
  const portFile = path.join(profile, 'DevToolsActivePort');
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--disable-extensions', '--disable-component-extensions-with-background-pages', '--disable-component-update',
    '--disable-background-networking', '--disable-sync', '--disable-default-apps', '--no-pings', '--metrics-recording-only',
    '--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching,OptimizationTargetPrediction,OptimizationHints,MediaRouter',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--force-color-profile=srgb', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  let lines = [];
  for (let i = 0; i < 300; i++) {
    if (fs.existsSync(portFile)) {
      lines = fs.readFileSync(portFile, 'utf8').trim().split('\n').map(s => s.trim());
      if (lines.length >= 2) break;
    }
    await sleep(100);
  }
  if (lines.length < 2) { proc.kill(); throw new Error(`browser did not start: ${exe}`); }
  return { proc, port: lines[0], browserPath: lines[1], profile };
}

async function openPage(port, url) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Runtime.enable'); // to report script errors from scene.html and js/*.js
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: cues.width, height: cues.height, deviceScaleFactor: 1, mobile: false });
  // A background tab never finishes decoding images, so window.ready would hang there.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    if (await cdp.eval('typeof window.ready') === 'object') break;
    await sleep(100);
  }
  if (await cdp.eval('typeof window.ready') !== 'object') {
    throw new Error(`scene did not start:\n  ${cdp.errors.join('\n  ') || 'window.ready is not defined in scene.html'}`);
  }
  const state = await Promise.race([
    cdp.eval('window.ready', true),
    sleep(15000).then(() => { throw new Error('window.ready timed out (an asset did not load, or the page is in a background tab)'); }),
  ]);
  return { cdp, state };
}

async function grab(cdp, t, file, stamp = false) {
  const dataUrl = await cdp.eval(`renderFrame(${t}, ${stamp})`);
  fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
}

function ffmpeg(ffArgs) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...ffArgs], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg exited with ${r.status}`);
}

function autoStills() { // one still shortly after each chapter card, chapter start and anchored event
  const E = cues.events, ts = [1.5, E.end_title + 1.0];
  for (const c of cues.chapters) ts.push(c.card + 0.5, c.first + 1.2);
  for (const [k, v] of Object.entries(E)) {
    if (['title_in', 'subtitle_in', 'end_title', 'fade_out'].includes(k) || /^ch\d+$/.test(k) || /_(start|end)$/.test(k)) continue;
    ts.push(v + 0.8);
  }
  const out = [];
  for (const t of ts.filter(x => x >= 0 && x < DUR).sort((a, b) => a - b)) {
    if (!out.length || t - out[out.length - 1] > 0.6) out.push(Math.round(t * 100) / 100);
  }
  return out;
}

const frameFile = i => path.join(ROOT, 'frames', `f${String(i).padStart(5, '0')}.jpg`);
function framesComplete() {
  for (let i = 0; i < TOTAL; i++) if (!fs.existsSync(frameFile(i))) return false;
  return true;
}

async function removeDir(dir) { // Chrome may hold file locks for a moment after it exits
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { await sleep(300); }
  }
  console.warn(`could not remove temporary profile ${dir}`);
}

async function main() {
  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  if (args.sheet || args.encode) {
    if (!framesComplete()) throw new Error(`frames/ is incomplete (${TOTAL} expected): run the frame render first`);
    if (args.sheet) {
      const every = Math.round(FPS * Math.max(2, Math.ceil(DUR / 36))); // about 36 thumbnails
      ffmpeg(['-framerate', String(FPS), '-i', 'frames/f%05d.jpg', '-vf',
        `select='not(mod(n,${every}))',scale=480:-1,tile=6x${Math.ceil(Math.ceil(TOTAL / every) / 6)}:padding=6:color=black`,
        '-frames:v', '1', 'out/contact_sheet.jpg']);
      console.log('wrote out/contact_sheet.jpg');
    }
    if (args.encode) {
      if (!fs.existsSync(path.join(ROOT, 'score.wav'))) throw new Error('score.wav missing: run score.mjs first');
      ffmpeg(['-framerate', String(FPS), '-i', 'frames/f%05d.jpg', '-i', 'score.wav', '-map', '0:v', '-map', '1:a',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart', '-t', String(DUR), `out/${NAME}.mp4`]); // explicit -t, not -shortest
      console.log(`wrote out/${NAME}.mp4`);
    }
    return;
  }

  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/scene.html`;
  const chrome = await launchChrome();
  try {
    if (args.stills) {
      const dir = path.join(ROOT, 'stills');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const { cdp, state } = await openPage(chrome.port, url);
      console.log(`page ready (${state})`);
      const times = args.stills === 'auto' ? autoStills() : String(args.stills).split(',').map(parseFloat);
      for (const t of times) await grab(cdp, t, path.join(dir, `still_${t.toFixed(2).padStart(6, '0')}.jpg`), true);
      const sheet = await cdp.eval(`(() => {
        const times = ${JSON.stringify(times)}, cols = 4, tw = 480, th = Math.round(tw * H / W), pad = 8;
        const sc = document.createElement('canvas');
        sc.width = cols * (tw + pad) + pad; sc.height = Math.ceil(times.length / cols) * (th + pad) + pad;
        const g = sc.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, sc.width, sc.height);
        times.forEach((t, i) => { renderFrame(t, true); g.drawImage(cv, pad + (i % cols) * (tw + pad), pad + Math.floor(i / cols) * (th + pad), tw, th); });
        return sc.toDataURL('image/jpeg', 0.88);
      })()`);
      fs.writeFileSync(path.join(ROOT, 'out', 'stills_sheet.jpg'), Buffer.from(sheet.slice(sheet.indexOf(',') + 1), 'base64'));
      console.log(`wrote ${times.length} stills (stills/) and out/stills_sheet.jpg: ${times.join(', ')}`);
      return;
    }
    const dir = path.join(ROOT, 'frames');
    if (!args.resume) fs.rmSync(dir, { recursive: true, force: true }); // stale frames would survive edits
    fs.mkdirSync(dir, { recursive: true });
    const todo = [];
    for (let i = 0; i < TOTAL; i++) if (!fs.existsSync(frameFile(i))) todo.push(i);
    const workers = Math.max(1, parseInt(args.workers || '1', 10)); // one page already renders ~40 frames/s
    let done = 0;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const { cdp } = await openPage(chrome.port, url);
      for (let k = w; k < todo.length; k += workers) {
        await grab(cdp, todo[k] / FPS, frameFile(todo[k]));
        if (++done % 300 === 0) console.log(`${done}/${todo.length} frames, ${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
      }
    }));
    console.log(`rendered ${done} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    try {
      const b = new CDP(`ws://127.0.0.1:${chrome.port}${chrome.browserPath}`);
      await b.opened;
      await Promise.race([b.send('Browser.close'), sleep(2000)]);
    } catch { /* fall through to kill */ }
    chrome.proc.kill();
    srv.close();
    await removeDir(chrome.profile);
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
