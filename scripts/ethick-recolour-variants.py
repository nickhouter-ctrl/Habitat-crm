#!/usr/bin/env python3
"""
Maak per kleurvariant een eigen productfoto.

De ETHICK-katalogus heeft maar één foto per model (in één kleur). Deze foto's
worden hier herkleurd naar de échte kleur van elke variant, op basis van de
kleurstalen-pagina ("colour swatch list", katalogpagina 140-141 = PDF 142-143).

Techniek: de basisfoto levert vorm + textuur (luminantie); die wordt via een
gradient-map omgezet naar de kleur van het staal. Achtergrond blijft wit.

In : /tmp/ethick/final/<baseSKU>.jpg   (van ethick-extract-images.py)
Uit: /tmp/ethick/variants/<fullSKU>.jpg

Vereist: PyMuPDF (fitz) + Pillow.
"""
import colorsys
import io
import os

import fitz
from PIL import Image, ImageChops, ImageDraw

PDF = os.path.expanduser("~/Downloads/ETHICK_KATALOG_ETH.26.1_redukcja_www.pdf")
SRC = "/tmp/ethick/final"
OUT = "/tmp/ethick/variants"

# kleurcode -> (PDF-pagina, rij, kolom) op de kleurstalen-pagina's
SWATCH = {
    "440R": (142, 0, 0), "101GR": (142, 0, 1), "102GR": (142, 0, 2),
    "231R": (142, 0, 3), "243R": (142, 1, 0), "220R": (142, 1, 1),
    "106GR": (142, 1, 4), "107GR": (143, 0, 1), "109GR": (143, 0, 2),
    "460GR": (143, 1, 0), "467R": (143, 1, 4),
}

# (fullSKU, baseSKU, kleurcode)
POTS = [
    ("TUO40-101GR", "TUO40", "101GR"), ("TUO40M-101GR", "TUO40M", "101GR"),
    ("TUO48B-101GR", "TUO48B", "101GR"), ("TUO48M-101GR", "TUO48M", "101GR"),
    ("TUO60M-101GR", "TUO60M", "101GR"), ("TU30H-101GR", "TU30H", "101GR"),
    ("TEP48B-220R", "TEP48B", "220R"), ("TEP48B-231R", "TEP48B", "231R"),
    ("TEP48B-101GR", "TEP48B", "101GR"), ("TEP38M-101GR", "TEP38M", "101GR"),
    ("TEP38M-231R", "TEP38M", "231R"), ("TEP38M-220R", "TEP38M", "220R"),
    ("TEP30T-101GR", "TEP30T", "101GR"), ("TEP30T-231R", "TEP30T", "231R"),
    ("TEP30T-220R", "TEP30T", "220R"), ("TEP46H-101GR", "TEP46H", "101GR"),
    ("TEP46H-231R", "TEP46H", "231R"), ("TEP46H-220R", "TEP46H", "220R"),
    ("TEP38M-107GR", "TEP38M", "107GR"),
    ("TBO40-231R", "TBO40", "231R"), ("TBO48-231R", "TBO48", "231R"),
    ("TBO40-102GR", "TBO40", "102GR"),
    ("TDE40-243R", "TDE40", "243R"), ("TDE48-243R", "TDE48", "243R"),
    ("TDE60-243R", "TDE60", "243R"), ("TDEO40-243R", "TDEO40", "243R"),
    ("TDE40-106GR", "TDE40", "106GR"), ("TDE48-101GR", "TDE48", "101GR"),
    ("TT60-101GR", "TT60", "101GR"), ("TT80-460GR", "TT80", "460GR"),
    ("TBL120-440R", "TBL120", "440R"),
    ("TMOS40-101GR", "TMOS40", "101GR"), ("TMOS40-440R", "TMOS40", "440R"),
    ("TMOS48-101GR", "TMOS48", "101GR"), ("TMOS48-440R", "TMOS48", "440R"),
    ("TMOS60-101GR", "TMOS60", "101GR"), ("TMOS60-440R", "TMOS60", "440R"),
    ("TMBO40-101GR", "TMBO40", "101GR"), ("TMBO40-440R", "TMBO40", "440R"),
    ("TMBO60-101GR", "TMBO60", "101GR"), ("TMBO60-440R", "TMBO60", "440R"),
    ("TMBO80-101GR", "TMBO80", "101GR"), ("TMBO80-440R", "TMBO80", "440R"),
    ("TGAO1S-101GR", "TGAO1S", "101GR"),
    ("TCR30-107GR", "TCR30", "107GR"), ("TCR40-467R", "TCR40", "467R"),
    ("TCR40H-101GR", "TCR40H", "101GR"), ("TCR48-109GR", "TCR48", "109GR"),
    ("TCR48H-101GR", "TCR48H", "101GR"),
    ("TCS40-107GR", "TCS40", "107GR"), ("TCS40H-109GR", "TCS40H", "109GR"),
    ("TCS48-101GR", "TCS48", "101GR"), ("TCC80-107GR", "TCC80", "107GR"),
    ("TCB40-467R", "TCB40", "467R"), ("TCB40H-107GR", "TCB40H", "107GR"),
    ("TCB48-101GR", "TCB48", "101GR"),
    ("TCA40-243R", "TCA40", "243R"), ("TCA40H-243R", "TCA40H", "243R"),
    ("TCA60-109GR", "TCA60", "109GR"), ("TCA80-243R", "TCA80", "243R"),
    ("TR40-243R", "TR40", "243R"), ("TR60-243R", "TR60", "243R"),
    ("TR80-243R", "TR80", "243R"),
]

