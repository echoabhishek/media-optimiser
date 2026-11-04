"""Generates assets/icon.{png,icns,ico} from code. Run: python3 scripts/make-icons.py
Needs Pillow; .icns uses macOS `iconutil`, .ico uses ImageMagick `magick`."""
import os, shutil, subprocess, tempfile
from PIL import Image, ImageDraw

S = 4096  # draw large, downscale for anti-aliasing
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')

# macOS-style tile: 80% of the canvas, rounded corners, white with a hairline.
m, r = int(S * 0.1), int(S * 0.18)
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(icon)
d.rounded_rectangle([m, m, S - m, S - m], r, fill=(255, 255, 255, 255),
                    outline=(227, 231, 239, 255), width=int(S * 0.006))

# Studio mark: one shape per media type (video, audio, image), laid out on
# an 88-unit grid inside the tile.
k = (S - 2 * m) / 88
def box(x0, y0, x1, y1):
    return [m + x0 * k, m + y0 * k, m + x1 * k, m + y1 * k]
d.rounded_rectangle(box(16, 16, 50, 50), 10 * k, fill=(229, 72, 77, 255))
d.ellipse(box(44, 22, 72, 50), fill=(123, 97, 255, 255))
d.rounded_rectangle(box(34, 50, 64, 72), 8 * k, fill=(43, 168, 74, 255))

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
