"use server";
/**
 * De actielijst bijwerken via een persoonlijke link, dus zonder sessie. Het
 * token in het formulier is de enige legitimatie; verder gaat alles door
 * dezelfde controles en queries als de pagina in het CRM
 * (`lib/actielijst-db.ts`).
 *
 * Bewust gewone formulieren met een redirect erna: zo werkt de lijst op een
 * telefoon ook zonder JavaScript, en raakt niemand een wijziging kwijt door een
 * halve verbinding.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actielijstLinkVoorToken } from "@/lib/actielijst-link";
import { actiepuntInvoer, bewaarActiepuntDb, opmerkingInvoer, plaatsOpmerkingDb, zetArchiefDb, zetKlaarDb } from "@/lib/actielijst-db";

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
const punt = z.string().uuid();

async function viaLink(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/login");
  const lid = await actielijstLinkVoorToken(token);
  // Ingetrokken of niet meer toegestaan: de pagina legt het uit, hier gebeurt niets.
  if (!lid) redirect(`/lijst/${token}`);
  return { token, lid };
}

/** Terug naar precies dezelfde lijst, bij het punt waar je was. */
function terug(fd: FormData, token: string, melding?: string, itemId?: string): never {
  const ruw = String(fd.get("terug") ?? "");
  const query = /^\?[A-Za-z0-9=&_-]{0,100}$/.test(ruw) ? ruw : "";
  const params = new URLSearchParams(query.slice(1));
  if (melding) params.set("melding", melding); else params.delete("melding");
  const zoek = params.toString();
  redirect(`/lijst/${token}${zoek ? `?${zoek}` : ""}${itemId ? `#punt-${itemId}` : ""}`);
}

export async function puntBewarenViaLink(fd: FormData) {
  const { token, lid } = await viaLink(fd);
  let melding: string | undefined, itemId: string | undefined;
  try {
    const d = actiepuntInvoer.parse(Object.fromEntries(fd));
    itemId = d.nieuw === "1" ? undefined : d.id;
    const uit = await bewaarActiepuntDb(d, lid.userId);
    melding = "fout" in uit ? (uit.fout === "deadline" ? "deadline" : uit.fout === "verantwoordelijke" ? "wie" : "weg") : undefined;
  } catch {
    melding = "invoer";
  }
  revalidatePath(`/lijst/${token}`);
  terug(fd, token, melding, itemId);
}

export async function klaarViaLink(fd: FormData) {
  const { token, lid } = await viaLink(fd);
  const id = punt.safeParse(fd.get("id"));
  let melding: string | undefined;
  if (!id.success) melding = "invoer";
  else if (!(await zetKlaarDb(id.data, fd.get("klaar") === "1", lid.userId).catch(() => false))) melding = "weg";
  revalidatePath(`/lijst/${token}`);
  terug(fd, token, melding, id.success ? id.data : undefined);
}

export async function opmerkingViaLink(fd: FormData) {
  const { token, lid } = await viaLink(fd);
  let melding: string | undefined, itemId: string | undefined;
  try {
    const d = opmerkingInvoer.parse(Object.fromEntries(fd));
    itemId = d.itemId;
    if (!(await plaatsOpmerkingDb(d.itemId, d.body, lid.userId))) melding = "weg";
  } catch {
    melding = "opmerking";
  }
  revalidatePath(`/lijst/${token}`);
  terug(fd, token, melding, itemId);
}

export async function archiefViaLink(fd: FormData) {
  const { token, lid } = await viaLink(fd);
  const id = punt.safeParse(fd.get("id"));
  let melding: string | undefined;
  if (!id.success) melding = "invoer";
  else if (!(await zetArchiefDb(id.data, fd.get("archief") === "1", lid.userId).catch(() => false))) melding = "weg";
  revalidatePath(`/lijst/${token}`);
  terug(fd, token, melding);
}
