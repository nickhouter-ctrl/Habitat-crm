#!/usr/bin/env python3
"""
Vervang de Poolse collectie-teksten in de Habitat One bloempotten-catalogus
door Spaanse vertalingen — in het originele Outfit-lettertype, op dezelfde
plek. Draaien NA rebrand-catalog.py (op /tmp/ethick/habitat-bloempotten.pdf).
"""
import os

import fitz  # PyMuPDF

SRC = "/tmp/ethick/habitat-bloempotten.pdf"
REPO = "/Users/houterminiopslag/Documents/projects/habitat-crm"
# Volledig Outfit-lettertype (latin) — de in de PDF ingebedde subset mist de
# Spaanse accenten, dit niet.
OUTFIT = {
    "Thin": f"{REPO}/public/fonts/outfit/Outfit-Thin.ttf",
    "Light": f"{REPO}/public/fonts/outfit/Outfit-Light.ttf",
    "Regular": f"{REPO}/public/fonts/outfit/Outfit-Regular.ttf",
}

# Poolse begintekst (startswith) -> Spaanse vertaling.
TRANS = {
    "Kolekcja ULPHO powstała z myślą o miłośnikach":
        "La colección ULPHO está pensada para los amantes del minimalismo "
        "moderno y de las formas geométricas puras. Su rasgo distintivo es la "
        "forma cilíndrica de bordes claramente redondeados, desde modelos bajos "
        "y anchos hasta variantes altas y esbeltas. La superficie uniforme y "
        "mate y unas proporciones perfectamente equilibradas realzan el "
        "carácter robusto de las macetas, potenciando la sensación de "
        "estabilidad y calma.",
    "Równomierna drobnoziarnista faktura nadaje":
        "Una textura fina y uniforme de grano aporta a la superficie de las "
        "macetas un efecto mate homogéneo. Las posibles variaciones de color se "
        "producen de forma aleatoria y se deben a la mezcla de pigmentos "
        "utilizada.",
    "Kolekcja EPOCCO czerpie inspirację":
        "La colección EPOCCO se inspira en las antiguas vasijas cerámicas y en "
        "el arte escultórico, reinterpretándolos en una forma moderna. Las "
        "macetas cautivan por su silueta escultural de líneas suaves y "
        "proporciones sutilmente irregulares, que evocan la arcilla modelada a "
        "mano. La construcción de doble fondo equilibra la expresión artística "
        "con la funcionalidad de uso, convirtiendo la colección en el "
        "complemento ideal para interiores contemporáneos y espacios de "
        "representación.",
    "Donice inspirowane ręczną obróbką":
        "Macetas inspiradas en el trabajo manual de la cerámica de arcilla, con "
        "una superficie variada y un marcado efecto de craquelado, desgastes, "
        "rayados, descamación y rozaduras. Las variaciones de color se producen "
        "de forma aleatoria y se deben a la mezcla de pigmentos utilizada.",
    "Product images are for illustrative purposes only.":
        "Product images are for illustrative purposes only. Minor variations in "
        "colour, texture, or finish may occur as a result of the production "
        "process. Las imágenes de los productos son meramente orientativas. "
        "Pueden producirse pequeñas variaciones de color, textura o acabado "
        "debido al proceso de producción. Produktbilder dienen nur zur "
        "Veranschaulichung. Geringfügige Abweichungen in Farbe, Struktur oder "
        "Oberfläche können produktionsbedingt auftreten.",
    "Donica BOGE to rzeźbiarska forma":
        "La maceta BOGE es una forma escultórica inspirada en las vasijas de "
        "arcilla. Su silueta asimétrica, suavemente modelada, evoca la cerámica "
        "formada a mano. La superficie mate y variada, con textura de hormigón, "
        "potencia la sensación de autenticidad. BOGE se convierte en un "
        "elemento decorativo expresivo del espacio: atrae la mirada por su "
        "forma y aporta carácter y profundidad a cualquier composición.",
    "Kolekcja FOLKA łączy rzemieślniczą":
        "La colección FOLKA combina la precisión artesanal con una forma "
        "moderna. Su superficie se adorna con motivos geométricos en relieve "
        "que crean un ritmo marcado y un sutil juego de luz sobre la textura. "
        "FOLKA aporta al espacio el carácter de una escultura contemporánea, "
        "añadiendo un acento decorativo y artístico a interiores y exteriores. "
        "Cada maceta tiene su propio diseño individual.",
    "Powierzchnia donic wykończona równomierną":
        "Superficie de las macetas acabada con una textura fina y uniforme de "
        "grano. Las variaciones de color se producen de forma aleatoria y se "
        "deben a la mezcla de pigmentos utilizada.",
    "Donice inspirowane ręcznie modelowaną":
        "Macetas inspiradas en la cerámica tradicional modelada a mano. "
        "Superficie porosa formada por estrías horizontales irregulares de "
        "profundidad ligeramente variable. Las variaciones de color se producen "
        "de forma aleatoria y se deben a la mezcla de pigmentos utilizada.",
    "Kolekcja DEFORA zachwyca prostotą":
        "La colección DEFORA cautiva por la sencillez de su forma y su sutil "
        "textura inspirada en la naturaleza. Las líneas horizontales envuelven "
        "la superficie de las macetas como las huellas del viento en la arena, "
        "creando un efecto de delicado ritmo y claroscuro. DEFORA aporta calma "
        "y armonía al espacio, integrándose a la perfección tanto en "
        "composiciones modernas como clásicas, de interior y de exterior.",
    "Kolekcja LATIA łączy elegancję":
        "La colección LATIA combina elegancia y sencillez, inspirándose en las "
        "macetas cerámicas tradicionales. Cada modelo destaca por su forma "
        "individual, desde siluetas esbeltas hasta variantes anchas de sección "
        "cuadrada u oval. El carácter de la colección lo definen las estrías "
        "verticales, un detalle que aporta a las macetas una estructura "
        "marcada. Combinadas entre sí, forman una composición coherente y "
        "armoniosa para interiores y jardines.",
    "Powierzchnia uformowana w pionowe żłobienia":
        "Superficie formada por estrías verticales, cubierta de rayados, "
        "surcos, grietas y mellas. Las variaciones de color se producen de "
        "forma aleatoria y se deben a la mezcla de pigmentos utilizada.",
    "Kolekcja donic TUBRA zachwyca":
        "La colección de macetas TUBRA cautiva por su sutil referencia a la "
        "escultura clásica griega, en la que la armonía de las proporciones se "
        "une a una elegancia atemporal. El carácter de la colección se refuerza "
        "con el acanalado horizontal de la superficie, que aporta a las formas "
        "una profundidad escultórica. Las macetas están disponibles en "
        "distintas formas, desde modelos anchos hasta altos y esbeltos, "
        "perfectos tanto en interiores como en espacios de jardín.",
    "Kolekcja BLUMIO to propozycja":
        "La colección BLUMIO es una propuesta para quienes aprecian los objetos "
        "con carácter: sencillos, pero llenos de expresividad. Su silueta suave "
        "y orgánica evoca una piedra pulida por la naturaleza, sobria y a la "
        "vez sutil. Es un objeto de doble función —maceta y mesa auxiliar— que "
        "se funde de forma natural con el entorno, creando un acento sereno y "
        "escultórico. Su volumen compacto y monolítico aporta al espacio peso "
        "visual y sensación de equilibrio, mientras que la textura mate y "
        "porosa realza la profundidad y el carácter del material. BLUMIO es "
        "expresiva, natural y atemporal, y se integra con libertad en "
        "composiciones tanto de exterior como de interior.",
    "Kolekcja donic MOLTA to subtelna":
        "La colección de macetas MOLTA es un sutil juego entre líneas suaves y "
        "ovaladas y formas marcadas basadas en rectángulos y cuadrados. Cada "
        "modelo —de pie o apoyado sobre delicados soportes— cautiva por la "
        "precisión del detalle y una elegancia natural. Los bordes ligeramente "
        "redondeados y las superficies lisas realzan la maestría de la "
        "ejecución, uniendo naturaleza y artesanía en una forma contemporánea.",
    "Kolekcja donic MOLIO to hołd":
        "La colección de macetas MOLIO es un homenaje a lo clásico en clave "
        "moderna. Sus formas sencillas y elegantes y su superficie lisa y mate "
        "les confieren un carácter sutil y atemporal, en sintonía con la "
        "estética del minimalismo contemporáneo. Sus variadas formas —desde "
        "modelos altos y esbeltos hasta cuencos bajos— permiten crear "
        "composiciones coherentes y equilibradas en casa y en el jardín.",
    "DUALA to kolekcja, która łączy":
        "DUALA es una colección que une la precisión geométrica con la suavidad "
        "orgánica de la forma. Su diseño, inspirado en las vasijas antiguas, "
        "confiere a las macetas DUALA un carácter escultórico, casi artístico. "
        "Según la disposición, se puede utilizar una de las dos partes de la "
        "maceta, creando una composición adaptada al espacio.",
    "Kolekcja GANE to nowoczesna":
        "La colección GANE es una interpretación moderna de las formas "
        "cerámicas clásicas. Su cuerpo esférico, ligeramente elevado sobre una "
        "base cilíndrica, atrae la mirada por su línea suave y su forma serena "
        "y equilibrada. La superficie mate de textura delicada les aporta un "
        "carácter natural y permite combinarlas fácilmente con distintos "
        "estilos decorativos.",
    "Kolekcja VEMO inspirowana":
        "La colección VEMO, inspirada en la cerámica antigua, une la artesanía "
        "contemporánea con la sencillez de la forma. Sus contornos ligeramente "
        "cónicos y sus bordes suaves evocan el carácter de la alfarería de "
        "antaño, aportando a las macetas una expresión cálida y auténtica. En "
        "homenaje a la tradición, VEMO forma con las plantas un conjunto "
        "coherente y natural.",
    "Kolekcja MOODA czerpie":
        "La colección MOODA parte de formas clásicas para dar a las macetas un "
        "carácter contemporáneo y ligero. Cada modelo tiene forma de trapecio "
        "que se ensancha hacia arriba, lo que realza su esbeltez y elegancia. "
        "Su línea sencilla y sus proporciones equilibradas hacen que las "
        "macetas MOODA encajen en distintos estilos de interiores y jardines.",
    "Linia donic CORO przypomina":
        "La línea de macetas CORO recuerda a una galería de esculturas "
        "contemporáneas. Cada forma —de la oval a la rectangular— une estética "
        "y función. El acanalado regular y recto remite a las líneas "
        "arquitectónicas, mientras que los bordes planos subrayan el carácter "
        "sobrio y escultórico de la colección. Las macetas CORO encajan tanto "
        "en composiciones clásicas como modernas, aportando elegancia y un "
        "acento artístico al espacio.",
    "Donice o porowatej, ziarnistej":
        "Macetas de superficie porosa y granulada con bordes ásperos. Las "
        "variaciones de color se producen de forma aleatoria y se deben a la "
        "mezcla de pigmentos utilizada.",
    "Kolekcja EVOLIA to współczesna":
        "La colección EVOLIA es una interpretación contemporánea de las formas "
        "cerámicas tradicionales. Sus líneas suaves y ligeramente irregulares "
        "les confieren un carácter natural y escultórico inspirado en la "
        "artesanía de antaño. Su silueta orgánica rompe sutilmente la geometría "
        "del espacio, convirtiéndose en un elemento decorativo singular para "
        "interiores y jardines.",
    "Kolekcja donic YEKE inspirowana":
        "La colección de macetas YEKE se inspira en la artesanía antigua y en "
        "las formas naturales que han resistido el paso del tiempo. Sus líneas "
        "suaves y aerodinámicas evocan las formas de las vasijas de antaño y de "
        "las piedras pulidas por la naturaleza. YEKE son macetas contemporáneas "
        "de sencillez atemporal, que cautivan por la serenidad de sus formas y "
        "su silueta suave y natural.",
    "W donicach SPLITO prostota":
        "En las macetas SPLITO la sencillez de la forma adquiere una nueva "
        "dimensión gracias a un detalle que aporta ligereza y carácter al "
        "conjunto. El característico rebaje de la base constituye un acento "
        "constructivo sutil y, a la vez, práctico. Las proporciones cilíndricas "
        "y depuradas realzan el carácter moderno de las macetas y permiten "
        "integrarlas en casi cualquier espacio, desde interiores clásicos hasta "
        "terrazas minimalistas.",
    "Kolekcja ARIA zachwyca lekkością":
        "La colección ARIA cautiva por la ligereza de sus formas y una línea "
        "fluida inspirada en la cerámica de antaño. Las formas ovaladas y "
        "alargadas, nada convencionales, unen elegancia y funcionalidad, "
        "creando un acento sutil en las composiciones modernas. Sus "
        "proporciones delicadas y su superficie lisa realzan la belleza natural "
        "de las plantas.",
    "Kolekcja donic CANO wyróżnia":
        "La colección de macetas CANO destaca por su forma robusta y "
        "escultórica de líneas marcadas y redondeadas. Su silueta maciza, "
        "inspirada en las macetas cerámicas, atrae la mirada por una textura "
        "que reproduce fielmente la estructura de la piedra. Las macetas CANO "
        "combinan la fuerza del material natural con una estética moderna, "
        "convirtiéndose en un elemento llamativo tanto en interiores como en "
        "espacios exteriores. La colección se ha diseñado en grandes tamaños, "
        "pensada para composiciones comerciales, terrazas y zonas de descanso "
        "al aire libre.",
    "Zróżnicowana, niejednolita powierzchnia":
        "Superficie variada e irregular de las macetas, cubierta de pequeños "
        "arañazos, desgastes, fisuras y grietas más profundas. Las variaciones "
        "de color se producen de forma aleatoria y se deben a la mezcla de "
        "pigmentos utilizada.",
    "Rytmiczne ryflowania i smukły":
        "El acanalado rítmico y la silueta esbelta y geométrica definen el "
        "carácter de la colección FERO. Estas macetas se inspiran en la "
        "arquitectura, uniendo proporciones clásicas con una forma moderna. El "
        "juego de luces y sombras sobre su superficie realza el detalle "
        "escultórico, lo que convierte a FERO en un acento decorativo de fuerza "
        "en cualquier espacio, tanto de interior como de exterior.",
    "RONA to kolekcja donic o mocnym":
        "RONA es una colección de macetas de carácter fuerte y escultórico, en "
        "la que la forma geométrica se une a la precisión y a un detalle "
        "equilibrado. En su silueta se aprecia la fascinación por la "
        "arquitectura y por el juego de la luz sobre la superficie modelada. El "
        "borde ancho y las marcadas divisiones verticales aportan al conjunto "
        "monumentalidad y orden. RONA armoniza con distintos estilos "
        "arquitectónicos y decora con vistosidad terrazas y jardines.",
    "Donice o bardzo porowatej":
        "Macetas de superficie muy porosa y granulada con bordes ásperos. Las "
        "variaciones de color se producen de forma aleatoria y se deben a la "
        "mezcla de pigmentos utilizada.",
    "Kolekcję donic CUBLA wyróżnia":
        "La colección de macetas CUBLA destaca por su forma sencilla y "
        "geométrica de líneas nítidas y proporciones rotundas. Su carácter "
        "arquitectónico hace que combine a la perfección con espacios modernos, "
        "industriales y mediterráneos. La superficie mate y la gama de colores "
        "sobria realzan la elegancia sobria de las macetas, que lucen igual de "
        "bien solas que en agrupaciones que forman composiciones ordenadas y "
        "modulares.",
    "Cubla Stepa to donica":
        "Cubla Stepa es una maceta de característica construcción escalonada "
        "que une la estética moderna con la funcionalidad. Su forma se basa en "
        "la combinación de segmentos prismáticos que crean un conjunto rítmico "
        "y geométrico. Cada nivel constituye un espacio independiente para las "
        "plantas, lo que permite crear composiciones de vegetación en cascada y "
        "a la vez variadas. El acabado mate le aporta un carácter natural y "
        "sobrio que combina bien con las composiciones modernas. Cubla Stepa "
        "funciona a la perfección en interiores amplios, en terrazas y en "
        "zonas de entrada.",
    "Kolekcja GENECA celebruje":
        "La colección GENECA celebra la belleza de las formas sencillas de "
        "geometría marcada. La construcción sólida de cuerpos prismáticos, con "
        "bordes de trazado preciso y amplios remates planos, les confiere un "
        "carácter moderno y garantiza una estabilidad excepcional. La "
        "superficie mate y sutilmente rugosa evoca la arquitectura "
        "contemporánea, aportando al entorno una sensación de solidez y de "
        "orden elegante. Las macetas GENECA funcionan tanto en espacios "
        "exteriores y composiciones urbanas como en interiores de carácter "
        "moderno o industrial.",
    "TUBLA to smukła, cylindryczna":
        "TUBLA es una forma cilíndrica y esbelta de construcción maciza y "
        "silueta marcada. Su base ligeramente elevada y su interior realzado "
        "hacen que cada detalle esté pensado: nada sobra, nada es casual. Esta "
        "colección se ha creado pensando en espacios en los que cuenta la forma "
        "consciente y el detalle cuidado. Sutil y, a la vez, expresiva.",
    "TUBLA TRIA & STEPA to rzeźbiarska":
        "TUBLA TRIA & STEPA es una interpretación escultórica de la "
        "funcionalidad. La composición multinivel de formas cilíndricas crea "
        "una estructura rítmica y geométrica. Diseñada para alojar diversas "
        "especies de plantas en una única composición coherente, se convierte "
        "en un elemento integral de la arquitectura del espacio, desempeñando "
        "la función de escultura utilitaria.",
    "Kolekcja donic SIMPLA wyróżnia":
        "La colección de macetas SIMPLA destaca por su forma sencilla y sus "
        "proporciones equilibradas. Su silueta que se estrecha hacia abajo y su "
        "superficie mate de textura delicada le confieren un carácter elegante "
        "y arquitectónico. La colección incluye tanto modelos altos como bajos "
        "y anchos, lo que permite crear composiciones vegetales coherentes y "
        "variadas. Gracias a sus grandes tamaños, las macetas SIMPLA funcionan "
        "a la perfección en espacios públicos y comerciales, en terrazas y "
        "jardines, convirtiéndose en una vistosa decoración para cualquier "
        "composición.",
}


