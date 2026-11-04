"""Generates assets/icon.{png,icns,ico} from code. Run: python3 scripts/make-icons.py
Needs Pillow; .icns uses macOS `iconutil`, .ico uses ImageMagick `magick`."""
import os, shutil, subprocess, tempfile
from PIL import Image, ImageDraw

S = 4096  # draw large, downscale for anti-aliasing
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

# Diagonal indigo → cyan gradient (matches the in-app brand mark).
start, end = (79, 70, 229), (34, 211, 238)
grad = Image.new('RGB', (S, S))
px = grad.load()
for y in range(S):
    for x in range(0, S, 4):
        c = lerp(start, end, (x + y) / (2 * S))
        for dx in range(4):
            px[x + dx, y] = c

# macOS-style tile: 80% of the canvas, rounded corners.
m, r = int(S * 0.1), int(S * 0.18)
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([m, m, S - m, S - m], r, fill=255)
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
icon.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(icon)
white = (255, 255, 255, 255)
c = S / 2
# Play triangle.
t = S * 0.17
d.polygon([(c - t * 0.75, c - t), (c - t * 0.75, c + t), (c + t * 0.95, c)], fill=white)
# Inward chevrons either side ("squeeze" = optimise).
w, h, gap, lw = S * 0.07, S * 0.12, S * 0.30, int(S * 0.035)
for side in (-1, 1):
    x0 = c + side * gap
    tip = x0 - side * w
    d.line([(x0, c - h), (tip, c), (x0, c + h)], fill=white, width=lw, joint='curve')
    for p in [(x0, c - h), (tip, c), (x0, c + h)]:
        d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=white)

png = icon.resize((1024, 1024), Image.LANCZOS)
png.save(os.path.join(OUT, 'icon.png'))

with tempfile.TemporaryDirectory() as tmp:
    iconset = os.path.join(tmp, 'icon.iconset')
    os.mkdir(iconset)
    for size in (16, 32, 128, 256, 512):
        png.resize((size, size), Image.LANCZOS).save(f'{iconset}/icon_{size}x{size}.png')
        png.resize((size * 2, size * 2), Image.LANCZOS).save(f'{iconset}/icon_{size}x{size}@2x.png')
    if shutil.which('iconutil'):
        subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(OUT, 'icon.icns')], check=True)
subprocess.run(['magick', os.path.join(OUT, 'icon.png'), '-define', 'icon:auto-resize=256,128,64,48,32,16', os.path.join(OUT, 'icon.ico')], check=True)
print('wrote assets/icon.png, icon.icns, icon.ico')
