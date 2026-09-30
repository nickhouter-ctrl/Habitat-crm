import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EmailAttachment } from "@/lib/email";

/** Vaste, meegebundelde bijlagen; beide talen gaan met elke nieuwe beursmail mee. */
export async function beursBijlagen(): Promise<EmailAttachment[]> {
  return Promise.all([
    "flexible-stone-technical-data-sheet.pdf",
    "flexible-stone-technical-data-sheet-es.pdf",
  ].map(async filename => {
    const content = await readFile(path.join(process.cwd(), "public", "docs", filename));
    // Geen mail zonder de toegezegde bijlage als een deploymentbestand ontbreekt.
    if (content.subarray(0, 5).toString() !== "%PDF-") throw new Error("Ongeldige beursdatasheet");
    return { filename, content, contentType: "application/pdf" };
  }));
}
