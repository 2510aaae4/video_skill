// Checks what the pipeline needs, without changing anything.
//   node doctor.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome } from './chrome_path.mjs';

let missing = 0;
const report = (good, label, hint = '') => {
  if (!good) missing++;
  console.log(`${good ? 'OK  ' : 'MISS'} ${label}${!good && hint ? `\n       -> ${hint}` : ''}`);
};
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });

report(parseInt(process.versions.node, 10) >= 22 && typeof WebSocket === 'function',
  `Node ${process.versions.node} (needs 22+ for the built-in WebSocket)`, 'install Node.js 22 or newer');

const ff = run('ffmpeg', ['-version']);
report(ff.status === 0, `ffmpeg ${ff.status === 0 ? ff.stdout.split('\n')[0].split(' ')[2] : ''}`, 'install ffmpeg and put it on PATH');

const chrome = findChrome();
report(Boolean(chrome), `browser: ${chrome || 'none'}`, 'install Chrome or Edge, or set CHROME to a Chromium-based browser');

if (process.platform === 'win32') {
  const ps = run('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime; '
    + '$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]; '
    + "[Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { $_.DisplayName + ' [' + $_.Language + ']' }"]);
  const voices = (ps.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  report(voices.some(v => /\[en-/.test(v)), `Windows voices: ${voices.join(', ') || 'none'}`,
    'Settings > Time & language > Speech > Manage voices: add an English voice');
} else {
  report(false, 'Windows voices', 'narration uses Windows OneCore voices (tts.ps1); other systems need another TTS');
}

const py = run('python', ['-c', 'import faster_whisper, PIL; print(faster_whisper.__version__, PIL.__version__)']);
report(py.status === 0, `Python faster-whisper / Pillow ${py.status === 0 ? py.stdout.trim().replace(' ', ' / ') : ''}`,
  'pip install faster-whisper pillow');

const model = process.env.WHISPER_MODEL || 'medium';
const hub = process.env.HF_HUB_CACHE || path.join(process.env.HF_HOME || path.join(os.homedir(), '.cache', 'huggingface'), 'hub');
report(fs.existsSync(path.join(hub, `models--Systran--faster-whisper-${model}`)), `Whisper model "${model}" in the local cache`,
  `python -c "from faster_whisper import WhisperModel; WhisperModel('${model}')"   (one-time download, about 1.5 GB)`);

console.log(missing ? `\n${missing} item(s) missing.` : '\nReady.');
process.exit(missing ? 1 : 0);
