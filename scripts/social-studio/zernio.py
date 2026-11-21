#!/usr/bin/env python3
"""
Media naar Zernio en het concept (Instagram + Facebook samen) aanmaken of bijwerken,
via de Composio-koppeling (geen Zernio-sleutel lokaal nodig). Zet NOOIT iets live:
het blijft een concept tot Nick in het CRM akkoord geeft.

  python3 scripts/social-studio/zernio.py --caption cap.txt [--post-id ZERNIO_ID] [--ai] file1.jpg [file2.jpg ...]
  → print JSON {"zernioPostId": ..., "mediaUrls": [...]}
"""
import argparse, json, os, subprocess, urllib.request

COMPOSIO = os.path.expanduser("~/.local/bin/composio")
ACCOUNTS = {"instagram": "6af6d36076ba618ebc0eb2e5", "facebook": "6af6d49dd64fa3050c9ec9d6"}
API = "https://zernio.com/api/v1"


def proxy(method, path, body=None):
    args = [COMPOSIO, "proxy", f"{API}{path}", "-t", "zernio_mcp", "-X", method]
    if body is not None:
        args += ["-H", "content-type: application/json", "-d", json.dumps(body)]
    r = subprocess.run(args, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    try:
        return json.loads(r.stdout, strict=False)
    except Exception:
        raise SystemExit(f"Zernio-fout: {r.stdout[:400]} {r.stderr[:400]}")


def upload(path):
    """Bestand naar Zernio-media; geeft de publieke URL terug."""
    ctype = "video/mp4" if path.endswith(".mp4") else "image/png" if path.endswith(".png") else "image/jpeg"
    r = proxy("POST", "/media/presign", {"filename": os.path.basename(path), "contentType": ctype})
    req = urllib.request.Request(r["uploadUrl"], data=open(path, "rb").read(), method="PUT", headers={"Content-Type": ctype})
    assert urllib.request.urlopen(req).status == 200
    return r["publicUrl"]  # niet aanpassen: Zernio verplaatst het bestand zelf bij het opslaan van de post


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--caption", required=True)
    ap.add_argument("--post-id")
    ap.add_argument("--ai", action="store_true")
    ap.add_argument("files", nargs="+")
    a = ap.parse_args()
    urls = [upload(f) for f in a.files]
    mtype = "video" if a.files[0].endswith(".mp4") else "image"
    body = {
        "content": open(a.caption).read().strip(),
        "mediaItems": [{"type": mtype, "url": u} for u in urls],
        "platforms": [
            {"platform": "instagram", "accountId": ACCOUNTS["instagram"], **({"platformSpecificData": {"isAiGenerated": True}} if a.ai else {})},
            {"platform": "facebook", "accountId": ACCOUNTS["facebook"]},
        ],
    }
    if a.post_id:
        # Eerst kijken, dan pas wijzigen: een ingeplande/gepubliceerde post nooit aanraken.
        cur = proxy("GET", f"/posts/{a.post_id}")
        cur = (cur.get("data") or cur).get("post", cur.get("data") or cur)
        if cur.get("status") not in (None, "draft"):
            raise SystemExit(f"Niet gewijzigd: Zernio-post {a.post_id} heeft status {cur.get('status')}")
        res = proxy("PUT", f"/posts/{a.post_id}", body)
        pid = a.post_id
    else:
        res = proxy("POST", "/posts", {**body, "isDraft": True})
        pid = (res.get("post") or {}).get("_id")
        if not pid:
            raise SystemExit(f"Geen post-id van Zernio: {json.dumps(res)[:400]}")
    print(json.dumps({"zernioPostId": pid, "mediaUrls": [p["url"] for p in (res.get("post") or {}).get("mediaItems", [])] or urls}))


if __name__ == "__main__":
    main()
