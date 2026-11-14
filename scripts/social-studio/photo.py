#!/usr/bin/env python3
"""
Foto afwerken voor een post: bijsnijden naar 1080x1350 (of 1080x1080), optioneel
uitleg in beeld (Spaans groot, Engels klein eronder) en het officiële
Flex-Surfaces-logo bovenaan in het midden.

  python3 scripts/social-studio/photo.py in.jpg out.jpg [--es "Formato 1200\u00a0×\u00a0600\u00a0mm"] [--en "Size 1200 × 600 mm"] [--square] [--text-y 0.08]
"""
import argparse, os, sys, tempfile
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reel import brand_png, cue_png, top_scrim_png  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--es"); ap.add_argument("--en")
    ap.add_argument("--square", action="store_true")
    ap.add_argument("--text-y", type=float, default=0.16)
    a = ap.parse_args()
    W, H = (1080, 1080) if a.square else (1080, 1350)
    im = Image.open(a.src).convert("RGB")
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((l, t, l + W, t + H)).convert("RGBA")
    tmp = tempfile.mkdtemp(prefix="photo-")
    if a.es:
        sc = os.path.join(tmp, "scrim.png")
        top_scrim_png(W, H, sc, depth=a.text_y + 0.3, opacity=0.55)
        im.alpha_composite(Image.open(sc))
        p = os.path.join(tmp, "cue.png")
        cue_png({"es": a.es, "en": a.en or ""}, W, p)
        im.alpha_composite(Image.open(p), (0, int(H * a.text_y)))
    b = os.path.join(tmp, "brand.png")
    brand_png(W, H, b, im.convert("RGB"))
    im.alpha_composite(Image.open(b))
    im.convert("RGB").save(a.out, quality=90)
    print(f"klaar: {a.out}")


if __name__ == "__main__":
    main()
