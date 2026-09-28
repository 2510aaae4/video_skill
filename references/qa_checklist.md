# Acceptance checklist

## Automated

- [ ] **Pronunciation:** `whisper_check.py <project> --lines`. Every `CHECK` line is reviewed. Real mispronunciations are fixed; harmless number and hyphenation differences are noted.
- [ ] **Preview stills:** `render.mjs <project> --stills=auto` approved by the user (gate 2). No overlapping labels, nothing under the captions, no text below 18 px, and key information visible for at least 1 s.
- [ ] **Frames:** `render.mjs <project> --sheet`. Chapters appear in order, and there are no blank or black frames apart from the fade at the very start and end.
- [ ] **Final file:** `verify_sync.py <project>` shows PASS on all four lines:
  - at least 90% of caption words heard
  - median offset 0.15 s or less
  - −16 ± 1.5 LUFS
  - true peak −1 dBTP or lower

## Content

- [ ] Every sentence matches its source; numbers, names and units are exactly as written.
- [ ] Cautious wording stays cautious: nothing untested is presented as shown, and no association is presented as a cause.
- [ ] On-screen labels say the same as the narration (no stronger claims in labels).
- [ ] Real figures carry their source caption, and crops do not cut away information that changes their meaning.
- [ ] AI-generated imagery is labelled on screen and is used only for illustration, never for data.
- [ ] Nothing confidential appears beyond what the user approved: identifiers, unpublished data, names.
- [ ] Early drafts that might be passed around carry a "draft / not for distribution" mark.

## Delivery

- [ ] Deliver `out/<name>.mp4`, `out/<name>.srt` and `out/<name>_transcript.txt`.
- [ ] State what was checked, including the verify_sync numbers, and what was not.
- [ ] Keep the project in a permanent folder the user chose: `video.json`, `scene.html`, `js/` and `assets/` are enough to rebuild. Frames and audio can be regenerated.
