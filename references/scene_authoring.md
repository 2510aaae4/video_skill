# Writing scenes

## Contract with scene.html

For each frame, the compositor does this, in order:
1. `backdrop(t)`
2. `sceneTitle(t, a)`, until the first chapter card
3. `CHAPTER_SCENES[n](t, a)` for each chapter, cross-fading on the card times
4. `sceneEnd(t, a)`
5. `chapterOverlay(t)`, then `karaoke(t)`, then the fade from and to black

`a` is the scene's opacity (0–1). Apply it to everything you draw: set `ctx.globalAlpha = a` inside `save`/`restore`, or pass `alpha: a` to the helpers.

An optional `async function setupScenes()` runs once after the assets load. Use it for offscreen canvases or precomputed layouts; never for state that changes over time.

## Globals

| name | meaning |
|---|---|
| `t` | time in seconds (the scene function's argument) |
| `E` | events: anchors, `<id>_start/_end`, `ch<n>`, `title_in`, `subtitle_in`, `end_title`, `fade_out` |
| `CUES` | all of cues.json: `duration`, `chapters`, `captions`, `constants`, `title` |
| `IMG` | preloaded images by name (`assets` in video.json) |
| `W`, `H` | 1920, 1080 |
| `ctx`, `cv` | 2D context and canvas |
| `C` | palette: `ink`, `muted`, `dim`, `amber`, `coral`, `teal`, `cyan`, `edge`, `green`, `red`, `series[0..4]` |

## Timing helpers

| helper | returns |
|---|---|
| `prog(t, a, b)` | 0 → 1 between a and b, clamped |
| `easeOut(u)`, `easeInOut(u)`, `easeOutBack(u)` | eased value. `easeOutBack` overshoots: use it with `scale` for pop-ins. |
| `win(t, a, b, fadeIn, fadeOut)` | opacity of something visible from a to b |
| `pulse(t, a, dur)` | 0 → 1 → 0 |
| `lerp`, `clamp`, `mix(c1, c2, u)`, `qbez(P, u)`, `mulberry32(seed)` | math and colour |

The usual pattern, which pops in as the word "voice" is spoken:

```js
const up = easeOutBack(prog(t, E.voice - 0.05, E.voice + 0.4));
```

## Drawing helpers

| helper | what it draws |
|---|---|
| `drawRich(text, x, y, {size, weight, color, align, alpha, spacing})` | Text with `*italic*` and `**bold**`. Returns the width. |
| `pill(text, x, y, {size, bg, fg, alpha, scale, align})` | Rounded label. |
| `panel(x, y, w, h, {fill, stroke, radius, alpha})` | Box. |
| `arrow(x0, y0, x1, y1, {color, width, head, progress, alpha, dash})` | Straight arrow. `progress` 0..1 grows it. |
| `highlight(x, y, r, {color, alpha, t, width, rx})` | Pulsing ring, or an ellipse with `rx`. |
| `photoCard(img, card, cam, {alpha})` | Image in a rounded card. `cam = {fx, fy, z}` puts image pixel (fx, fy) at the card centre at zoom z, where 1 means the image just covers the card. Returns `map(px, py) → [x, y, scale]`, for overlays in the image's own coordinates. |
| `aiNote(alpha, text)` | Corner note while AI-generated imagery is visible. |
| `backdrop(t)` | Default dark background with drifting particles. |

## Layout

- Safe area is x 120–1800, y 120–860. The caption box takes about y 925–1025.
- After its card, a chapter keeps a small label at the top left (y ≈ 112). Put scene headings at y ≥ 200.
- Sizes:
  - headings: 40–48 px
  - labels: 20–28 px
  - absolute minimum: 18 px
- Dark background: use the palette's muted tones. Saturated primaries glare.

## Recipes

### Reveal items on their words

```js
const ITEMS = [['stepA', 'First item'], ['stepB', 'Second item'], ['stepC', 'Third item']];
ITEMS.forEach(([key, text], k) => {
  const up = easeOutBack(prog(t, E[key] - 0.1, E[key] + 0.35));
  if (up <= 0) return;
  const y = 400 + k * 110;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(540, y); ctx.scale(up, up);
  ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawRich(String(k + 1), 540, y + 10, { size: 28, weight: 700, color: '#071320', align: 'center', alpha: a * clamp(up) });
  drawRich(text, 590, y + 11, { size: 32, weight: 600, alpha: a * clamp(up) });
});
```

### Timeline with events

Draw the axis as it is introduced: `lerp(x0, x1, easeInOut(prog(t, E.axis, E.axis + 0.9)))`. Then pop in one marker per anchored word, and bracket spans with a line that grows from its middle.

### Zoom into a region of a photo or figure and ring it

```js
const CARD = { x: 450, y: 170, w: 1020, h: 660 }, SPOT = [620, 410]; // SPOT read off image_tools.py grid
const z = easeInOut(prog(t, E.focus - 0.2, E.focus + 1.1));
const map = photoCard(IMG.fig, CARD, { fx: lerp(IMG.fig.width / 2, SPOT[0], z), fy: lerp(IMG.fig.height / 2, SPOT[1], z), z: lerp(1, 2.8, z) }, { alpha: a });
if (map) {
  const ring = easeOut(prog(t, E.focus + 0.8, E.focus + 1.2));
  const [x, y, s] = map(...SPOT);
  highlight(x, y, 52 * s, { alpha: a * ring, t });
  pill('what the ring shows', x + 60 * s + 24, y, { size: 22, bg: '#ffd08a', alpha: a * ring });
}
drawRich('Figure 2 · source caption', CARD.x, CARD.y - 16, { size: 18, color: C.dim, alpha: a });
```

Always caption real figures with their source, and keep the camera inside the image (`photoCard` clamps it).

### Diagram built step by step

Place `panel` boxes on their anchors. Connect them with `arrow(..., {progress})` once both ends are visible: start the arrow at the later of the two anchors.

### Several paths converging on one node

```js
const NODE = [1100, 500];
[[300, 300], [300, 700]].forEach((p, i) => {
  const u = easeInOut(prog(t, E.converge + i * 0.2, E.converge + i * 0.2 + 1.0));
  if (u <= 0) return;
  const P = [p, [(p[0] + NODE[0]) / 2, p[1]], NODE];
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.series[i]; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(...p);
  for (let k = 1; k <= 40 * u; k++) ctx.lineTo(...qbez(P, k / 40));
  ctx.stroke(); ctx.restore();
});
```

### Protein, gene or timeline bars from real coordinates

Scale the source coordinates to pixels: `x = x0 + pos / length * width`. Draw domains as rounded rects, and put mutation markers at their exact positions with a `pill` label. Reveal one row per anchored word, and keep the numbering exactly as in the source.

### Hybrid scene on a still illustration

Move the illustration only as a whole: a slow push-in with `lerp` on scale, or a pan. Put moving elements on top as code: particles, arrows, counters. Show `aiNote(a)` while it is visible.

### Take-home card

`panel` in the centre, a heading, and 2–4 numbered items on their anchors (see the first recipe).

## Debugging

- `render.mjs <project> --stills=12.5,13.2` renders single moments. The time is stamped in the corner.
- A script error in `scene.html` or `js/*.js` is reported by `render.mjs` with its file and line.
- To inspect by hand, serve the project with any static server, open `scene.html`, and call `renderFrame(t)` in the console.
