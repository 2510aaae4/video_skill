---
name: video-skill
description: Make narrated explainer videos (1080p, 16:9, English narration with word-by-word captions) entirely with local code on Windows. A built-in Windows voice reads the script and reports a timestamp for every word, every animation is Canvas code anchored to a spoken word, frames render in headless Chrome, ffmpeg encodes, and faster-whisper checks pronunciation and caption sync. Use when the user wants to turn a paper, report, lecture, case, data story or outline into a narrated video, animated explainer or video abstract, especially when the material must stay on their computer.
---

# video-skill: narrated explainers rendered by code

Output per video: `out/<name>.mp4` (1920×1080, 30 fps, H.264 + AAC, −16 LUFS), `out/<name>.srt` and `out/<name>_transcript.txt`.

Nothing here is a video model. Every frame is drawn by JavaScript as a pure function of time. Every visual event is anchored to the word that introduces it, so picture, captions and sound share one clock. Voice, rendering, encoding and checking all run locally; nothing is uploaded.

`<skill>` below means the folder that contains this file.

## Fit

Good fit: papers, case discussions, lectures, guideline summaries, progress reports, data stories and photo stories. Anything that is narration plus pictures that explain.

Not a fit. Say so before starting:
- editing camera footage or talking-head recordings
- photorealistic motion (needs a video generation model)
- non-English narration (see Limits)
- narration on macOS or Linux (`tts.ps1` uses Windows OneCore voices)

## Setup check

```
node <skill>/scripts/doctor.mjs
```

It needs:
- Node 22+ (for the built-in WebSocket)
- ffmpeg on PATH
- Chrome or Edge
- an English Windows voice
- Python with faster-whisper and Pillow
- the faster-whisper `medium` model in the local cache

`doctor.mjs` prints the fix for anything missing. Downloading the model or installing software needs the user's permission.

## Project layout

Copy `<skill>/template/` to a new project folder. Keep projects out of cloud-synced folders: frames take hundreds of MB.

```
my_video/
  video.json     narration, chapters, anchors, assets, sound cues  -> references/video_json.md
  scene.html     compositor (normally unchanged)
  js/core.js     drawing helpers (normally unchanged)
  js/scenes.js   this video's scenes (always rewritten)
  assets/        images used on screen
  generated:     vo/  cues.json  score.wav  stills/  frames/  out/
```

The template builds a 28-second demo. Run it once on a new machine to confirm the setup works.

## Workflow

There are three sign-off gates. Do not render frames before gate 2.

### 0. Scope

Ask these once, briefly:
- purpose and audience
- target length
- source documents
- confidentiality: unpublished material stays local and is never pasted into an outside service
- whether AI-generated background images are acceptable (references/codex_images.md)
- who approves the wording

### 1. Script and storyboard (text only). Gate 1.

- Write short spoken sentences, grouped into chapters. Mark caption breaks with ` / `. Aim for at most about 8 words per caption chunk.
- Give each line a `source` note (section, figure or table) so a reviewer can check it against the document.
- Beside each line, describe the picture and the words that trigger each change. Those words become anchors.
- Planning numbers:
  - 120–150 spoken words per minute; 2.5 minutes is about 300–380 words.
  - A visual change every 8–10 s.
  - No more than 3 scenes of the same kind in a row.
  - Key information stays on screen for at least 1 s.
- Research content:
  - Keep the source's hedging ("consistent with", "may", "suspected").
  - Never turn an association into a cause.
  - Quote numbers exactly.
- Show the storyboard to the user as a table, then wait for approval.

### 2. Voice pass

```
node <skill>/scripts/build_timeline.mjs <project>
python <skill>/scripts/whisper_check.py <project> --lines
```

- Whisper stands in for a listener, and it has no vocabulary prompt here on purpose.
- If it hears a different real word, rephrase. A listener may mishear it too.
- If it garbles an acronym or unusual term, add a `{display|speech}` override, for example `{SQL|sequel}` or `{SNPs|S N Ps}`.
- Differences in numbers or hyphenation ("63" vs "sixty-three") are harmless.
- Re-run after edits. Unchanged lines are not re-synthesized.

