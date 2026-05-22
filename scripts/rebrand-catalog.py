#!/usr/bin/env python3
"""
Maak van een leveranciers-catalogus een Habitat One-catalogus:
 - knip de merk-voor/achterpagina's eraf en zet een eigen omslag ervoor,
 - vervang merknamen in lopende tekst door "Habitat" (zelfde lettertype),
 - dek merk-woordmerken (footer/divider) af met de achtergrondkleur en zet
   het Habitat One-logo eroverheen — dus geen witte vlakken.

Gebruik:  python3 scripts/rebrand-catalog.py <config-key>
"""
import sys

import fitz  # PyMuPDF

REPO = "/Users/houterminiopslag/Documents/projects/habitat-crm"
SORA_XB = f"{REPO}/public/fonts/sora/Sora-ExtraBold.ttf"
SORA_LIGHT = f"{REPO}/public/fonts/sora/Sora-Light.ttf"
SORA_MED = f"{REPO}/public/fonts/sora/Sora-Medium.ttf"
SORA_REG = f"{REPO}/public/fonts/sora/Sora-Regular.ttf"

BROWN = (0.227, 0.165, 0.125)
CREAM = (0.953, 0.937, 0.913)
GOLD = (0.663, 0.541, 0.294)

CONTACT = [
    "Habitat One & One SL",
    "Camí de la Fontana 3, Locales 2, 3 en 5",
    "03730 Jávea (Alicante), España",
    "hi@habitat-one.com  ·  +34 637 459 239  ·  habitat-one.com",
]

CONFIGS = {
    "ferne": {
        "src": "/tmp/ethick/ferne.pdf",
        "out": "/tmp/ethick/habitat-tuinmeubilair.pdf",
        "title": "Tuinmeubilair",
        "drop_front": 13,
        "drop_back": 3,
    },
    "ethick": {
        "src": "/tmp/ethick/ethick.pdf",
        "out": "/tmp/ethick/habitat-bloempotten.pdf",
        "title": "Bloempotten",
        "drop_front": 5,
        "drop_back": 3,
    },
}

# Merknamen in lopende tekst → vervangen door "Habitat".
REPLACE_TERMS = ["FERNE", "Ferne", "ETHICK", "Ethick", "PROSPERPLAST", "Prosperplast"]
# Slogans → uit lopende tekst verwijderen.
REMOVE_TERMS = ["have a seat.", "have a seat"]


def add_cover(doc, title):
    page0 = doc[0]
    W, H = page0.rect.width, page0.rect.height
    cover = doc.new_page(pno=0, width=W, height=H)
    cover.draw_rect(fitz.Rect(0, 0, W, H), color=BROWN, fill=BROWN)
    cover.insert_text((58, 100), "HABITAT", fontsize=30, fontfile=SORA_XB,
                      fontname="sxb", color=CREAM)
    cover.insert_text((58, 136), "ONE", fontsize=30, fontfile=SORA_XB,
                      fontname="sxb", color=CREAM)
    ey = H * 0.46
    cover.insert_text((60, ey), "C A T A L O G U S", fontsize=9,
                      fontfile=SORA_MED, fontname="smd", color=GOLD)
    cover.draw_rect(fitz.Rect(60, ey + 12, 118, ey + 13.4), color=GOLD, fill=GOLD)
    cover.insert_text((56, ey + 78), title, fontsize=52, fontfile=SORA_LIGHT,
                      fontname="slt", color=CREAM)
    cover.insert_textbox(
        fitz.Rect(60, ey + 100, W - 120, ey + 170),
        "Een selectie uit ons assortiment — zorgvuldig samengesteld voor "
        "binnen en buiten.",
        fontsize=11, fontfile=SORA_LIGHT, fontname="slt", color=CREAM, lineheight=1.6,
    )
    cy = H - 96
    for i, line in enumerate(CONTACT):
        cover.insert_text((58, cy + i * 14), line, fontsize=8,
                          fontfile=SORA_XB if i == 0 else SORA_REG,
                          fontname="sxb" if i == 0 else "srg", color=CREAM)


def load_body_fonts(doc):
    """Haal Satoshi-Regular/Light uit de PDF voor naadloze tekstvervanging."""
    fonts = {}
    for pno in range(len(doc)):
        for f in doc.get_page_fonts(pno):
            xref, basename = f[0], f[3]
            for weight in ("Regular", "Light"):
                if "Satoshi-" + weight in basename and weight not in fonts:
                    try:
                        fonts[weight] = fitz.Font(fontbuffer=doc.extract_font(xref)[3])
                    except Exception:
                        pass
        if len(fonts) >= 2:
            break
    return fonts


def bg_color(page, rect):
    """Gemiddelde achtergrondkleur net boven/onder een rechthoek."""
    strips = []
    for s in [(rect[0], rect[1] - 9, rect[2], rect[1] - 2),
              (rect[0], rect[3] + 2, rect[2], rect[3] + 9)]:
        c = fitz.Rect(s) & page.rect
        if c.is_empty or c.width < 1 or c.height < 1:
            continue
        pix = page.get_pixmap(clip=c, colorspace=fitz.csRGB)
        n = pix.width * pix.height
        if n == 0:
            continue
        smp = pix.samples
        strips.append((sum(smp[0::3]) / n, sum(smp[1::3]) / n, sum(smp[2::3]) / n))
    if not strips:
        return (1, 1, 1)
    return tuple(sum(s[i] for s in strips) / len(strips) / 255 for i in range(3))


