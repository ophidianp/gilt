"""Writes the gilt logo files from gilt_logo.py, the same set as the other Mouse 33-family sites:
brand/out/logo.svg (+ white), site/favicon.svg and site/apple-touch-icon.png (the g on a gold
tile), site/og.png (the wordmark on the dark page), brand/out/icon-1024.png (the app icon,
fed to `tauri icon`), brand/out/logo.json, and stamps the wordmark into the <symbol id="gilt">
of every site page.

    python -I brand/make_assets.py
"""
import os, re, sys, glob, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import MultiPolygon
from gilt_logo import build, to_path, parts

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out"); SITE = os.path.join(HERE, "..", "site")
ACC, ACC_LIGHT, INK, DARK = "#E5B94E", "#9A6B0C", "#111111", "#111111"
word, (ww, wh) = build()
mark, (mw, mh) = build(mark_only=True)
D_WORD, D_MARK = to_path(word), to_path(mark)
pad = 0.6
VB = f"{-pad} {-pad} {ww + 2 * pad:.2f} {wh + 2 * pad:.2f}"
MARK_FILL = 0.8   # the g spans this much of the tile's width


def svg_word(fill=ACC_LIGHT):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">'
            f'<title>gilt</title><path fill="{fill}" d="{D_WORD}"/></svg>\n')


def svg_icon():
    s = 32 * MARK_FILL / max(mw, mh); ox, oy = (32 - mw * s) / 2, (32 - mh * s) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="{ACC}"/>'
            f'<path fill="{INK}" transform="translate({ox:.2f} {oy:.2f}) scale({s:.4f})" d="{D_MARK}"/></svg>\n')


def raster(g, scale, offset, img, color, hole):
    d = ImageDraw.Draw(img)
    for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        d.polygon([(offset[0] + x * scale, offset[1] + y * scale) for x, y in p.exterior.coords], fill=color)
        for ring in p.interiors:
            d.polygon([(offset[0] + x * scale, offset[1] + y * scale) for x, y in ring.coords], fill=hole)


def tile(n, ss=4, rounded=False):
    """the g on a gold tile; rounded (with transparent corners) for the app icon"""
    N = n * ss
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0) if rounded else ACC)
    if rounded:
        ImageDraw.Draw(img).rounded_rectangle((0, 0, N - 1, N - 1), radius=N * 8 / 32, fill=ACC)
    s = N * MARK_FILL / max(mw, mh)
    raster(mark, s, ((N - mw * s) / 2, (N - mh * s) / 2), img, INK, ACC)
    return img.resize((n, n), Image.LANCZOS)


def og(ss=2):
    W, H = 1200 * ss, 630 * ss; img = Image.new("RGB", (W, H), DARK)
    s = 640 * ss / ww
    raster(word, s, (110 * ss, 96 * ss), img, ACC, DARK)
    d = ImageDraw.Draw(img)
    try:
        f1 = ImageFont.truetype("C:/Windows/Fonts/seguisb.ttf", 44 * ss)
        f2 = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 22 * ss)
        d.text((110 * ss, 448 * ss), "Trade the real market. With pretend money.", font=f1, fill="#F2EFE6")
        d.text((112 * ss, 516 * ss), "PAPER TRADING ON LIVE PRICES · WINDOWS", font=f2, fill="#8C887D")
    except OSError:
        pass
    return img.resize((1200, 630), Image.LANCZOS)


def stamp_pages():
    sym = f'<symbol id="gilt" viewBox="{VB}"><path fill="currentColor" d="{D_WORD}"/></symbol>'
    for page in glob.glob(os.path.join(SITE, "*.html")):
        src = open(page, encoding="utf-8").read()
        out = re.sub(r'<symbol id="gilt"[^>]*>.*?</symbol>', lambda m: sym, src, flags=re.S)
        if out != src:
            open(page, "w", encoding="utf-8", newline="\n").write(out)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "logo.svg"), "w").write(svg_word())
    open(os.path.join(OUT, "logo-gold.svg"), "w").write(svg_word(ACC))
    open(os.path.join(OUT, "logo-white.svg"), "w").write(svg_word("#ffffff"))
    open(os.path.join(OUT, "icon.svg"), "w").write(svg_icon())
    tile(1024, ss=2, rounded=True).save(os.path.join(OUT, "icon-1024.png"))
    json.dump({"word": D_WORD, "viewBox": VB, "mark": D_MARK, "aspect": round((ww + 2 * pad) / (wh + 2 * pad), 4)},
              open(os.path.join(OUT, "logo.json"), "w"))
    APP = os.path.join(HERE, "..", "app", "src")
    if os.path.isdir(APP):   # the title bar's wordmark
        json.dump({"word": D_WORD, "viewBox": VB}, open(os.path.join(APP, "logo.json"), "w"))
    if os.path.isdir(SITE):
        open(os.path.join(SITE, "favicon.svg"), "w").write(svg_icon())
        tile(180).convert("RGB").save(os.path.join(SITE, "apple-touch-icon.png"))
        og().save(os.path.join(SITE, "og.png"), optimize=True)
        stamp_pages()
    print("word", round(ww, 2), round(wh, 2), "viewBox", VB, "parts", parts(word), len(D_WORD), "chars")
