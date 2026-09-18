"use server";

import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { prospectImports, prospects } from "@/lib/db/schema";
import { parseTable, splitHeader } from "@/lib/import/parse-table";
import { bekendeGegevens, droogloop, leesBestand } from "@/lib/leads/import-run";
import { suggestMapping, type ProspectField } from "@/lib/leads/prospect-columns";
import { planProspectImport } from "@/lib/leads/prospect-import";
import { fetchProspectListBytes, signProspectListUpload } from "@/lib/storage";

/** Rijen per insert. 7.000 rijen zijn zo 35 queries in plaats van 7.000. */
const CHUNK = 200;
/** Rijen per ronde. Meer past meestal wel, maar dit houdt de knop responsief. */
const RONDE_MAX = 3_000;
/** Kolomkoppen inlezen kost niets; hele rijen lezen wel. */
const VOORBEELD_RIJEN = 25;

const requireUser = () => requireModule("leads");
const token = () => randomBytes(24).toString("base64url");

/** Signed upload-URL — de browser stuurt het bestand rechtstreeks naar Storage. */
export async function signImportUpload(filename: string, contentType?: string) {
  await requireUser();
  return signProspectListUpload(filename, contentType);
}

const registerSchema = z.object({
  path: z.string().min(3),
  filename: z.string().min(1),
  label: z.string().trim().min(1, "Geef de lijst een naam"),
  provenance: z.string().trim().min(3, "Vul in waar deze lijst vandaan komt"),
  vendor: z.string().trim().optional().or(z.literal("")),
  vendorRef: z.string().trim().optional().or(z.literal("")),
  acquiredAt: z.string().trim().optional().or(z.literal("")),
  defaultCategory: z.enum(["architect", "aannemer", "makelaar", "interieur", "projectontwikkelaar", "hovenier", "overig"]).default("overig"),
  language: z.enum(["es", "nl", "en", "de"]).default("es"),
});

/**
 * Stap 1: het geüploade bestand registreren. We lezen alleen de kopregel en een
 * paar rijen — genoeg om de kolommen voor te stellen, zonder 7.000 rijen door
 * het geheugen te halen.
 */
export async function registerImport(formData: FormData) {
  const user = await requireUser();
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/leads/import?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const d = parsed.data;

  const bytes = await fetchProspectListBytes(d.path);
  if (!bytes) redirect("/leads/import?error=Bestand+niet+gevonden+in+opslag");

  const tabel = parseTable(bytes, d.filename, { maxRows: VOORBEELD_RIJEN + 5 });
  const blad = tabel.sheets[0];
  if (!blad || blad.rows.length === 0) redirect("/leads/import?error=Het+bestand+lijkt+leeg");

  const { headers } = splitHeader(blad, 1);
  const voorstel = suggestMapping(headers);

  const [rij] = await db
    .insert(prospectImports)
    .values({
      label: d.label,
      filename: d.filename,
      storagePath: d.path,
      sheetName: blad.name,
      headerRow: 1,
      mapping: voorstel.mapping,
      defaultCategory: d.defaultCategory,
      language: d.language,
      provenance: d.provenance,
      vendor: d.vendor || null,
      vendorRef: d.vendorRef || null,
      acquiredAt: d.acquiredAt ? new Date(d.acquiredAt) : null,
      status: "uploaded",
      createdById: user.id,
    })
    .returning({ id: prospectImports.id });

  revalidatePath("/leads/import");
  redirect(`/leads/import/${rij.id}`);
}

const mappingSchema = z.object({
  sheetName: z.string().min(1),
  headerRow: z.coerce.number().int().min(1).max(20),
  /** JSON-array met per kolom het gekozen veld. */
  mapping: z.string(),
});

