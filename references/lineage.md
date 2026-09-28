# Where this design came from

It was built and tested in September 2026, while making a 2 min 40 s narrated explainer of a research paper for personal viewing. The paper and its figures are not part of this repository.

## 1. A scan of published workflows

Blog posts and technical write-ups on making short videos with Claude (Opus 5.5) and code-based renderers pointed to the same pattern:
- The model does not generate video. It writes code that renders the video: HTML/Canvas, Remotion, Manim and similar.
- Plan a storyboard first, then build.
- Review your own output with a contact sheet of frames.
- Picture and sound share one timeline, because the model cannot hear the result.
- Frames must be deterministic so they can render in any order.
- ffmpeg settings decide the final quality: pixel format, explicit duration, loudness normalisation.

## 2. Three open-source projects, read but not run

Only ideas were taken; no code was copied.

- **video-shotcraft** (https://github.com/Vincentwei1021/video-shotcraft). Borrowed:
  - shot recipes: timeline push-in, step-by-step annotation, several lines converging, freeze-frame callouts, before/after
  - the caption legibility rule: at least 56 px at 1080p, checked at 480 px width
  - a final review checklist
- **OpenMontage** (https://github.com/calesthio/OpenMontage). Borrowed:
  - planning numbers: 120–150 words per minute, a visual change every 8–10 s, no more than three scenes of one kind in a row
  - narration annotated with sources
  - sign-off gates for script, preview and final
  - automated checks at transitions and per-segment loudness

  It is AGPL-3.0, so ideas only.
- **video-use** (https://github.com/browser-use/video-use). It edits camera footage and sends audio to a cloud transcription service, so it was not used. Only the idea of automated acceptance checks carried over.

## 3. Iteration

- **Test renders:** three rounds of a 30-second test, with feedback from the viewer:
  1. pacing driven by the narration instead of fixed scene lengths
  2. English narration plus a transcript
  3. a slower speaking rate (0.95)
- **Full video:** the full 2 min 40 s explainer was built next. The problems met along the way are in pitfalls.md.
- **Measured result:**
  - 338 of 349 words heard by Whisper
  - median caption offset 0.07 s
  - −15.8 LUFS
- **Template demo, as packaged here:**
  - 58 of 58 words heard
  - median offset 0.084 s
  - −16.1 LUFS
  - true peak −1.5 dBTP
  - 840 frames rendered in 20.6 s
