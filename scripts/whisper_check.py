"""Pronunciation check with the locally cached faster-whisper model (no downloads, nothing uploaded).

  python whisper_check.py <project> --lines      per narration line: what Whisper heard vs the script
  python whisper_check.py "<glob>" [--words]     plain transcripts of audio files

The --lines check deliberately runs without a vocabulary prompt: a prompt makes Whisper guess
the intended term even when the voice mispronounces it.
Set WHISPER_MODEL to use another cached model (default: medium).
"""
import difflib
import glob
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # Windows consoles are often not UTF-8
MODEL = os.environ.get('WHISPER_MODEL', 'medium')
TOKEN = re.compile(r'\{([^|}]+)\|([^}]+)\}(\S*)|(\S+)')


def norm(word):
    return re.sub(r"[^a-z0-9']", '', word.lower().replace('*', ''))


def display_words(text):
    """words as shown in the captions: {display|speech} -> display, ' / ' dropped, *italics* unwrapped"""
    out = []
    for m in TOKEN.finditer(text):
        if m.group(4) == '/':
            continue
        out.append(m.group(1) + m.group(3) if m.group(4) is None else m.group(4))
    return [w.replace('*', '') for w in out]


def load():
    from faster_whisper import WhisperModel
    try:
        return WhisperModel(MODEL, device='cuda', compute_type='float16', local_files_only=True)
    except Exception as exc:  # no CUDA runtime -> CPU is fine for narration-length audio
        print(f'[cuda unavailable: {exc.__class__.__name__}; using cpu]', file=sys.stderr)
    try:
        return WhisperModel(MODEL, device='cpu', compute_type='int8', local_files_only=True)
    except Exception as exc:
        sys.exit(f'Whisper model "{MODEL}" is not in the local cache ({exc.__class__.__name__}).\n'
                 f'Download it once (about 1.5 GB, needs internet):\n'
                 f'  python -c "from faster_whisper import WhisperModel; WhisperModel(\'{MODEL}\')"')


def check_lines(root):
    with open(os.path.join(root, 'video.json'), encoding='utf-8-sig') as f:
        video = json.load(f)
    model = load()
    flagged = 0
    for line in video['lines']:
        wav = os.path.join(root, 'vo', f"{line['id']}.wav")
        segs, _ = model.transcribe(wav, language='en', beam_size=5, vad_filter=False)
        heard = ' '.join(s.text.strip() for s in segs)
        ref = [w for w in (norm(x) for x in display_words(line['text'])) if w]
        hyp = [w for w in (norm(x) for x in heard.split()) if w]
        sm = difflib.SequenceMatcher(a=ref, b=hyp, autojunk=False)
        diffs = [(' '.join(ref[i1:i2]), ' '.join(hyp[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != 'equal']
        ok = sum(n for _, _, n in sm.get_matching_blocks())
        print(f"{'OK   ' if not diffs else 'CHECK'} {line['id']} {ok}/{len(ref)} | heard: {heard}")
        for want, got in diffs:
            print(f"        script: {want or '-':<32} heard: {got or '-'}")
        flagged += bool(diffs)
    print(f'\n{flagged} line(s) to review. Numbers and hyphenation often differ harmlessly; '
          'a term heard as a different real word needs rewording or a {display|speech} override.')


def transcribe_glob(pattern, words):
    model = load()
    for f in sorted(glob.glob(pattern)):
        segs, _ = model.transcribe(f, language='en', beam_size=5, word_timestamps=words, vad_filter=False)
        segs = list(segs)
        print(f'{os.path.relpath(f)} | {" ".join(s.text.strip() for s in segs)}')
        if words:
            ws = [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)} for s in segs for w in s.words]
            print(json.dumps(ws, ensure_ascii=False))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    target = sys.argv[1]
    if '--lines' in sys.argv:
        check_lines(os.path.abspath(target))
    else:
        transcribe_glob(target, '--words' in sys.argv)


if __name__ == '__main__':
    main()
