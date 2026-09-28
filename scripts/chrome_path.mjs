// Finds a Chromium-based browser for headless rendering. Set CHROME to override.
import fs from 'node:fs';
import path from 'node:path';

export function findChrome() {
  const env = process.env;
  const pf = env.PROGRAMFILES, pf86 = env['PROGRAMFILES(X86)'], local = env.LOCALAPPDATA;
  const candidates = [
    env.CHROME,
    pf && path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    pf86 && path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    pf86 && path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    pf && path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find(p => p && fs.existsSync(p)) || null;
}