/** Stap 2: de kolomkeuze opslaan. De droogloop draait daarna bij het openen. */
export async function setImportMapping(id: string, formData: FormData) {
  await requireUser();
  const parsed = mappingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/leads/import/${id}?error=Kolomkeuze+niet+geldig`);
  const mapping = JSON.parse(parsed.data.mapping) as (ProspectField | null)[];

  await db
    .update(prospectImports)
    .set({
      sheetName: parsed.data.sheetName,
      headerRow: parsed.data.headerRow,
      mapping,
      status: "analyzed",
      updatedAt: new Date(),
    })
    .where(eq(prospectImports.id, id));
  revalidatePath(`/leads/import/${id}`);
}

/**
 * Stap 3: de droogloop vastleggen. Het scherm rekent hem zelf ook uit (via
 * `droogloop()`); deze actie zet de uitkomst in de batch zodat het overzicht
 * de getallen kan tonen zonder het bestand opnieuw te lezen.
 */
export async function analyzeImport(id: string): Promise<void> {
  await requireUser();
  const batch = await db.query.prospectImports.findFirst({ where: eq(prospectImports.id, id) });
  if (!batch) throw new Error("Deze import bestaat niet (meer).");
  const { plan } = await droogloop(batch);

  await db
    .update(prospectImports)
    .set({
      totalRows: plan.totaal,
      duplicateCount: plan.overgeslagen["dubbel-in-bestand"] + plan.overgeslagen["al-prospect"],
      invalidCount: plan.overgeslagen["ongeldig-adres"] + plan.overgeslagen["rol-adres"] + plan.overgeslagen["zonder-naam"],
      skippedContactCount: plan.overgeslagen["al-contact"],
      status: batch.status === "uploaded" ? "analyzed" : batch.status,
      updatedAt: new Date(),
    })
    .where(eq(prospectImports.id, id));
  revalidatePath(`/leads/import/${id}`);
}

/**
 * Stap 4: wegschrijven. In blokken, met `processedRows` als cursor, zodat een
 * time-out of een deploy midden in de import niets kapotmaakt: de volgende
 * ronde gaat verder waar deze stopte, en dubbele rijen kunnen niet ontstaan
 * omdat de unieke index op lower(email) dat afvangt.
 */
export async function applyImport(id: string): Promise<{ klaar: boolean; verwerkt: number; totaal: number; toegevoegd: number }> {
  await requireUser();
  const batch = await db.query.prospectImports.findFirst({ where: eq(prospectImports.id, id) });
  if (!batch) throw new Error("Deze import bestaat niet (meer).");
  if (batch.status === "done") return { klaar: true, verwerkt: batch.processedRows, totaal: batch.totalRows, toegevoegd: batch.insertedCount };

  const gelezen = await leesBestand(batch);
  const plan = planProspectImport(gelezen.rijen, await bekendeGegevens(gelezen.rijen));
  const teDoen = plan.nieuw.slice(batch.processedRows);
  const nu = teDoen.slice(0, RONDE_MAX);

  await db.update(prospectImports).set({ status: "applying", totalRows: plan.totaal, updatedAt: new Date() }).where(eq(prospectImports.id, id));

  const herkomst = [
    "B2B — ",
    batch.vendor ? `lijst ${batch.vendor}` : batch.provenance,
    batch.acquiredAt ? `, ${batch.acquiredAt.toISOString().slice(0, 10)}` : "",
    `, batch "${batch.label}"`,
  ].join("");

  let toegevoegd = batch.insertedCount;
  let verwerkt = batch.processedRows;

  for (let i = 0; i < nu.length; i += CHUNK) {
    const blok = nu.slice(i, i + CHUNK);
    const gezet = await db
      .insert(prospects)
      .values(
        blok.map((n) => ({
          companyName: n.companyName!,
          category: batch.defaultCategory,
          email: n.email ?? null,
          website: n.website ?? null,
          phone: n.phone ?? null,
          addressLine: n.addressLine ?? null,
          postalCode: n.postalCode ?? null,
          city: n.city ?? null,
          province: n.province ?? null,
          country: n.country ?? "ES",
          sector: n.sector ?? null,
          contactPersonName: n.contactPersonName ?? null,
          tags: n.tags ?? null,
          notes: n.notes ?? null,
          source: "import" as const,
          status: "new" as const,
          lawfulBasisNote: herkomst,
          importId: batch.id,
          unsubscribeToken: token(),
        })),
      )
      // Geen target: dekt zowel lower(email) als de token-index. Een rij die al
      // bestaat wordt stil overgeslagen, precies wat de droogloop voorspelde.
      .onConflictDoNothing()
      .returning({ id: prospects.id });

    toegevoegd += gezet.length;
    verwerkt += blok.length;
    await db
      .update(prospectImports)
      .set({ processedRows: verwerkt, insertedCount: toegevoegd, updatedAt: new Date() })
      .where(eq(prospectImports.id, id));
  }

  const klaar = verwerkt >= plan.nieuw.length;
  await db
    .update(prospectImports)
    .set({ status: klaar ? "done" : "applying", updatedAt: new Date() })
    .where(eq(prospectImports.id, id));

  revalidatePath("/leads");
  revalidatePath("/leads/prospects");
  revalidatePath(`/leads/import/${id}`);
  return { klaar, verwerkt, totaal: plan.nieuw.length, toegevoegd };
}

/**
 * Een hele batch terugdraaien. Alleen de prospects die nog niets hebben
 * meegemaakt gaan weg: wie al gemaild is of al contact is geworden, blijft —
 * die rij is geen importrestje meer maar geschiedenis.
 */
export async function deleteImportBatch(id: string) {
  await requireUser();
  await db
    .delete(prospects)
    .where(and(eq(prospects.importId, id), eq(prospects.status, "new"), sql`${prospects.lastEmailedAt} is null`));
  await db.delete(prospectImports).where(eq(prospectImports.id, id));
  revalidatePath("/leads/import");
  revalidatePath("/leads/prospects");
  redirect("/leads/import?verwijderd=1");
}
