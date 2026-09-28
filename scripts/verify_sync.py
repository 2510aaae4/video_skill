"""Acceptance check for the finished video (local faster-whisper and ffmpeg; nothing uploaded).

  python verify_sync.py <project>

- words: how many caption words Whisper hears in the final MP4 (difflib alignment)
- sync: Whisper word start minus caption word start, over the aligned words
- loudness: integrated loudness and true peak (EBU R128)
"""
import difflib
import json
import os
import re
import statistics
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from whisper_check import load, norm  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def loudness(mp4):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', mp4, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    p = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
    return (float(i[-1]) if i else None), (float(p[-1]) if p else None)


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
    with open(os.path.join(root, 'cues.json'), encoding='utf-8') as f:
        cues = json.load(f)
    with open(os.path.join(root, 'video.json'), encoding='utf-8-sig') as f:
        video = json.load(f)
    mp4 = os.path.join(root, 'out', f"{cues.get('output', 'video')}.mp4")
    wav = os.path.join(root, 'out', '_verify_16k.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp4, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)

    ref = [(norm(w['d']), w['s']) for c in cues['captions'] for w in c['words']]
    ref = [r for r in ref if r[0]]
    segs, _ = load().transcribe(wav, language='en', beam_size=5, word_timestamps=True,
                                initial_prompt=video.get('whisper_prompt') or None)
    hyp = [(norm(w.word), w.start) for s in segs for w in s.words]
    hyp = [h for h in hyp if h[0]]
    os.remove(wav)

    sm = difflib.SequenceMatcher(a=[r[0] for r in ref], b=[h[0] for h in hyp], autojunk=False)
    matched, offsets = 0, []
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            matched += 1
            offsets.append(hyp[b + k][1] - ref[a + k][1])
    missed = [ref[i][0] for op in sm.get_opcodes() if op[0] in ('replace', 'delete') for i in range(op[1], op[2])]
    heard = [hyp[j][0] for op in sm.get_opcodes() if op[0] in ('replace', 'insert') for j in range(op[3], op[4])]
    abs_off = sorted(abs(o) for o in offsets) or [float('nan')]
    acc = matched / len(ref) if ref else 0
    med = statistics.median(abs_off)
    lufs, peak = loudness(mp4)

    verdict = lambda ok: 'PASS ' if ok else 'CHECK'
    print(f'{verdict(acc >= 0.90)} words: {matched}/{len(ref)} caption words heard ({acc:.1%})')
    print(f'{verdict(med <= 0.15)} sync: median |offset| {med:.3f} s, 90th pct {abs_off[int(0.9 * (len(abs_off) - 1))]:.3f} s, '
          f'median signed {statistics.median(offsets) if offsets else float("nan"):+.3f} s')
    if lufs is not None:
        print(f'{verdict(abs(lufs + 16) <= 1.5)} loudness: {lufs:.1f} LUFS (target -16)')
    if peak is not None:
        print(f'{verdict(peak <= -1.0)} true peak: {peak:.1f} dBTP (limit -1.0)')
    print('caption words not heard as written:', missed)
    print('Whisper heard instead:', heard)


if __name__ == '__main__':
    main()
