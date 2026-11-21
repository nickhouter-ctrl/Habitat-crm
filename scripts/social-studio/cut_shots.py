#!/usr/bin/env python3
"""Staande Reel-ruwversie knippen uit een liggende bronvideo (bv. ~/Downloads/Graded footage.mp4, 4K).

  python3 scripts/social-studio/cut_shots.py bron.mp4 shots.json uit.mp4
  shots.json: [[start_s, duur_s, x], ...]   x = linkerkant van de staande uitsnede in bronpixels
              (optioneel 4e veld "zoom" > 1.0 voor een strakkere uitsnede rond hetzelfde midden)

Elke shot wordt 9:16 uitgesneden (volle hoogte), naar 1080x1920 geschaald en achter elkaar gezet.
Daarna afwerken met reel.py (tekst, logo, muziek).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = os.path.join(HERE, "..", "..", "node_modules", "ffmpeg-static", "ffmpeg")


def probe(src):
    r = subprocess.run([FFMPEG, "-i", src], capture_output=True, text=True)
    import re
    m = re.search(r"Video:.*?(\d{3,5})x(\d{3,5})", r.stderr)
    return int(m.group(1)), int(m.group(2))


def main():
    src, spec, out = sys.argv[1:4]
    shots = json.load(open(spec))
    W, H = probe(src)
    args, parts = [], []
    for i, s in enumerate(shots):
        t, d, x = s[0], s[1], s[2]
        zoom = s[3] if len(s) > 3 else 1.0
        ch = int(H / zoom)
        cw = int(ch * 9 / 16)
        cy = (H - ch) // 2
        cx = max(0, min(W - cw, int(x + (int(H * 9 / 16) - cw) / 2)))
        args += ["-ss", str(t), "-t", str(d + 0.2), "-i", src]
        parts.append(f"[{i}:v]trim=duration={d},setpts=PTS-STARTPTS,fps=30,crop={cw}:{ch}:{cx}:{cy},"
                     f"scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[s{i}]")
    parts.append("".join(f"[s{i}]" for i in range(len(shots))) + f"concat=n={len(shots)}:v=1:a=0[v]")
    fpath = out + ".filter"
    open(fpath, "w").write(";".join(parts))
    subprocess.run([FFMPEG, "-loglevel", "error", "-y", *args, "-filter_complex_script", fpath,
                    "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", out],
                   check=True, stdin=subprocess.DEVNULL)
    os.remove(fpath)
    starts, acc = [], 0.0
    for s in shots:
        starts.append(round(acc, 2)); acc += s[1]
    print(json.dumps({"out": out, "starts": starts, "duration": round(acc, 2)}))


if __name__ == "__main__":
    main()
