#!/usr/bin/env python3
"""
Higgsfield-video via de officiële Model API (voor de onbewaakte weekrun; de
claude.ai-koppeling is daar niet beschikbaar). Sleutel: ~/.config/habitat/higgsfield-key
("<key id>:<secret>", opgeslagen met ~/.config/habitat/higgsfield-sleutel-opslaan.sh).

Beelden moeten publiek staan: ze gaan eerst naar Zernio-media (zie zernio.upload).

  python3 scripts/social-studio/hf.py --start before.png [--end after.png] --prompt "..." --out video.mp4 [--seconds 12] [--resolution 480p]
"""
import argparse, json, os, sys, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zernio import upload  # noqa: E402

BASE = "https://api.higgsfield.ai"
PATH = "/bytedance/seedance-2.0/image-to-video"
KEY_FILE = os.path.expanduser("~/.config/habitat/higgsfield-key")


def call(method, url, body=None):
    key = open(KEY_FILE).read().strip()
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Higgsfield {e.code}: {e.read().decode(errors='replace')[:400]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True); ap.add_argument("--end")
    ap.add_argument("--prompt", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--seconds", type=int, default=12)
    ap.add_argument("--resolution", default="480p", choices=["480p", "720p"])
    a = ap.parse_args()
    body = {"image_url": upload(a.start), "prompt": a.prompt, "duration": max(4, min(15, a.seconds)),
            "resolution": a.resolution, "generate_audio": False}
    if a.end:
        body["end_image_url"] = upload(a.end)
    job = call("POST", BASE + PATH, body)
    status_url = job["status_url"]
    if not status_url.startswith(BASE + "/"):
        raise SystemExit("onverwachte status-URL")
    for _ in range(120):  # max ~20 min
        time.sleep(10)
        st = call("GET", status_url)
        s = st.get("status")
        if s == "completed":
            urllib.request.urlretrieve(st["video"]["url"], a.out)
            print(json.dumps({"out": a.out, "request_id": job.get("request_id")}))
            return
        if s in ("failed", "nsfw", "canceled"):
            raise SystemExit(f"Higgsfield: {s} {st.get('error') or ''}")
    raise SystemExit("Higgsfield: time-out")


if __name__ == "__main__":
    main()
