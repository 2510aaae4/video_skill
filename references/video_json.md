# video.json

`video.json` is the single source of truth for a video. `build_timeline.mjs` reads it and writes `cues.json`, which the scenes, `score.mjs` and `render.mjs` use.

## Fields

| field | default | meaning |
|---|---|---|
| `title` | `"Untitled video"` | Title for scenes (`CUES.title`) and the transcript header. |
| `output` | `"video"` | Base name: `out/<output>.mp4`, `.srt`, `_transcript.txt`. |
| `voice` | `"Mark"` | Part of an English Windows voice name: Mark, David, Zira, … |
| `rate` | `1.0` | Speaking rate. 0.95 suits dense technical narration. |
| `fps` | `30` | Frame rate. |
| `lead` | `4.0` | Seconds before the first line. The title shows until the first chapter card, which comes `chapter_gap` s before the line. |
| `chapter_gap` | `1.15` | Pause before a chapter that shows a card. The card appears this long before the line. |
| `line_gap` | `0.35` | Default pause before any other line. |
| `end_hold` | `3.0` | Seconds after the last line. The end card appears 0.45 s after the last word. |
| `assets` | `{}` | Name → path of images to preload, e.g. `{"photo": "assets/photo.jpg"}`, available as `IMG.photo`. |
| `constants` | `{}` | Free values for scenes (`CUES.constants`). |
| `whisper_prompt` | `""` | Vocabulary hint for `verify_sync.py` only, e.g. rare names. Not used by the per-line check. |
| `music` | `{}` | See Sound below. |
| `sfx` | `[]` | See Sound below. |
| `lines` | (required) | Narration lines, in order. |
| `anchors` | `{}` | Event name → `[lineId, word, nth]`. See Anchors. |

## Lines

```json
{ "id": "N3", "chapter": { "n": 2, "title": "Pictures follow words" }, "gap": 2.0,
  "source": "Results, paragraph 2", "text": "Each animation is tied to a spoken word, / so when I say *zoom*, / the picture zooms in." }
```

| field | meaning |
|---|---|
| `id` | Unique. It also names the events `<id>_start` and `<id>_end`, and the audio file `vo/<id>.wav`. |
| `chapter` | Opens a chapter: `n` (number), `title`, and `card` (default `true`; `false` = no title card). The first line must open chapter 1. |
| `gap` | Pause before this line. The default is `line_gap`, or `chapter_gap` for a chapter opener. On a chapter opener, a gap longer than `chapter_gap` keeps the previous scene on screen for the difference before the card comes in. |
| `source`, `notes` | For review only; the scripts ignore them. |
| `text` | What is spoken and captioned. Markup below. |

## Text markup

| markup | effect |
|---|---|
| `*word*` | Italic on screen (species and gene names). The voice ignores it. |
| `**word**` | Bold on screen. |
| `{display\|speech}` | Captions show `display`; the voice says `speech`. Punctuation right after the braces is kept, e.g. `{2024.\|twenty twenty-four.}`. |
| ` / ` | Caption break. Each segment is one caption chunk. Keep chunks to about 8 words so they fit one line at 56 px. |

## Anchors

`"zoom": ["N3", "zoom"]` sets the event `zoom` to the time the voice starts the word "zoom" in line N3. Use `nth` (0-based) for repeated words: `["N1", "frame", 1]` is the second "frame".

Matching uses the display word without `*` and punctuation, and is case-sensitive. When an anchor is not found, `build_timeline.mjs` stops and lists the words of that line.

## Events available in scenes (`E`)

| event | time |
|---|---|
| each anchor name | start of the anchored word |
| `<id>_start`, `<id>_end` | start and end of each spoken line |
| `ch<n>` | chapter n card (or scene switch when `card: false`) |
| `title_in`, `subtitle_in` | 0.15 s, 0.45 s |
| `end_title` | last word + 0.45 s |
| `fade_out` | duration − 0.8 s |

`CUES.chapters` holds `{n, title, card, first, show}`, where `first` is the chapter's first spoken line.

## Sound

`music` fields:
- `chords`: chord names per chapter, in order. The default cycle is Fmaj7, Dm(add9), Cadd9, Gadd9, Fsus2, Am7.
- `title_chord` and `end_chord`.
- `level`: music volume factor, default 1.
- `duck`: music gain while the voice speaks, default 0.32.
- `pad` and `sfx`: `false` turns that layer off.

Available chords: `Am(add9)`, `Asus2`, `Am7`, `Fmaj7`, `Fsus2`, `Dm(add9)`, `Cadd9`, `Gadd9`.

`sfx` cues: `{ "at": "<event or seconds>", "type": "<preset>", "offset": 0, "gain": 1 }`.

| preset | sound | typical use |
|---|---|---|
| `tick` | short high tone | a label or row appears |
| `pop` | mid tone | a box or badge appears |
| `low` | low tone | a warning or negative result |
| `chime` | two bell tones | a section or result lands (also played on every chapter card) |
| `steps` | three rising notes | a sequence of three items |
| `sparkle` | quick high arpeggio | something completes or connects |
| `confirm` | five rising notes | a check passes |
| `rise` / `fall` | pitch sweep up / down | zoom in, something grows / is lost |
| `swell` | soft noise swell | a mood change |
| `whoosh` | falling sweep + noise | a scene transition |
| `thump` | low hit | an impact |
| `snap` | two clicks | something breaks |
| `alert` | noise + high tones + hit | a key event or a failure |

A title arpeggio, the chapter-card chimes and an end chord are added automatically.
