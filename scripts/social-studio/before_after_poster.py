#!/usr/bin/env python3
"""
Voor/na-poster in de huisstijl (crème, officieel logo bovenaan, tweekleurige kop,
ANTES/DESPUÉS naast elkaar, rond inzetje met een ECHTE foto van een buigende plaat).

  python3 scripts/social-studio/before_after_poster.py before.png after.png bend.jpg out.jpg \
      --hook "¿Dormitorio sin carácter?" --line1 "Mismo dormitorio." --line2 "Un gran cambio." \
      --en "Same bedroom. A big difference." --badge "Se curva · It bends"
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO = os.path.join(ROOT, "public", "brand", "flex-surfaces-logo-sub-dark.png")
F = "/System/Library/Fonts/Avenir Next.ttc"
CREAM, DARK, CARAMEL, MUTED = (248, 241, 231), (36, 26, 20), (183, 118, 58), (92, 78, 66)


def font(size, idx):
    return ImageFont.truetype(F, size, index=idx)


def centered(d, y, text, f, fill, W):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)


def fit(d, text, idx, size, maxw):
    while size > 20 and d.textlength(text, font=font(size, idx)) > maxw:
        size -= 2
    return font(size, idx)


def rounded(im, r):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255)
    out = im.convert("RGBA"); out.putalpha(m); return out


def pill(canvas, cx, cy, text, f, bg, fg):
    d = ImageDraw.Draw(canvas)
    w = d.textlength(text, font=f); h = f.size * 1.5
    d.rounded_rectangle((cx - w / 2 - 26, cy - h / 2, cx + w / 2 + 26, cy + h / 2), h / 2, fill=bg)
    d.text((cx - w / 2, cy - f.size * 0.62), text, font=f, fill=fg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("before"); ap.add_argument("after"); ap.add_argument("bend"); ap.add_argument("out")
    ap.add_argument("--hook", required=True); ap.add_argument("--line1", required=True); ap.add_argument("--line2", required=True)
    ap.add_argument("--en", required=True); ap.add_argument("--badge", default="Se curva · It bends")
    ap.add_argument("--before-label", default="ANTES"); ap.add_argument("--after-label", default="DESPUÉS")
    ap.add_argument("--footer", default="Piedra flexible en Jávea · Flexible stone in Jávea")
    ap.add_argument("--url", default="habitat-one.com/showroom")
    a = ap.parse_args()
    W, H = 1080, 1350
    c = Image.new("RGBA", (W, H), CREAM + (255,)); d = ImageDraw.Draw(c)
    logo = Image.open(LOGO).convert("RGBA"); lw = 330; logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    c.alpha_composite(logo, ((W - lw) // 2, 34)); y = 34 + logo.height + 22
    centered(d, y, a.hook, fit(d, a.hook, 5, 40, 900), DARK, W); y += 56
    f1 = fit(d, a.line1, 0, 92, 980); centered(d, y, a.line1, f1, DARK, W); y += int(f1.size * 1.08)
    f2 = fit(d, a.line2, 0, 92, 980); centered(d, y, a.line2, f2, CARAMEL, W); y += int(f2.size * 1.22)
    centered(d, y, a.en, fit(d, a.en, 5, 32, 900), MUTED, W); y += 58
    # foto's
    ph = H - y - 150; pw = int(ph * 3 / 4); gap = 18
    if 2 * pw + gap > W - 60:
        pw = (W - 60 - gap) // 2; ph = int(pw * 4 / 3)
    x0 = (W - (2 * pw + gap)) // 2
    for i, (p, label) in enumerate(((a.before, a.before_label), (a.after, a.after_label))):
        im = ImageOps.fit(Image.open(p).convert("RGB"), (pw, ph), Image.LANCZOS)
        c.alpha_composite(rounded(im, 18), (x0 + i * (pw + gap), y))
        pill(c, x0 + i * (pw + gap) + pw // 2, y + ph - 44, label, font(30, 2), CARAMEL, (255, 255, 255))
    # rond inzetje: echte foto van een buigende plaat
    D = 250; bend = ImageOps.fit(Image.open(a.bend).convert("RGB"), (D, D), Image.LANCZOS)
    m = Image.new("L", (D, D), 0); ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), fill=255)
    ring = Image.new("RGBA", (D + 16, D + 16), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse((0, 0, D + 15, D + 15), fill=(255, 255, 255, 255))
    sh = Image.new("RGBA", (D + 60, D + 60), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((22, 26, D + 38, D + 42), fill=(0, 0, 0, 90)); sh = sh.filter(ImageFilter.GaussianBlur(10))
    cx, cy = x0 + 2 * pw + gap - D // 2 - 22, y + ph - D // 2 - 110
    c.alpha_composite(sh, (cx - D // 2 - 30, cy - D // 2 - 30)); c.alpha_composite(ring, (cx - D // 2 - 8, cy - D // 2 - 8))
    bi = bend.convert("RGBA"); bi.putalpha(m); c.alpha_composite(bi, (cx - D // 2, cy - D // 2))
    pill(c, cx, cy + D // 2 + 6, a.badge, font(24, 2), (255, 255, 255), DARK)
    y += ph + 30
    d = ImageDraw.Draw(c)
    centered(d, y, a.footer, fit(d, a.footer, 5, 30, 980), DARK, W); y += 46
    centered(d, y, a.url, font(36, 2), DARK, W)
    c.convert("RGB").save(a.out, quality=92)
    print("klaar:", a.out)


if __name__ == "__main__":
    main()