def main():
    doc = fitz.open(SRC)
    fonts = {w: fitz.Font(fontfile=p) for w, p in OUTFIT.items()}

    done, missed = 0, []
    for page in doc:
        H = page.rect.height
        blocks = page.get_text("dict")["blocks"]
        obstacles = [fitz.Rect(b["bbox"]) for b in blocks if b.get("lines")]
        obstacles += [fitz.Rect(im["bbox"]) for im in page.get_image_info()]

        todo = []
        for b in blocks:
            spans = [s for ln in b.get("lines", []) for s in ln["spans"]]
            if not spans:
                continue
            txt = " ".join(" ".join(s["text"] for s in spans).split())
            es = next((v for k, v in TRANS.items() if txt.startswith(k)), None)
            if es is None:
                if any(c in txt for c in "ąćęłńśźż") and len(txt) > 25:
                    missed.append((page.number + 1, txt[:55]))
                continue
            orig = spans[0]["font"]
            weight = "Regular" if "Regular" in orig else ("Light" if "Light" in orig else "Thin")
            todo.append({
                "bbox": b["bbox"], "es": es, "font": fonts[weight],
                "size": spans[0]["size"], "color": spans[0]["color"],
            })

        for t in todo:
            page.add_redact_annot(fitz.Rect(t["bbox"]), fill=False, cross_out=False)
        if todo:
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        for t in todo:
            x0, y0, x1, y1 = t["bbox"]
            # ruimte naar onder: tot het volgende blok/afbeelding of de rand
            limit = H - 34
            for r in obstacles:
                if r.y0 > y1 + 1 and r.x1 > x0 + 10 and r.x0 < x1 - 10:
                    limit = min(limit, r.y0 - 4)
            bottom = min(limit, y1 + (y1 - y0) * 1.3)
            col = t["color"]
            rgb = (((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255)

            placed = False
            size = t["size"]
            while size > t["size"] - 3.2:
                tw = fitz.TextWriter(page.rect)
                left = tw.fill_textbox(
                    fitz.Rect(x0, y0, x1, bottom), t["es"],
                    font=t["font"], fontsize=size, align=fitz.TEXT_ALIGN_LEFT,
                )
                if not left:
                    tw.write_text(page, color=rgb)
                    placed = True
                    break
                size -= 0.3
            if not placed:
                tw = fitz.TextWriter(page.rect)
                tw.fill_textbox(
                    fitz.Rect(x0, y0, x1, bottom), t["es"],
                    font=t["font"], fontsize=t["size"] - 3.2, align=fitz.TEXT_ALIGN_LEFT,
                )
                tw.write_text(page, color=rgb)
            done += 1

    tmp = SRC + ".tmp"
    doc.save(tmp, garbage=4, deflate=True)
    doc.close()
    os.replace(tmp, SRC)
    print(f"{done} Poolse tekstblokken vertaald naar Spaans")
    for pg, snip in missed:
        print(f"  NIET VERTAALD  p{pg}: {snip}")


if __name__ == "__main__":
    main()
