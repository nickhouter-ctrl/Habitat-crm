import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { detectSeparator, parseTable, splitDelimited, splitHeader } from "@/lib/import/parse-table";

const bytesVan = (tekst: string) => new TextEncoder().encode(tekst);

describe("detectSeparator", () => {
  it("kiest wat het vaakst in de kopregel staat", () => {
    expect(detectSeparator("a;b;c")).toBe(";");
    expect(detectSeparator("a,b,c")).toBe(",");
    expect(detectSeparator("a\tb\tc")).toBe("\t");
    // Komma's binnen een veld mogen de puntkomma niet verslaan.
    expect(detectSeparator("naam;adres;plaats")).toBe(";");
  });

  it("valt terug op de komma als er niets te vinden is", () => {
    expect(detectSeparator("naam")).toBe(",");
  });
});

describe("splitDelimited", () => {
  it("houdt een scheidingsteken binnen aanhalingstekens heel", () => {
    expect(splitDelimited('"García, S.L.",info@x.es', ",")).toEqual(["García, S.L.", "info@x.es"]);
  });

  it("leest een dubbel aanhalingsteken als één teken", () => {
    expect(splitDelimited('"Bar ""El Sol""",x', ",")).toEqual(['Bar "El Sol"', "x"]);
  });
});

describe("parseTable — csv", () => {
  it("leest koppen en rijen, en haalt de BOM van Excel weg", () => {
    const t = parseTable(bytesVan('﻿Empresa;Correo\nGarcía SL;info@garcia.es\n'), "lijst.csv");
    expect(t.format).toBe("csv");
    const { headers, rows } = splitHeader(t.sheets[0]);
    expect(headers).toEqual(["Empresa", "Correo"]);
    expect(rows).toEqual([["García SL", "info@garcia.es"]]);
  });

  it("slaat lege regels over", () => {
    const t = parseTable(bytesVan("a;b\n\n1;2\n\n\n3;4\n"), "x.csv");
    expect(t.sheets[0].rows).toHaveLength(3);
  });

  it("houdt zich aan maxRows voor het voorbeeld", () => {
    const veel = ["a;b", ...Array.from({ length: 500 }, (_, i) => `${i};x`)].join("\n");
    expect(parseTable(bytesVan(veel), "x.csv", { maxRows: 10 }).sheets[0].rows).toHaveLength(10);
  });

  it("leest een tab-gescheiden export zoals Excel die plakt", () => {
    const t = parseTable(bytesVan("Empresa\tCorreo\nGarcía SL\tinfo@garcia.es"), "x.csv");
    expect(splitHeader(t.sheets[0]).rows[0]).toEqual(["García SL", "info@garcia.es"]);
  });
});

describe("parseTable — xlsx", () => {
  const maakXlsx = (bladen: Record<string, (string | number)[][]>) => {
    const wb = XLSX.utils.book_new();
    for (const [naam, rijen] of Object.entries(bladen)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rijen), naam);
    }
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  };

  it("leest alle bladen — gekochte lijsten hebben er vaak één per provincie", () => {
    const bytes = maakXlsx({
      Alicante: [["Empresa", "Correo"], ["García SL", "info@garcia.es"]],
      Valencia: [["Empresa", "Correo"], ["López SA", "info@lopez.es"]],
    });
    const t = parseTable(bytes, "lijst.xlsx");
    expect(t.format).toBe("xlsx");
    expect(t.sheets.map((s) => s.name)).toEqual(["Alicante", "Valencia"]);
    expect(splitHeader(t.sheets[1]).rows[0]).toEqual(["López SA", "info@lopez.es"]);
  });

  it("houdt de voorloopnul van een postcode", () => {
    const bytes = maakXlsx({ Blad1: [["Empresa", "CP"], ["García SL", "03700"]] });
    const { rows } = splitHeader(parseTable(bytes, "x.xlsx").sheets[0]);
    expect(rows[0][1]).toBe("03700");
  });

  it("kan de kopregel lager in het blad hebben staan", () => {
    const bytes = maakXlsx({
      Blad1: [["Lijst architecten 2026", ""], ["Empresa", "Correo"], ["García SL", "info@garcia.es"]],
    });
    const { headers, rows } = splitHeader(parseTable(bytes, "x.xlsx").sheets[0], 2);
    expect(headers).toEqual(["Empresa", "Correo"]);
    expect(rows).toEqual([["García SL", "info@garcia.es"]]);
  });
});
