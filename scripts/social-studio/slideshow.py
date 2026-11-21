#!/usr/bin/env python3
"""Maak van foto's een staande Reel (1080x1920) met trage zoom en zachte overgangen.

Kost geen Higgsfield-credits. Daarna afwerken met reel.py (tekst, logo, muziek):

    python3 scripts/social-studio/slideshow.py a.jpg b.jpg c.jpg raw.mp4 [--sec 3.2] [--fade 0.6] [--transition wipeleft]
    python3 scripts/social-studio/reel.py raw.mp4 out.mp4 --cues cues.json --music public/brand/music/guitar-1.mp3

Elke foto wordt op 9:16 bijgesneden (midden) en krijgt een rustige zoom, afwisselend in en uit.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = os.path.join(HERE, "..", "..", "node_modules", "ffmpeg-static", "ffmpeg")
W, H, FPS = 1080, 1920, 30


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="foto's ... gevolgd door het uitvoerbestand (.mp4)")
    ap.add_argument("--sec", type=float, default=3.2, help="seconden per foto")
    ap.add_argument("--fade", type=float, default=0.6, help="overgang in seconden")
    ap.add_argument("--transition", default="fade",
                    help="ffmpeg-xfade-overgang: fade (standaard), wipeleft (voor → na onthullen), slideleft, dissolve")
    a = ap.parse_args()
    *imgs, out = a.files
    if len(imgs) < 2 or not out.endswith(".mp4"):
        sys.exit("gebruik: slideshow.py foto1 foto2 [...] uit.mp4")
    frames = int(a.sec * FPS)
    inputs, chains = [], []
    for i, img in enumerate(imgs):
        inputs += ["-i", img]  # één frame; zoompan maakt er d frames van
        # eerst ruim bijsnijden (2x) zodat de zoom scherp blijft, dan zoompan
        zoom = "min(1.0+0.0010*on,1.12)" if i % 2 == 0 else "max(1.12-0.0010*on,1.0)"
        chains.append(
            f"[{i}:v]scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
            f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},"
            f"setsar=1,format=yuv420p[v{i}]"
        )
    prev, offset = "v0", a.sec - a.fade
    for i in range(1, len(imgs)):
        tag = f"x{i}"
        chains.append(f"[{prev}][v{i}]xfade=transition={a.transition}:duration={a.fade}:offset={offset:.2f}[{tag}]")
        prev, offset = tag, offset + a.sec - a.fade
    cmd = [FFMPEG, "-y", *inputs, "-filter_complex", ";".join(chains), "-map", f"[{prev}]",
           "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    print(out)


if __name__ == "__main__":
    main()
