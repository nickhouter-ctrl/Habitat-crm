#!/usr/bin/env python3
"""
Extraheer de productfoto's per bloempot-model uit de ETHICK-katalogus.

Bron : ~/Downloads/ETHICK_KATALOG_ETH.26.1_redukcja_www.pdf
Uit  : /tmp/ethick/final/<baseSKU>.jpg  (bijgesneden, vierkant, witte achtergrond)

De katalogus toont per modelpagina de potten naast elkaar; elke pot is één
ingebedde rasterafbeelding. We sorteren de afbeeldingen per pagina op
x-positie en koppelen ze aan de modelcode in dezelfde vololgorde (L->R).
Daarna gebruikt scripts/import-ethick-pots.ts deze foto's.

Vereist: PyMuPDF (fitz) + Pillow.
"""
import io
import os

import fitz
from PIL import Image

PDF = os.path.expanduser("~/Downloads/ETHICK_KATALOG_ETH.26.1_redukcja_www.pdf")
OUT = "/tmp/ethick/final"

# (paginanummer, index in de op x gesorteerde afbeeldingen, basis-SKU)
MAP = [
    (10, 0, "TUO40"), (10, 1, "TUO40M"), (10, 2, "TUO48M"), (10, 3, "TUO60M"),
    (11, 1, "TU30H"), (11, 2, "TUO48B"),
    (14, 0, "TEP48B"), (14, 1, "TEP38M"), (14, 2, "TEP30T"), (14, 3, "TEP46H"),
    (18, 0, "TBO40"), (18, 1, "TBO48"),
    (26, 1, "TDE40"), (26, 2, "TDE48"), (26, 3, "TDE60"),
    (27, 0, "TDEO40"),
    (37, 0, "TT60"), (37, 1, "TT80"),
    (43, 0, "TBL120"),
    (57, 0, "TMOS40"), (57, 1, "TMOS48"), (57, 2, "TMOS60"),
    (58, 0, "TMBO40"), (58, 1, "TMBO60"), (58, 2, "TMBO80"),
    (66, 2, "TGAO1S"),
    (80, 0, "TCR30"), (80, 1, "TCR40"), (80, 2, "TCR48"), (80, 3, "TCR40H"), (80, 4, "TCR48H"),
    (81, 0, "TCS40"), (81, 3, "TCS48"), (81, 5, "TCS40H"), (81, 6, "TCC80"),
    (82, 0, "TCB40"), (82, 1, "TCB48"), (82, 2, "TCB40H"),
    (102, 0, "TCA40"), (102, 1, "TCA60"), (102, 2, "TCA80"),
    (103, 1, "TCA40H"),
    (112, 0, "TR40"), (112, 1, "TR60"), (112, 2, "TR80"),
]


def page_images(page):
    """Op x-positie gesorteerde, geëxtraheerde rasterafbeeldingen (>40px)."""
    info = [i for i in page.get_image_info(xrefs=True) if i["width"] > 40 and i["height"] > 40]
    info.sort(key=lambda i: (i["bbox"][0] + i["bbox"][2]) / 2)
    return info


def trim(im, thr=250):
    """Snij witte rand weg."""
    mask = im.convert("L").point(lambda p: 0 if p > thr else 255)
    bbox = mask.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    os.makedirs(OUT, exist_ok=True)
    doc = fitz.open(PDF)
    by_page = {}
    for pn, idx, sku in MAP:
        by_page.setdefault(pn, []).append((idx, sku))

    n = 0
    for pn, items in by_page.items():
        imgs = page_images(doc[pn - 1])
        for idx, sku in items:
            raw = doc.extract_image(imgs[idx]["xref"])["image"]
            im = trim(Image.open(io.BytesIO(raw)).convert("RGB"))
            side = int(max(im.width, im.height) * 1.12)
            canvas = Image.new("RGB", (side, side), (255, 255, 255))
            canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
            if side > 760:
                canvas = canvas.resize((760, 760), Image.LANCZOS)
            canvas.save(f"{OUT}/{sku}.jpg", quality=90)
            n += 1
    print(f"{n} modelfoto's geschreven naar {OUT}/")


if __name__ == "__main__":
    main()