def find_wordmarks(page):
    """Clusters van kleine vector-lettervormen in kop/voet = merk-woordmerken."""
    H = page.rect.height
    glyphs = []
    for g in page.get_drawings():
        if g["type"] not in ("f", "fs"):
            continue
        r = g["rect"]
        w, h, cy = r[2] - r[0], r[3] - r[1], (r[1] + r[3]) / 2
        if 1 < w < 28 and 3 < h < 24 and (cy < 0.14 * H or cy > 0.89 * H):
            glyphs.append([r[0], r[1], r[2], r[3]])
    glyphs.sort(key=lambda r: (round((r[1] + r[3]) / 12), r[0]))
    clusters = []
    for r in glyphs:
        for c in clusters:
            if abs((r[1] + r[3]) / 2 - (c[1] + c[3]) / 2) < 7 and -40 < r[0] - c[2] < 16:
                c[0], c[1] = min(c[0], r[0]), min(c[1], r[1])
                c[2], c[3] = max(c[2], r[2]), max(c[3], r[3])
                c[4] += 1
                break
        else:
            clusters.append([r[0], r[1], r[2], r[3], 1])
    # Een woordmerk = >=3 lettervormen op een rij, breder dan hoog, < 150pt.
    return [
        c[:4] for c in clusters
        if c[4] >= 3 and 12 < (c[2] - c[0]) < 150
        and (c[2] - c[0]) > 1.8 * (c[3] - c[1])
    ]


def cover_with_logo(page, rect, sora):
    """Dek een merk-woordmerk af met de achtergrondkleur + Habitat One-logo."""
    bg = bg_color(page, rect)
    page.draw_rect(fitz.Rect(rect[0] - 3, rect[1] - 3, rect[2] + 3, rect[3] + 3),
                   color=None, fill=bg)
    lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    ink = BROWN if lum > 0.5 else CREAM
    fs = max(7.0, (rect[3] - rect[1]) * 1.2)
    text = "Habitat One"
    tw = sora.text_length(text, fontsize=fs)
    x0 = (rect[0] + rect[2]) / 2 - tw / 2
    writer = fitz.TextWriter(page.rect)
    writer.append((x0, rect[3]), text, font=sora, fontsize=fs)
    writer.write_text(page, color=ink)


def find_brand_words(page):
    """Merknamen in lopende tekst: rect, baseline-origin, grootte, kleur, weight."""
    hits = []
    for b in page.get_text("rawdict")["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln.get("spans", []):
                chars = sp.get("chars", [])
                if not chars:
                    continue
                text = "".join(c["c"] for c in chars)
                for term in REPLACE_TERMS:
                    i = text.find(term)
                    while i >= 0:
                        run = chars[i:i + len(term)]
                        hits.append({
                            "rect": (min(c["bbox"][0] for c in run),
                                     min(c["bbox"][1] for c in run),
                                     max(c["bbox"][2] for c in run),
                                     max(c["bbox"][3] for c in run)),
                            "origin": run[0]["origin"],
                            "size": sp["size"],
                            "color": sp["color"],
                            "light": "Light" in sp["font"],
                        })
                        i = text.find(term, i + len(term))
    return hits


def rebrand(cfg):
    doc = fitz.open(cfg["src"])
    total = len(doc)
    body_fonts = load_body_fonts(doc)
    sora = fitz.Font(fontfile=SORA_XB)
    fallback = fitz.Font(fontfile=SORA_REG)

    if cfg["drop_back"] > 0:
        doc.delete_pages(total - cfg["drop_back"], total - 1)
    if cfg["drop_front"] > 0:
        doc.delete_pages(0, cfg["drop_front"] - 1)

    replaced, removed, marks = 0, 0, 0
    for page in doc:
        # 1. merknamen in lopende tekst → "Habitat"
        hits = find_brand_words(page)
        for h in hits:
            page.add_redact_annot(fitz.Rect(h["rect"]), fill=False, cross_out=False)
        for term in REMOVE_TERMS:
            for r in page.search_for(term):
                page.add_redact_annot(r, fill=False, cross_out=False)
                removed += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
        for h in hits:
            font = body_fonts.get("Light" if h["light"] else "Regular") \
                or body_fonts.get("Regular") or fallback
            col = h["color"]
            rgb = (((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255)
            w = fitz.TextWriter(page.rect)
            w.append(h["origin"], "Habitat", font=font, fontsize=h["size"])
            w.write_text(page, color=rgb)
            replaced += 1
        # 2. merk-woordmerken (footer/divider) → Habitat One-logo
        for cl in find_wordmarks(page):
            cover_with_logo(page, cl, sora)
            marks += 1

    add_cover(doc, cfg["title"])
    doc.save(cfg["out"], garbage=4, deflate=True)
    print(f"{cfg['out']}")
    print(f"  {total} → {len(doc)} pagina's · {replaced}× 'Habitat' in tekst · "
          f"{marks} woordmerken vervangen door logo · {removed} slogans weg")
    if len(body_fonts) < 1:
        print("  LET OP: Satoshi-font niet gevonden — terugval-lettertype gebruikt")


if __name__ == "__main__":
    key = sys.argv[1] if len(sys.argv) > 1 else "ferne"
    rebrand(CONFIGS[key])
