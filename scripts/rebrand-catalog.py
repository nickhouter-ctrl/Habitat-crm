#!/usr/bin/env python3
"""
Maak van een leveranciers-catalogus een Habitat One-catalogus:
 - knip de merk-voorpagina's en achterpagina's (cover + merkverhaal) eraf,
 - zet een eigen Habitat One-omslag ervoor,
 - lak resterende leveranciersnamen weg (witte redactie).

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

# per catalogus: bron, uitvoer, titel, aantal voorpagina's weg, aantal
# achterpagina's weg, en de weg-te-lakken termen.
CONFIGS = {
    "ferne": {
        "src": "/tmp/ethick/ferne.pdf",
        "out": "/tmp/ethick/habitat-tuinmeubilair.pdf",
        "title": "Tuinmeubilair",
        "drop_front": 13,
        "drop_back": 3,
        "terms": ["FERNE", "Ferne", "ferne", "PROSPERPLAST", "Prosperplast",
                  "prosperplast", "have a seat.", "have a seat"],
    },
    "ethick": {
        "src": "/tmp/ethick/ethick.pdf",
        "out": "/tmp/ethick/habitat-bloempotten.pdf",
        "title": "Bloempotten",
        "drop_front": 5,
        "drop_back": 4,
        "terms": ["ETHICK", "Ethick", "ethick", "PROSPERPLAST", "Prosperplast", "prosperplast"],
    },
}


def add_cover(doc, title):
    page0 = doc[0]
    W, H = page0.rect.width, page0.rect.height
    cover = doc.new_page(pno=0, width=W, height=H)
    cover.draw_rect(fitz.Rect(0, 0, W, H), color=BROWN, fill=BROWN)

    cover.insert_text((58, 100), "HABITAT", fontsize=30, fontfile=SORA_XB,
                      fontname="sxb", color=CREAM)
    cover.insert_text((58, 136), "ONE", fontsize=30, fontfile=SORA_XB,
                      fontname="sxb", color=CREAM)

    eyebrow_y = H * 0.46
    cover.insert_text((60, eyebrow_y), "C A T A L O G U S", fontsize=9,
                      fontfile=SORA_MED, fontname="smd", color=GOLD)
    cover.draw_rect(fitz.Rect(60, eyebrow_y + 12, 60 + 58, eyebrow_y + 13.4),
                    color=GOLD, fill=GOLD)
    cover.insert_text((56, eyebrow_y + 78), title, fontsize=52,
                      fontfile=SORA_LIGHT, fontname="slt", color=CREAM)
    cover.insert_textbox(
        fitz.Rect(60, eyebrow_y + 100, W - 120, eyebrow_y + 170),
        "Een selectie uit ons assortiment — zorgvuldig samengesteld voor "
        "binnen en buiten.",
        fontsize=11, fontfile=SORA_LIGHT, fontname="slt", color=CREAM,
        lineheight=1.6,
    )

    cy = H - 96
    for i, line in enumerate(CONTACT):
        cover.insert_text((58, cy + i * 14), line, fontsize=8,
                          fontfile=SORA_XB if i == 0 else SORA_REG,
                          fontname="sxb" if i == 0 else "srg", color=CREAM)


def cover_wordmarks(page):
    """Dek FERNE-woordmerken af: clusters van kleine vector-lettervormen in de
    kop- of voetzone van de pagina (footer-logo + divider-titels)."""
    H = page.rect.height
    glyphs = []
    for g in page.get_drawings():
        if g["type"] not in ("f", "fs"):
            continue
        r = g["rect"]
        w, h, cy = r[2] - r[0], r[3] - r[1], (r[1] + r[3]) / 2
        if 1 < w < 26 and 3 < h < 22 and (cy < 0.12 * H or cy > 0.90 * H):
            glyphs.append([r[0], r[1], r[2], r[3]])
    glyphs.sort(key=lambda r: (round((r[1] + r[3]) / 12), r[0]))
    clusters = []
    for r in glyphs:
        for c in clusters:
            same_row = abs((r[1] + r[3]) / 2 - (c[1] + c[3]) / 2) < 7
            if same_row and -40 < r[0] - c[2] < 14:
                c[0], c[1] = min(c[0], r[0]), min(c[1], r[1])
                c[2], c[3] = max(c[2], r[2]), max(c[3], r[3])
                c[4] += 1
                break
        else:
            clusters.append([r[0], r[1], r[2], r[3], 1])
    n = 0
    for c in clusters:
        if c[4] >= 4 and (c[2] - c[0]) < 95:
            page.draw_rect(fitz.Rect(c[0] - 4, c[1] - 4, c[2] + 4, c[3] + 4),
                           color=None, fill=(1, 1, 1))
            n += 1
    return n


def rebrand(cfg):
    doc = fitz.open(cfg["src"])
    total = len(doc)
    # achter eerst weg (anders schuiven de indexen), dan voor
    if cfg["drop_back"] > 0:
        doc.delete_pages(total - cfg["drop_back"], total - 1)
    if cfg["drop_front"] > 0:
        doc.delete_pages(0, cfg["drop_front"] - 1)

    # Per pagina: FERNE-woordmerken (kop/voet) wit overdekken + merknaam-tekst
    # weglakken.
    marks, redacted = 0, 0
    for page in doc:
        marks += cover_wordmarks(page)
        for term in cfg["terms"]:
            for rect in page.search_for(term):
                page.add_redact_annot(rect, fill=(1, 1, 1))
                redacted += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
    print(f"  {marks} woordmerken overdekt, {redacted} tekst-vlakken weggelakt")

    add_cover(doc, cfg["title"])
    doc.save(cfg["out"], garbage=4, deflate=True)
    print(f"{cfg['out']}  —  {total} → {len(doc)} pagina's, {redacted} merknaam-vlakken weggelakt")


if __name__ == "__main__":
    key = sys.argv[1] if len(sys.argv) > 1 else "ferne"
    rebrand(CONFIGS[key])
