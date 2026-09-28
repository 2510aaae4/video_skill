"""Image helpers for putting overlays on real figures and photos (Pillow).

  python image_tools.py grid <image> [--step 100]          write <image>_grid.png with a labelled pixel grid
  python image_tools.py gutters <image> [--axis x|y]       print uniform bands (likely borders between panels)
  python image_tools.py crop <image> <x0> <y0> <x1> <y1> <out>

Read coordinates off the grid image instead of guessing: camera focus points, highlight rings
and crop boxes all use the image's own pixel coordinates. After cropping, make a new grid:
coordinates change with the crop.
"""
import sys

from PIL import Image, ImageDraw, ImageFont, ImageStat

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def grid(path, step=100):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('arial.ttf', max(12, step // 5))
    except OSError:
        font = ImageFont.load_default()
    label = dict(fill=(255, 255, 0), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    size = font.size if hasattr(font, 'size') else 12
    xm, ym = (w // 2) // step * step, (h // 2) // step * step  # a second set of labels mid-image
    for x in range(0, w, step):
        major = x % (step * 5) == 0
        d.line([(x, 0), (x, h)], fill=(255, 60, 60) if major else (255, 150, 150), width=2 if major else 1)
        d.text((x + 3, 3), f'x{x}', **label)
        if x:
            d.text((x + 3, ym + 3), f'x{x}', **label)
    for y in range(step, h, step):
        major = y % (step * 5) == 0
        d.line([(0, y), (w, y)], fill=(60, 160, 255) if major else (150, 200, 255), width=2 if major else 1)
        d.text((3, y + size + 6), f'y{y}', **label)
        d.text((xm + 3, y + size + 6), f'y{y}', **label)
    out = path.rsplit('.', 1)[0] + '_grid.png'
    im.save(out)
    print(f'{out}  ({w}x{h}, lines every {step}px)')


def gutters(path, axis='x', tol=4.0, min_run=3):
    im = Image.open(path).convert('L')
    w, h = im.size
    n = w if axis == 'x' else h
    runs, start, level = [], None, 0.0
    for i in range(n + 1):
        flat = False
        if i < n:
            st = ImageStat.Stat(im.crop((i, 0, i + 1, h) if axis == 'x' else (0, i, w, i + 1)))
            flat = st.stddev[0] < tol
        if flat and start is None:
            start, level = i, st.mean[0]
        elif not flat and start is not None:
            if i - start >= min_run:
                runs.append((start, i - 1, level))
            start = None
    print(f'{path}: {w}x{h}, uniform {"columns" if axis == "x" else "rows"} (runs of >= {min_run}px):')
    for a, b, lv in runs:
        print(f'  {axis} {a}-{b} ({b - a + 1}px, grey level {lv:.0f})')
    if not runs:
        print('  none found; try --axis y or a larger tolerance')


def crop(path, x0, y0, x1, y1, out):
    Image.open(path).crop((int(x0), int(y0), int(x1), int(y1))).save(out)
    print(f'{out}  ({int(x1) - int(x0)}x{int(y1) - int(y0)})')


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)
    opt = lambda name, default: a[a.index(name) + 1] if name in a else default
    if a[0] == 'grid':
        grid(a[1], int(opt('--step', 100)))
    elif a[0] == 'gutters':
        gutters(a[1], opt('--axis', 'x'))
    elif a[0] == 'crop' and len(a) == 7:
        crop(*a[1:])
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
