#!/usr/bin/env python3
"""
Reel afwerken (lokaal, voor de wekelijkse content-sessie):
tekst in beeld (Spaans groot, Engels klein eronder), het officiële
Flex-Surfaces-logo bovenaan in het midden, muziek met fade-in/-out.

  python3 scripts/social-studio/reel.py in.mp4 out.mp4 --cues cues.json --music track.mp3
  cues.json: [{"start": 0.3, "end": 3.0, "es": "Antes", "en": "Before", "y": 0.4 (optioneel)}, ...]

Gebruikt de ffmpeg uit node_modules/ffmpeg-static en Avenir Next (macOS).
"""
import argparse, json, os, re, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FFMPEG = os.path.join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg")
LOCKUP = os.path.join(ROOT, "public", "brand", "flex-surfaces-lockup.png")
FONT = "/System/Library/Fonts/Avenir Next.ttc"


def probe(path):
    err = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    w, h = map(int, re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", err).groups())
    hh, mm, ss = re.search(r"Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)", err).groups()
    return w, h, int(hh) * 3600 + int(mm) * 60 + float(ss)


def wrap(d, text, font, maxw):
    lines, cur = [], ""
    for word in text.split(" "):  # harde spaties (\u00a0) houden woorden bij elkaar
        t = (cur + " " + word).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return [l for l in lines if l]


def cue_png(cue, W, path):
    big = ImageFont.truetype(FONT, int(W * 0.062), index=2)   # Demi Bold
    small = ImageFont.truetype(FONT, int(W * 0.036), index=5)  # Regular
    im = Image.new("RGBA", (W, int(W * 0.6)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = int(W * 0.02)
    for part in cue["es"].split("\n"):
        for line in wrap(d, part, big, W * 0.84):
            w = d.textlength(line, font=big)
            d.text(((W - w) / 2, y), line, font=big, fill=(255, 255, 255, 255))
            y += int(W * 0.075)
    if cue.get("en"):
        y += int(W * 0.008)
        for line in wrap(d, cue["en"], small, W * 0.84):
            w = d.textlength(line, font=small)
            d.text(((W - w) / 2, y), line, font=small, fill=(255, 255, 255, 235))
            y += int(W * 0.05)
    im = im.crop((0, 0, W, y + int(W * 0.03)))
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    shadow.putalpha(im.split()[3].point(lambda a: int(a * 0.65)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(4, W // 150)))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(shadow, (0, max(2, W // 360)))
    out.alpha_composite(im)
    out.save(path)


def top_scrim_png(W, H, path, depth=0.38, opacity=0.5):
    """Zachte donkere overgang bovenaan, zodat witte tekst ook op lichte beelden leesbaar is."""
    g = Image.new("L", (1, H), 0)
    top = int(H * depth)
    for y in range(top):
        g.putpixel((0, y), int(255 * opacity * (1 - y / top) ** 1.6))
    g = g.resize((W, H))
    im = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    im.putalpha(g)
    im.save(path)


LOGO_DARK_SUB = os.path.join(ROOT, "public", "brand", "flex-surfaces-logo-sub-dark.png")    # voor lichte achtergrond
LOGO_CREAM_SUB = os.path.join(ROOT, "public", "brand", "flex-surfaces-logo-sub-cream.png")  # voor donkere achtergrond
LOGO_CREAM_SOCIAL = os.path.join(ROOT, "public", "brand", "flex-surfaces-logo-sub-cream-social.png")  # crème met schaduw
HABITAT_DARK = os.path.join(ROOT, "public", "brand", "habitat-one-logo.png")         # verbouwingen/projecten
HABITAT_CREAM = os.path.join(ROOT, "public", "brand", "habitat-one-logo-cream.png")
LOGO_WIDTH = 0.40   # fractie van de beeldbreedte
LOGO_TOP = 0.035    # marge boven, fractie van de beeldhoogte


def logo_box(W, H):
    lw = int(W * LOGO_WIDTH)
    with Image.open(LOGO_DARK_SUB) as im:
        lh = int(im.height * lw / im.width)
    return (W - lw) // 2, int(H * LOGO_TOP), lw, lh


def logo_style(background, W, H):
    """Zelfde regel als lib/social/image-prep.ts (logoStyleFor): lichte, rustige achtergrond →
    zwarte onderregel; anders crème onderregel met een zacht donker verloop bovenaan."""
    if background is None:
        return LOGO_CREAM_SUB, True
    x, y, lw, lh = logo_box(W, H)
    bg = background.convert("L").resize((W, H))
    region = bg.crop((x, y + int(lh * 0.78), x + lw, y + lh))
    px = list(region.getdata()); n = max(1, len(px))
    mean = sum(px) / n
    sd = (sum((v - mean) ** 2 for v in px) / n) ** 0.5
    return (LOGO_DARK_SUB, False) if mean > 165 and sd < 28 else (LOGO_CREAM_SUB, True)


def habitat_png(W, H, path, background=None):
    """Habitat One-logo (verbouwingen/projecten) bovenaan in het midden, zwart of crème naar de ondergrond."""
    variant, gradient = logo_style(background, W, H)
    logo = Image.open(HABITAT_DARK if variant == LOGO_DARK_SUB else HABITAT_CREAM).convert("RGBA")
    lw = int(W * 0.30); lh = int(logo.height * lw / logo.width)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if gradient:
        depth = H * 0.24
        col = Image.new("L", (1, H), 0)
        for j in range(int(depth) + 1):
            col.putpixel((0, j), int(175 * max(0.0, 1 - j / depth) ** 1.6))
        shade = Image.new("RGBA", (W, H), (20, 16, 12, 0)); shade.putalpha(col.resize((W, H)))
        canvas.alpha_composite(shade)
    canvas.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), ((W - lw) // 2, int(H * LOGO_TOP)))
    canvas.save(path)


def brand_png(W, H, path, background=None, brand="flex"):
    """Officieel Flex-Surfaces-logo bovenaan in het midden; `background` (beeld) bepaalt de onderregel.
    brand="habitat": Habitat One-logo (voor verbouwingen en projecten)."""
    if brand == "habitat":
        return habitat_png(W, H, path, background)
    x, y, lw, lh = logo_box(W, H)
    variant, gradient = logo_style(background, W, H)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if gradient:
        depth = H * 0.24
        col = Image.new("L", (1, H), 0)
        for j in range(int(depth) + 1):
            col.putpixel((0, j), int(175 * max(0.0, 1 - j / depth) ** 1.6))
        shade = Image.new("RGBA", (W, H), (20, 16, 12, 0)); shade.putalpha(col.resize((W, H)))
        canvas.alpha_composite(shade)
    if variant == LOGO_CREAM_SUB:
        # versie met zachte schaduw (60 px rand), even groot geschaald als de gewone
        soc = Image.open(LOGO_CREAM_SOCIAL).convert("RGBA")
        k = lw / Image.open(LOGO_DARK_SUB).width
        soc = soc.resize((int(soc.width * k), int(soc.height * k)), Image.LANCZOS)
        pad = int(60 * k)
        canvas.alpha_composite(soc, (max(0, x - pad), max(0, y - pad)))
    else:
        canvas.alpha_composite(Image.open(variant).convert("RGBA").resize((lw, lh), Image.LANCZOS), (x, y))
    canvas.save(path)


def frame_at(src, t, tmp):
    p = os.path.join(tmp, "frame.png")
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", str(t), "-i", src, "-frames:v", "1", p], check=True)
    return Image.open(p).convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--cues"); ap.add_argument("--music")
    ap.add_argument("--text-y", type=float, default=0.15, help="bovenkant tekst, fractie van de hoogte")
    ap.add_argument("--volume", type=float, default=0.9)
    ap.add_argument("--brand", choices=["flex", "habitat"], default="flex",
                    help="flex = Flex-Surfaces-panelen (standaard), habitat = Habitat One (verbouwingen/projecten)")
    a = ap.parse_args()
    W, H, D = probe(a.src)
    tmp = tempfile.mkdtemp(prefix="reel-")
    brand = os.path.join(tmp, "brand.png"); brand_png(W, H, brand, frame_at(a.src, min(1.0, D / 2), tmp), a.brand)
    cues = json.load(open(a.cues)) if a.cues else []
    if cues:
        scrim = os.path.join(tmp, "scrim.png"); top_scrim_png(W, H, scrim, depth=a.text_y + 0.22, opacity=0.42)
        merged = Image.open(scrim); merged.alpha_composite(Image.open(brand)); merged.save(brand)
    args = [FFMPEG, "-hide_banner", "-y", "-i", a.src, "-loop", "1", "-i", brand]
    for i, c in enumerate(cues):
        p = os.path.join(tmp, f"cue{i}.png"); cue_png(c, W, p)
        args += ["-loop", "1", "-i", p]
    if a.music:
        args += ["-stream_loop", "-1", "-i", a.music]
    f, last = [], "[0:v]"
    f.append(f"{last}[1:v]overlay=0:0:shortest=1[b0]"); last = "[b0]"
    for i, c in enumerate(cues):
        s, e = float(c["start"]), min(float(c["end"]), D)
        f.append(f"[{i+2}:v]format=rgba,fade=t=in:st={s}:d=0.4:alpha=1,fade=t=out:st={max(s, e-0.4)}:d=0.4:alpha=1[c{i}]")
        y = int(H * float(c.get("y", a.text_y)))  # per cue een eigen hoogte mogelijk (bv. haakzin in het midden)
        f.append(f"{last}[c{i}]overlay=0:{y}:shortest=1:enable='between(t,{s},{e})'[v{i}]"); last = f"[v{i}]"
    f.append(f"{last}format=yuv420p[vout]")
    maps = ["-map", "[vout]"]
    if a.music:
        mi = len(cues) + 2
        f.append(f"[{mi}:a]volume={a.volume},afade=t=in:d=0.8,afade=t=out:st={max(0, D-2):.2f}:d=2[aout]")
        maps += ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
    args += ["-filter_complex", ";".join(f), *maps, "-t", f"{D:.2f}", "-c:v", "libx264", "-preset", "medium",
             "-crf", "18", "-movflags", "+faststart", a.out]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr[-1500:])
    print(f"klaar: {a.out} ({W}x{H}, {D:.1f}s, {len(cues)} teksten{', muziek' if a.music else ''})")


if __name__ == "__main__":
    main()
