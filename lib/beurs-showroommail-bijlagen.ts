import "server-only";

/**
 * De vijf conceptbeelden van de beursmail inladen.
 *
 * Ze gaan als `cid`-bijlage mee, zodat ze ín de mail staan en niet als losse
 * bestanden eronder: de tekst zegt letterlijk "de afbeeldingen hieronder", en
 * dan moeten ze daar ook staan.
 *
 * Vaste bestandsnamen uit de lijst in `lib/beurs-showroommail.ts` — een
 * formulier kan hier geen pad aanleveren. Elk bestand wordt gecontroleerd op
 * grootte en op de JPEG-vingerafdruk; een stuk of verwisseld bestand gaat niet
 * naar honderd klanten toe.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { SHOWROOM_BEELDEN } from "@/lib/beurs-showroommail";
import type { EmailAttachment } from "@/lib/email";

export async function showroomBijlagen(): Promise<EmailAttachment[]> {
  return Promise.all(
    SHOWROOM_BEELDEN.map(async ({ filename, cid }) => {
      const content = await readFile(path.join(process.cwd(), "public", "mail", "beursmail", filename));
      const jpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
      if (!jpeg || content.length > 2_000_000) throw new Error(`Ongeldig conceptbeeld: ${filename}`);
      return { filename, content, contentType: "image/jpeg", cid, contentDisposition: "inline" as const };
    }),
  );
}
