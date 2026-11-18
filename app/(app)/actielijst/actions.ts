"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth/guards";
import { actiepuntInvoer, archiefInvoer, bewaarActiepuntDb, klaarInvoer, opmerkingInvoer, plaatsOpmerkingDb, zetArchiefDb, zetKlaarDb } from "@/lib/actielijst-db";

export type ActieResult = { success?: string; error?: string; itemId?: string };

/** Nieuw actiepunt of een bestaand punt bijwerken — hetzelfde formulier. */
export async function bewaarActiepunt(_: ActieResult, fd: FormData): Promise<ActieResult> {
  const user = await requireModule("actielijst");
  try {
    const uit = await bewaarActiepuntDb(actiepuntInvoer.parse(Object.fromEntries(fd)), user.id);
    if ("fout" in uit) return { error: uit.fout === "deadline" ? "Kies een geldige deadline." : uit.fout === "verantwoordelijke" ? "Deze medewerker kan de actielijst niet bijwerken. Kies een andere verantwoordelijke." : "Actiepunt niet gevonden." };
    revalidatePath("/actielijst");
    return { itemId: uit.itemId, success: uit.bestond ? "Actiepunt stond al in de lijst." : uit.nieuw ? "Actiepunt toegevoegd." : "Actiepunt bijgewerkt." };
  } catch {
    return { error: "Actiepunt niet opgeslagen. Controleer de groep, het actiepunt en de deadline." };
  }
}

/** Het vinkje in de lijst. Eén klik, geen formulier. */
export async function zetActieKlaar(input: unknown): Promise<{ error?: string }> {
  const user = await requireModule("actielijst");
  const parsed = klaarInvoer.safeParse(input);
  if (!parsed.success) return { error: "Actiepunt niet bijgewerkt. Probeer het opnieuw." };
  try {
    if (!(await zetKlaarDb(parsed.data.id, parsed.data.klaar, user.id))) return { error: "Actiepunt niet bijgewerkt. Probeer het opnieuw." };
  } catch {
    return { error: "Actiepunt niet bijgewerkt. Probeer het opnieuw." };
  }
  revalidatePath("/actielijst");
  return {};
}

/** Uit de lijst halen of terugzetten; de historie blijft staan. */
export async function zetActieArchief(input: unknown): Promise<{ error?: string }> {
  const user = await requireModule("actielijst");
  const parsed = archiefInvoer.safeParse(input);
  if (!parsed.success) return { error: "Actiepunt niet bijgewerkt. Probeer het opnieuw." };
  try {
    if (!(await zetArchiefDb(parsed.data.id, parsed.data.archief, user.id))) return { error: "Actiepunt niet bijgewerkt. Probeer het opnieuw." };
  } catch {
    return { error: "Actiepunt niet bijgewerkt. Probeer het opnieuw." };
  }
  revalidatePath("/actielijst");
  return {};
}

export async function plaatsOpmerking(_: ActieResult, fd: FormData): Promise<ActieResult> {
  const user = await requireModule("actielijst");
  try {
    const d = opmerkingInvoer.parse(Object.fromEntries(fd));
    if (!(await plaatsOpmerkingDb(d.itemId, d.body, user.id))) return { error: "Actiepunt niet gevonden." };
    revalidatePath("/actielijst");
    return { itemId: d.itemId, success: "Opmerking geplaatst." };
  } catch {
    return { error: "Opmerking niet geplaatst. Probeer het opnieuw." };
  }
}

/** Een nieuwe persoonlijke link; de oude werkt daarna niet meer. */
export async function vernieuwLink(fd: FormData): Promise<void> {
  await requireModule("actielijst");
  const { vernieuwActielijstLink } = await import("@/lib/actielijst-link");
  const userId = String(fd.get("userId") ?? "");
  if (/^[0-9a-f-]{36}$/.test(userId)) await vernieuwActielijstLink(userId);
  revalidatePath("/actielijst");
}
