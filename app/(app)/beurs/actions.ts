"use server";

/**
 * Bezoeker van de beursstand vastleggen (het scherm op de stand).
 *
 * Tot nu toe ging dat met visitekaartjes in een map en een handgeschreven
 * notitie erbij; bij het opvolgen blijkt dan dat het e-mailadres niet te lezen
 * is. Daarom ter plekke intypen, op de iPad, en meteen in het CRM.
 *
 * Wat er van één invoer terechtkomt — contact, aanvraag, bevestigingsmail —
 * staat in `lib/beurs-opslag.ts`, omdat de QR-code op de website precies
 * hetzelfde moet opleveren.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth/guards";
import { INTERESSES, ROLLEN } from "@/lib/beurs";
import { slaBeursbezoekerOp } from "@/lib/beurs-opslag";

const schema = z.object({
  naam: z.string().trim().min(2, "Naam is verplicht").max(160),
  email: z.string().trim().email("Geen geldig e-mailadres").max(200),
  telefoon: z.string().trim().max(60).optional().or(z.literal("")),
  bedrijf: z.string().trim().max(160).optional().or(z.literal("")),
  rol: z.enum(ROLLEN.map((r) => r.key) as [string, ...string[]]),
  rolAnders: z.string().trim().max(120).optional().or(z.literal("")),
  taal: z.enum(["nl", "en", "es"]),
  wens: z.string().trim().max(2000).optional().or(z.literal("")),
  interesses: z.array(z.enum(INTERESSES.map((i) => i.key) as [string, ...string[]])).max(10).optional(),
  plaats: z.string().trim().max(160).optional().or(z.literal("")),
  land: z.string().trim().max(2).optional().or(z.literal("")),
});

export type BeursResultaat =
  | { ok: true; naam: string; mail: "verstuurd" | "mislukt"; account: "particulier" | "aannemer" | "bestond al" | "mislukt" }
  | { ok: false; fout: string };

export async function legBezoekerVast(formData: FormData): Promise<BeursResultaat> {
  await requireModule("aanvragen");
  // Meerdere vinkjes met dezelfde naam: getAll i.p.v. fromEntries.
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    interesses: formData.getAll("interesses").map(String),
  });
  if (!parsed.success) {
    return { ok: false, fout: parsed.error.issues.map((i) => i.message).join(" · ") };
  }
  const d = parsed.data;

  const res = await slaBeursbezoekerOp({
    naam: d.naam,
    email: d.email,
    telefoon: d.telefoon,
    bedrijf: d.bedrijf,
    rol: d.rol,
    rolAnders: d.rolAnders,
    interesses: d.interesses,
    plaats: d.plaats,
    land: d.land,
    taal: d.taal,
    wens: d.wens,
  });

  revalidatePath("/beurs");
  revalidatePath("/aanvragen");
  revalidatePath("/contacts");
  return { ok: true, naam: d.naam, mail: res.mail, account: res.account };
}
