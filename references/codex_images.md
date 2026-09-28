# Optional: AI background images with Codex

Use this for title backgrounds and illustrative scenes (anatomy, landscapes, abstract settings) where drawing by code would look poor. Diagrams, data and real figures stay in code or come from the source document.

## Before using it

- **The prompt goes to OpenAI.** Describe the picture in generic terms. Never paste unpublished text, data or figures into it.
- **It uses the user's ChatGPT image quota.** Ask first.
- **Label the image as AI-generated** whenever it is on screen (`aiNote`).

## How (Codex desktop app on Windows)

The desktop app ships a newer CLI than an older `codex` that may be on PATH. Use the bundled one, and check the login and the image feature first:

```powershell
$cx = (Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin\*\codex.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
& $cx --version
& $cx login status
& $cx features list | Select-String image
```

Then run it non-interactively in the project folder:

```powershell
& $cx exec --skip-git-repo-check -s workspace-write -C <project> -o <project>\codex_last_message.txt `
  "Use your image generation tool to create <generic description>, 16:9, no text or labels, dark and calm so white text reads on top. Save it as assets/bg.png."
```

One run produced a 1672×941 PNG. That is enough for a background, because text and overlays are drawn by code at full resolution on top.

## On screen

- Move the image only as a whole: a slow push-in or pan. A generated image cannot animate its parts.
- Add the meaning with code overlays: arrows, particles, counters, labels.
- Darken it where text sits (a gradient scrim), and keep the scene's colours consistent with the palette.