# witte pot op witte achtergrond -> niet herkleuren (masker faalt), basisfoto houden
SKIP_RECOLOUR = {"TBL120-440R"}


def sample_swatches():
    """Mediaan-kleur per staal uit de kleurstalen-pagina's."""
    doc = fitz.open(PDF)
    pages = {}
    finish = {}
    for code, (pn, row, col) in SWATCH.items():
        if pn not in pages:
            pix = doc[pn - 1].get_pixmap(dpi=150)
            pages[pn] = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        img = pages[pn]
        W, H = img.size
        cw = W / 5
        x0, x1 = int(col * cw + 0.12 * cw), int(col * cw + 0.92 * cw)
        yt, yb = (0.09, 0.27) if row == 0 else (0.55, 0.73)
        px = list(img.crop((x0, int(yt * H), x1, int(yb * H))).getdata())

        def med(ch):
            return sorted(p[ch] for p in px)[len(px) // 2]

        finish[code] = (med(0), med(1), med(2))
    return finish


def ramp(F):
    """Schaduw/mid/highlight-kleur afgeleid van de staalkleur (behoudt tint)."""
    h, s, v = colorsys.rgb_to_hsv(*[x / 255 for x in F])

    def rgb(hh, ss, vv):
        return tuple(int(max(0, min(255, x * 255))) for x in colorsys.hsv_to_rgb(hh, ss, vv))

    return (rgb(h, min(1, s * 1.05), v * 0.55),
            rgb(h, s, v),
            rgb(h, s * 0.78, min(1, v * 1.5 + 0.15)))


def luts(rmp, lo, hi):
    sh, mid, hg = rmp
    out = [[], [], []]
    for i in range(256):
        t = max(0.0, min(1.0, (i - lo) / (hi - lo) if hi > lo else 0))
        if t < 0.5:
            u = t / 0.5
            c = [sh[k] + (mid[k] - sh[k]) * u for k in range(3)]
        else:
            u = (t - 0.5) / 0.5
            c = [mid[k] + (hg[k] - mid[k]) * u for k in range(3)]
        for k in range(3):
            out[k].append(int(c[k]))
    return out


def pot_mask(base):
    """Masker: pot = 255, witte achtergrond = 0 (via flood fill vanuit de hoeken)."""
    work = base.copy()
    for c in [(0, 0), (work.width - 1, 0), (0, work.height - 1), (work.width - 1, work.height - 1)]:
        ImageDraw.floodfill(work, c, (255, 0, 255), thresh=32)
    r, g, b = work.split()
    bg = ImageChops.multiply(ImageChops.multiply(
        r.point(lambda v: 255 if v > 250 else 0),
        g.point(lambda v: 255 if v < 6 else 0)),
        b.point(lambda v: 255 if v > 250 else 0))
    return ImageChops.invert(bg)


def recolour(base, F):
    base = base.convert("RGB")
    mask = pot_mask(base)
    L = base.convert("L")
    md, lp = mask.load(), L.load()
    lums = sorted(lp[x, y] for y in range(0, base.height, 3)
                  for x in range(0, base.width, 3) if md[x, y] > 128)
    lo = lums[int(len(lums) * 0.04)]
    hi = lums[int(len(lums) * 0.97)]
    lr, lg, lb = luts(ramp(F), lo, hi)
    rec = Image.merge("RGB", (L.point(lr), L.point(lg), L.point(lb)))
    out = Image.new("RGB", base.size, (255, 255, 255))
    out.paste(rec, (0, 0), mask)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    finish = sample_swatches()
    for full, base, color in POTS:
        src = Image.open(f"{SRC}/{base}.jpg")
        img = src.convert("RGB") if full in SKIP_RECOLOUR else recolour(src, finish[color])
        img.save(f"{OUT}/{full}.jpg", quality=90)
    print(f"{len(POTS)} kleurvarianten geschreven naar {OUT}/")


if __name__ == "__main__":
    main()
