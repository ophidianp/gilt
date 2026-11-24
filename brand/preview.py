"""Render the gilt logo to a PNG for checking: python -I brand/preview.py out.png [mark]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from shapely.geometry import MultiPolygon
from gilt_logo import build, parts

g, (w, h) = build(mark_only="mark" in sys.argv[2:])
s = 12; img = Image.new("RGB", (int(w * s) + 40, int(h * s) + 40), "#111111"); d = ImageDraw.Draw(img)
for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
    d.polygon([(20 + x * s, 20 + y * s) for x, y in p.exterior.coords], fill="#E5B94E")
    for r in p.interiors: d.polygon([(20 + x * s, 20 + y * s) for x, y in r.coords], fill="#111111")
small = img.resize((img.width // 6, img.height // 6), Image.LANCZOS)
img.paste(small, (img.width - small.width - 10, img.height - small.height - 10))
img.save(sys.argv[1]); print("size", round(w, 1), round(h, 1), "parts", parts(g))
