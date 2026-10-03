/**
 * De beursmail met de presentatie- en verpakkingsconcepten.
 *
 * Deze gaat in één klik naar alle beurscontacten, dus moet vaststaan dat hij
 * klopt: de aanhef persoonlijk, beide talen compleet, de vijf beelden ín de
 * mail (en niet als losse bijlagen onderaan), en geen spoor van de
 * PRUEBA-markering uit de proefzending.
 */
import { describe, expect, it } from "vitest";

import {
  SHOWROOM_BEELDEN,
  aanhefNaam,
  SHOWROOM_ONDERWERP,
  showroomMailHtml,
  showroomMailTekst,
} from "@/lib/beurs-showroommail";

describe("onderwerp", () => {
  it("draagt de proefmarkering niet meer", () => {
    expect(SHOWROOM_ONDERWERP).not.toContain("PRUEBA");
    expect(SHOWROOM_ONDERWERP).not.toContain("PREVIEW");
  });

  it("staat in beide talen, zoals het team hem goedkeurde", () => {
    expect(SHOWROOM_ONDERWERP).toContain("Gracias por visitar nuestro stand");
    expect(SHOWROOM_ONDERWERP).toContain("Thank you for visiting our stand");
  });
});

describe("aanhef", () => {
  it("vult de voornaam in, in beide talen", () => {
    const html = showroomMailHtml("Marta Cenal Rodriquez");
    expect(html).toContain("Hola Marta:");
    expect(html).toContain("Dear Marta,");
    expect(html).not.toContain("Rodriquez");
  });

  it("laat nooit de invulplek staan", () => {
    for (const naam of ["Ana", "", "   "]) {
      expect(showroomMailHtml(naam)).not.toContain("{{naam}}");
      expect(showroomMailTekst(naam)).not.toContain("{{naam}}");
      expect(showroomMailHtml(naam)).not.toContain("[nombre / name]");
    }
  });

  it("valt netjes terug als we geen naam hebben", () => {
    const tekst = showroomMailTekst("   ");
    expect(tekst).toContain("Hola:");
    expect(tekst).toContain("Hello,");
    expect(tekst).not.toContain("Hola :");
    expect(tekst).not.toContain("Dear ,");
  });
});

describe("de vijf beelden", () => {
  it("staan in de mail zelf, met hun eigen content-id", () => {
    const html = showroomMailHtml("Ana");
    for (const beeld of SHOWROOM_BEELDEN) {
      expect(html).toContain(`src="cid:${beeld.cid}"`);
      // Niet meer als los bestandspad: dan laadt een mailprogramma niets.
      expect(html).not.toContain(`src="${beeld.filename}"`);
    }
  });

  it("heeft er precies vijf, elk met een eigen id", () => {
    expect(SHOWROOM_BEELDEN).toHaveLength(5);
    expect(new Set(SHOWROOM_BEELDEN.map((b) => b.cid)).size).toBe(5);
  });
});

describe("inhoud", () => {
  it("bevat beide talen volledig", () => {
    const tekst = showroomMailTekst("Ana");
    expect(tekst).toContain("ESPAÑOL");
    expect(tekst).toContain("ENGLISH");
    expect(tekst).toContain("Experience Center en Jávea");
    expect(tekst).toContain("Experience Center in Jávea");
  });

  it("is ondertekend door Hans", () => {
    expect(showroomMailTekst("Ana")).toContain("Hans");
    expect(showroomMailHtml("Ana")).toContain("Touch. Feel. Experience.");
  });
});

describe("de aanhef per klant", () => {
  it("zet een naam in kleine letters of kapitalen recht", () => {
    expect(aanhefNaam("paula calado")).toBe("Paula");
    expect(aanhefNaam("MIRIAM NAVARRO")).toBe("Miriam");
    expect(aanhefNaam("miguel calvo climent")).toBe("Miguel");
  });

  it("laat namen met opzettelijke hoofdletters met rust", () => {
    expect(aanhefNaam("JesoBruno SLV")).toBe("JesoBruno");
    expect(aanhefNaam("AJ Marcoz")).toBe("AJ");
    expect(aanhefNaam("João Araujo")).toBe("João");
  });

  it("slaat een initiaal over en pakt de echte voornaam", () => {
    expect(aanhefNaam("V. Manuel Cuenca de Tena")).toBe("Manuel");
  });

  it("spreekt niemand aan met een verzamelwoord", () => {
    expect(aanhefNaam("Beursbezoeker — celikbross@gmail.com")).toBe("");
    expect(aanhefNaam("test")).toBe("");
    expect(aanhefNaam("")).toBe("");
  });

  it("gebruikt de eerste naam bij twee mensen op één regel", () => {
    expect(aanhefNaam("Matías y Blanca")).toBe("Matías");
    expect(aanhefNaam("Noel / Olga")).toBe("Noel");
  });
});
