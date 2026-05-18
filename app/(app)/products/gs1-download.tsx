"use client";

import { useState } from "react";

import { buttonClass } from "@/components/ui";

/** Dropdown waarmee je kunt kiezen sinds wanneer producten in de GS1-export. */
export function Gs1ExcelDownload() {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState<string>("");

  const url = since ? `/api/products/barcodes-xlsx?since=${since}` : "/api/products/barcodes-xlsx";

  const presets: Array<{ label: string; daysBack: number | null }> = [
    { label: "Alle barcodes", daysBack: null },
    { label: "Sinds vandaag", daysBack: 0 },
    { label: "Laatste 7 dagen", daysBack: 7 },
    { label: "Laatste 30 dagen", daysBack: 30 },
  ];

  const setPreset = (daysBack: number | null) => {
    if (daysBack === null) {
      setSince("");
    } else {
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      setSince(d.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonClass({ variant: "secondary" })}
        title="MijnGS1 import-template (xlsx) — kies welke barcodes je wilt exporteren"
      >
        GS1 Excel ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-border bg-background p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium text-muted">Welke producten?</p>
            <div className="grid grid-cols-2 gap-1">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPreset(p.daysBack)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-background-soft"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <label className="text-xs text-muted">Of vanaf specifieke datum:</label>
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </div>

            <div className="mt-3 rounded-md bg-background-soft p-2 text-xs">
              {since ? (
                <>
                  Alleen producten met barcode <strong>gewijzigd vanaf {since}</strong>.
                </>
              ) : (
                <>
                  <strong>Alle</strong> producten met barcode — risico op dubbele
                  import als ze al in GS1 staan.
                </>
              )}
            </div>

            <a
              href={url}
              download
              onClick={() => setOpen(false)}
              className={`mt-3 inline-flex w-full justify-center ${buttonClass({ variant: "primary" })}`}
            >
              Download .xlsx
            </a>
          </div>
        </>
      )}
    </div>
  );
}