### 3. Scenes. Gate 2.

- Write `js/scenes.js`: `sceneTitle`, one function per chapter in `CHAPTER_SCENES`, and `sceneEnd`. See references/scene_authoring.md.
- For real figures and photos, run `python <skill>/scripts/image_tools.py grid <image>` and read coordinates off the grid image. For multi-panel figures, find the real borders with `image_tools.py gutters <image>` before cropping.
- Preview with `node <skill>/scripts/render.mjs <project> --stills=auto`, then view `out/stills_sheet.jpg`. It has one still after each chapter card, chapter start and anchor, each stamped with its time. Fix overlaps, clipped text and anything shown too briefly, then repeat.
- Show the stills sheet to the user, then wait for approval.

### 4. Sound

```
node <skill>/scripts/score.mjs <project>
```

This builds chapter chords and `sfx` cues, ducks them under the voice, and mixes them with the narration into `score.wav`.

### 5. Render and encode

```
node <skill>/scripts/render.mjs <project>            # all frames, about 40 frames/s; clears old frames
node <skill>/scripts/render.mjs <project> --encode   # out/<name>.mp4
node <skill>/scripts/render.mjs <project> --sheet    # out/contact_sheet.jpg
```

Run long renders in the background. `--resume` only continues an interrupted render. After any edit, render all frames again.

### 6. Acceptance. Gate 3.

```
python <skill>/scripts/verify_sync.py <project>
```

Pass means:
- at least 90% of caption words heard
- median caption–speech offset of 0.15 s or less
- loudness of −16 ± 1.5 LUFS
- true peak of −1 dBTP or lower

Then:
1. View the contact sheet.
2. Work through references/qa_checklist.md.
3. Deliver the MP4, SRT and transcript with a short note of what was checked.

## Scene rules

- Scenes are a pure function of `t`. Carry no state between frames, and use only seeded randomness (`mulberry32`).
- Time everything from `E` (events in cues.json), never from fixed seconds. Then rewording re-times the picture automatically.
- Keep content between y 120 and 860. The caption band sits at the bottom.
- Text is never below 18 px. Captions are 56 px and shrink automatically for long chunks.
- Use one color per entity for the whole video (`C.series`).
- Keep the source's cautious wording in on-screen labels too.
- Label AI-generated imagery on screen (`aiNote`).

## Cost

Measured once, for a 2 min 40 s video built late in a long session: about 5 M weighted tokens. About 70% of that went to re-reading earlier conversation. A fresh session is estimated at about 2 M, mostly for writing scenes and viewing previews. To keep it low:
- Start a new session per video.
- Keep research reports out of the conversation.
- View one stills sheet rather than many single stills.

## Limits and extension points

- **English only.** `build_timeline.mjs` splits words on spaces. Windows also ships zh-TW voices (Hanhan, Yating, Zhiwei) with word cues. Chinese would need character-level tokens, caption line breaking and Whisper `language='zh'`. None of that is built or tested.
- **1920×1080 only.** A 9:16 version needs its own layouts and shorter caption chunks (3–4 words, 20 characters or fewer).
- **Synthetic voice.** The Windows voices sound synthetic. That is fine for personal viewing; consider a better local TTS before publishing.
- **Simple soundtrack.** It is a synthesized pad plus effects. Using a music file would mean mixing it in `score.mjs` instead of the pad, which is not implemented.

## References

- references/video_json.md: every field of video.json, the text markup and the events
- references/scene_authoring.md: helper API, layout and scene recipes
- references/qa_checklist.md: acceptance checklist
- references/pitfalls.md: problems met while building this, and their fixes
- references/codex_images.md: optional AI background images through the Codex CLI
- references/lineage.md: where the design came from
