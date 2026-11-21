#!/usr/bin/env python3
"""Overlays voor "jullie vragen, wij antwoorden"-reels (stijl zoals Nick leuk vindt: @dizzplace):
een reactie-ballon (alsof een volger het vraagt), een strak infokaartje met nummering, en een
kort antwoord. Alles als transparante PNG (1080 breed) voor reel.py --overlays.

  python3 scripts/social-studio/faq_cards.py spec.json outdir/
  spec.json: {"total": 4, "items": [
     {"q": "¿Se puede poner sobre azulejos?", "label": "SOPORTE", "card": "layers",
      "layers": ["Pared", "Azulejo viejo", "Adhesivo", "Panel"], "a": "Sí, si están bien adheridos"},
     {"q": "...", "label": "FORMATOS", "card": "sizes", "a": "..."},
     {"q": "...", "label": "FORMA", "card": "curve", "a": "..."},
     {"q": "...", "label": "SHOWROOM", "card": "pin", "place": "Jávea · Xàbia", "a": "..."}]}
Schrijft per item i: bubble{i}.png, card{i}.png, answer{i}.png. Alleen feiten van flex-surfaces.com.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W = 1080
CREAM = (244, 238, 228, 255)
INK = (34, 28, 24, 255)
TERRA = (182, 85, 45, 255)
CARD_BG = (28, 24, 21, 232)
LINE = (255, 255, 255, 60)
FONT = "/System/Library/Fonts/Avenir Next.ttc"


def font(size, bold=False):
    # Avenir Next.ttc: index 0 = Bold, 2 = Demi Bold, 7 = Regular (macOS)
    try:
        return ImageFont.truetype(FONT, size, index=2 if bold else 7)
    except Exception:
        return ImageFont.load_default()


def shadowed(im, blur=14, alpha=0.45):
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(im.split()[3].point(lambda a: int(a * alpha)))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(sh, (0, 6))
    out.alpha_composite(im)
    return out


def bubble(text, path):
    f = font(46, True)
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = d0.textlength(text, font=f)
    bw, bh = int(tw + 70), 96
    im = Image.new("RGBA", (W, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0 = 70
    # avatar
    d.ellipse((x0, 32, x0 + 72, 104), fill=(214, 204, 190, 255))
    d.ellipse((x0 + 24, 44, x0 + 48, 68), fill=(250, 246, 240, 255))
    d.pieslice((x0 + 12, 70, x0 + 60, 118), 180, 360, fill=(250, 246, 240, 255))
    bx = x0 + 92
    bw = min(bw, W - bx - 40)
    d.rounded_rectangle((bx, 20, bx + bw, 20 + bh), radius=34, fill=(255, 255, 255, 250))
    d.text((bx + 35, 20 + bh / 2), text, font=f, fill=INK, anchor="lm")
    # hartje rechts
    hx = bx + bw + 18
    if hx + 30 < W:
        d.text((hx, 20 + bh / 2), "♥", font=font(40, True), fill=TERRA, anchor="lm")
    shadowed(im).save(path)


def card_base(idx, total, label, h=540):
    im = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, x1 = 70, W - 70
    d.rounded_rectangle((x0, 0, x1, h - 10), radius=30, fill=CARD_BG, outline=(255, 255, 255, 40), width=2)
    # kop: 01 / 04  LABEL ............ FLEX-SURFACES
    d.rounded_rectangle((x0 + 30, 28, x0 + 92, 72), radius=10, fill=CREAM)
    d.text((x0 + 61, 50), f"{idx:02d}", font=font(30, True), fill=INK, anchor="mm")
    d.text((x0 + 108, 50), f"/ {total:02d}   {label}", font=font(28, True), fill=CREAM, anchor="lm")
    d.text((x1 - 30, 50), "FLEX-SURFACES", font=font(24), fill=(244, 238, 228, 170), anchor="rm")
    d.line((x0 + 30, 96, x1 - 30, 96), fill=LINE, width=2)
    return im, d, x0, x1


def card_layers(it, idx, total, path):
    im, d, x0, x1 = card_base(idx, total, it["label"])
    layers = it["layers"]
    cols = [(200, 196, 188, 255), (236, 240, 244, 255), (214, 190, 150, 255), (226, 208, 178, 255)]
    bx, by, sw, sh, off = x0 + 70, 150, 210, 300, 46
    for i, _ in enumerate(layers):
        x, y = bx + i * off, by + i * 14
        d.polygon([(x, y), (x + sw, y + 30), (x + sw, y + sh + 30), (x, y + sh)], fill=cols[i % len(cols)], outline=(0, 0, 0, 90))
        if i == 1:  # tegelvoegen
            for k in range(1, 6):
                yy = y + k * sh / 6
                d.line((x, yy, x + sw, yy + 30), fill=(150, 160, 170, 255), width=2)
        if i == len(layers) - 1:  # paneel met textuur
            for k in range(14):
                yy = y + 20 + k * 20
                d.line((x + 12, yy, x + sw - 14, yy + 28), fill=(196, 172, 136, 255), width=2)
    lx = x0 + 520
    for i, name in enumerate(layers):
        y = 170 + i * 78
        bold = i == len(layers) - 1
        d.ellipse((lx, y - 22, lx + 44, y + 22), outline=CREAM, width=3, fill=CREAM if bold else None)
        d.text((lx + 22, y), str(i + 1), font=font(26, True), fill=INK if bold else CREAM, anchor="mm")
        d.text((lx + 64, y), name, font=font(34, bold), fill=CREAM, anchor="lm")
    shadowed(im).save(path)


def card_sizes(it, idx, total, path):
    im, d, x0, x1 = card_base(idx, total, it["label"])
    sizes = [(3000, 1200), (1200, 600), (900, 600)]
    scale = 0.1            # 3000 mm -> 300 px (staand getekend)
    base = 440
    xs = [x0 + 70, x0 + 330, x0 + 560]
    for (w_, h_), x in zip(sizes, xs):
        pw, ph = int(h_ * scale), int(w_ * scale)
        d.rectangle((x, base - ph, x + pw, base), fill=(226, 208, 178, 255), outline=CREAM, width=2)
        for k in range(1, max(2, ph // 16)):
            y = base - ph + k * 16
            d.line((x + 5, y, x + pw - 5, y + 4), fill=(200, 178, 140, 255), width=2)
        d.text((x, base + 26), f"{w_} × {h_}", font=font(30, True), fill=CREAM, anchor="lm")
    # persoon (1,75 m) voor de schaal
    hx, top = x1 - 110, base - 175
    d.ellipse((hx - 13, top, hx + 13, top + 26), fill=(244, 238, 228, 200))
    d.rounded_rectangle((hx - 18, top + 30, hx + 18, top + 100), radius=10, fill=(244, 238, 228, 200))
    d.rectangle((hx - 15, top + 96, hx - 4, base), fill=(244, 238, 228, 200))
    d.rectangle((hx + 4, top + 96, hx + 15, base), fill=(244, 238, 228, 200))
    d.text((hx, base + 26), "mm", font=font(26), fill=(244, 238, 228, 170), anchor="mm")
    shadowed(im).save(path)


def card_curve(it, idx, total, path):
    im, d, x0, x1 = card_base(idx, total, it["label"])
    cx, cy, r = x0 + 330, 430, 250
    d.rectangle((x0 + 60, cy - 10, cx, cy + 10), fill=(120, 110, 100, 255))
    d.arc((cx - r, cy - 2 * r, cx + r, cy), 0, 90, fill=(226, 208, 178, 255), width=26)
    d.arc((cx - r + 30, cy - 2 * r + 30, cx + r - 30, cy - 30), 0, 90, fill=(120, 110, 100, 255), width=8)
    d.text((x0 + 640, 200), it.get("big", "Curvas"), font=font(54, True), fill=CREAM, anchor="lm")
    d.text((x0 + 640, 262), it.get("small", "columnas · arcos"), font=font(32), fill=(244, 238, 228, 190), anchor="lm")
    d.text((x0 + 640, 304), it.get("small2", "paredes redondas"), font=font(32), fill=(244, 238, 228, 190), anchor="lm")
    shadowed(im).save(path)


def card_pin(it, idx, total, path):
    im, d, x0, x1 = card_base(idx, total, it["label"])
    px, py = x0 + 200, 300
    d.ellipse((px - 90, py - 150, px + 90, py + 30), fill=TERRA)
    d.polygon([(px - 70, py - 10), (px + 70, py - 10), (px, py + 140)], fill=TERRA)
    d.ellipse((px - 36, py - 96, px + 36, py - 24), fill=CREAM)
    d.text((x0 + 380, 230), it.get("place", "Jávea · Xàbia"), font=font(56, True), fill=CREAM, anchor="lm")
    d.text((x0 + 380, 300), it.get("small", "Showroom · Habitat One"), font=font(34), fill=(244, 238, 228, 200), anchor="lm")
    d.text((x0 + 380, 352), it.get("small2", "habitat-one.com/showroom"), font=font(32), fill=(244, 238, 228, 200), anchor="lm")
    shadowed(im).save(path)


def answer(text, path):
    f = font(44, True)
    im = Image.new("RGBA", (W, 110), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((80, 55), "— " + text, font=f, fill=(255, 255, 255, 255), anchor="lm")
    shadowed(im, blur=8, alpha=0.8).save(path)


def main():
    spec = json.load(open(sys.argv[1], encoding="utf8"))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    total = spec.get("total", len(spec["items"]))
    for i, it in enumerate(spec["items"], 1):
        bubble(it["q"], os.path.join(out, f"bubble{i}.png"))
        {"layers": card_layers, "sizes": card_sizes, "curve": card_curve, "pin": card_pin}[it["card"]](it, i, total, os.path.join(out, f"card{i}.png"))
        answer(it["a"], os.path.join(out, f"answer{i}.png"))
    print(out)


if __name__ == "__main__":
    main()
