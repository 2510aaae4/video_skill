# Pitfalls met while building this, and their fixes

## Rendering

- **Parallel renders hung for ever.** Chrome does not finish decoding images in background tabs, so `window.ready` never resolved.
  - Fix: render in one page with `Emulation.setFocusEmulationEnabled`, with a 15 s timeout on `window.ready`.
  - One page already renders about 40 frames/s, so `--workers` stays at 1.
- **`toDataURL` failed on `file://`.** A canvas that has drawn images from `file://` is tainted. The renderer serves the project over `http://127.0.0.1` instead.
- **Stale frames survived edits.** Resumable rendering skips frames that already exist. A frame render now clears `frames/` first, and `--resume` is only for interrupted runs.
- **A persistent Chrome profile grew to hundreds of MB.** It had downloaded on-device models and picked up system-installed extensions. The renderer now uses a throwaway profile in the temp folder, with extensions, background networking and component updates disabled.
- **The audio tail was cut or the video padded.** `-shortest` behaves inconsistently with a still-image stream plus audio. Encode with an explicit `-t <duration>`.

## Voice and captions

- **Acronyms read as words, and compound technical words split oddly.** Use `{display|speech}`: captions keep the correct spelling and the voice says the speech form, e.g. `{SNPs|S N Ps}` or `{SQL|sequel}`.
- **A word heard as a different real word.** When Whisper hears a different real word (for example "long" as "lung"), a person may too. Rephrase instead of overriding.
- **Terms Whisper never recognises.** Rare names can be pronounced correctly and still come out wrong in Whisper's text. If they sound right, accept them. Add them to `whisper_prompt` only for the final sync check, never for the per-line check, where a prompt hides real mispronunciations.
- **Pacing.** Fixed scene lengths felt slow. Deriving every event from the narration fixed it. For dense technical narration, speaking rate 1.0 felt rushed and 0.95 felt right.
- **The title flashed by.** With `lead` under about 3.5 s, the title is gone before it is read. The default is 4.0.
- **Information covered by the next chapter card.** The last item of a chapter was anchored near the end of its line, and the card arrived 1.15 s later. Give the next chapter's first line a larger `gap` so the scene holds.
- **The Windows console mangled UTF-8.** Python scripts reconfigure stdout to UTF-8. Set `PYTHONUTF8=1` for ad-hoc Python.
- **PowerShell JSON starts with a BOM.** The scripts strip `﻿` before parsing.

## Real figures and photos

- **A multi-panel figure was cropped by eye.** The crop included part of the neighbouring panel, and every overlay coordinate was off by a few hundred pixels.
  - Find the gutter with `image_tools.py gutters`.
  - Crop, then make a fresh grid: coordinates change with the crop.
- **"Brightest spot" detection found the wrong structure.** Read the target off the grid image by eye (`image_tools.py grid`) and write the coordinates into the scene.
- **Labels collided with callouts and with each other.** This was the most common defect. `--stills=auto` puts a still right after every anchor; check each one.

## Look

- **A busy scene showed through the chapter title.** The chapter card scrim needs about 0.8 opacity.
- **Saturated colours glared on the dark background.** Use the muted palette in `core.js`, and one colour per entity throughout.
- **Captions were too small at 38 px.** 56 px at 1080p stays readable when the video is shrunk to phone width (check at 480 px wide).

## Tools

- **An old Codex CLI was on PATH.** The Codex desktop app ships its own, newer CLI; see codex_images.md.
- **Cloud-synced folders.** A project inside a synced folder uploads thousands of frames. Keep projects outside them.
