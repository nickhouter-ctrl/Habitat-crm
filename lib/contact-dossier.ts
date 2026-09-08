/**
 * AI-dossier per contact: een korte feiten-samenvatting op de contactkaart
 * (idee overgenomen uit Comp AI's "agent-first CRM"-principe: niets over een
 * persoon wordt geraden — alleen waargenomen feiten uit onze eigen data).
 *
 * Zelfde AI-conventies als lib/ai-reply.ts: Anthropic via fetch, model uit
 * ANTHROPIC_MODEL, null bij ontbrekende key of fout (het oude dossier blijft
 * dan gewoon staan). Verversen kan met de knop op de contactkaart en 's
 * nachts automatisch voor contacten waar die dag iets gebeurde.
 */
import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  activities,
  contacts,
  documents,
  emailInbox,
  projects,
  sentEmails,
} from "@/lib/db/schema";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/** Is er een API-sleutel? (Voor de UI: kaart/knop tonen of verbergen.) */
export function dossierConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const d = (v: Date | string | null | undefined): string =>
  v ? new Date(v).toISOString().slice(0, 10) : "?";

const eur = (v: unknown): string => `€ ${Number(v ?? 0).toFixed(2)}`;

/** Verzamel de feiten en laat de AI er een kort dossier van schrijven.
 *  Slaat het resultaat op de contactrij op; null bij fout of ontbrekende key. */
export async function genereerContactDossier(contactId: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!contact) return null;

  const [projectRows, docRows, actRows, uitRows, inRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.contactId, contactId)).limit(20),
    db
      .select({
        kind: documents.kind,
        docNumber: documents.docNumber,
        title: documents.title,
        status: documents.status,
        totalEur: documents.totalEur,
        paidEur: documents.paidEur,
        sentAt: documents.sentAt,
        acceptedAt: documents.acceptedAt,
        rejectedAt: documents.rejectedAt,
        dueDate: documents.dueDate,
        issueDate: documents.issueDate,
      })
      .from(documents)
      .where(and(eq(documents.contactId, contactId), sql`${documents.status} <> 'void'`))
      .orderBy(desc(documents.createdAt))
      .limit(40),
    db
      .select({
        type: activities.type,
        subject: activities.subject,
        body: activities.body,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(eq(activities.contactId, contactId))
      .orderBy(desc(activities.createdAt))
      .limit(25),
    contact.email
      ? db
          .select({ subject: sentEmails.subject, createdAt: sentEmails.createdAt })
          .from(sentEmails)
          .where(ilike(sentEmails.toEmail, contact.email))
          .orderBy(desc(sentEmails.createdAt))
          .limit(15)
      : Promise.resolve([]),
    contact.email
      ? db
          .select({ subject: emailInbox.subject, receivedAt: emailInbox.receivedAt })
          .from(emailInbox)
          .where(ilike(emailInbox.fromEmail, contact.email))
          .orderBy(desc(emailInbox.receivedAt))
          .limit(15)
      : Promise.resolve([]),
  ]);

  const feiten = `CONTACT
Naam: ${contact.name}${contact.email ? ` · ${contact.email}` : ""}${contact.phone ? ` · ${contact.phone}` : ""}
Type/fase: ${contact.type} / ${contact.stage}${contact.source ? ` · bron: ${contact.source}` : ""} · taal: ${contact.preferredLanguage ?? "?"}
${contact.notes ? `Notitie team: ${contact.notes}` : ""}

PROJECTEN (${projectRows.length})
${projectRows.map((p) => `- ${p.name} · status ${p.status}`).join("\n") || "- geen"}

DOCUMENTEN (${docRows.length}, nieuwste eerst)
${
  docRows
    .map(
      (doc) =>
        `- ${doc.kind} ${doc.docNumber ?? ""} "${doc.title ?? ""}" · ${doc.status} · ${eur(doc.totalEur)} (betaald ${eur(doc.paidEur)})` +
        `${doc.sentAt ? ` · verstuurd ${d(doc.sentAt)}` : ""}${doc.acceptedAt ? ` · geaccepteerd ${d(doc.acceptedAt)}` : ""}${doc.rejectedAt ? ` · afgewezen ${d(doc.rejectedAt)}` : ""}${doc.dueDate ? ` · vervalt ${doc.dueDate}` : ""}`,
    )
    .join("\n") || "- geen"
}

LOGBOEK (${actRows.length}, nieuwste eerst)
${
  actRows
    .map((a) => `- ${d(a.createdAt)} [${a.type}] ${a.subject ?? ""} ${a.body ? `— ${a.body.slice(0, 160)}` : ""}`)
    .join("\n") || "- geen"
}

MAILS VAN ONS NAAR KLANT (${uitRows.length})
${uitRows.map((m) => `- ${d(m.createdAt)} "${m.subject ?? ""}"`).join("\n") || "- geen"}

MAILS VAN KLANT NAAR ONS (${inRows.length})
${inRows.map((m) => `- ${d(m.receivedAt)} "${m.subject ?? ""}"`).join("\n") || "- geen"}`;

  const prompt = `Schrijf een kort intern dossier (Nederlands) over deze klant voor het team van Habitat One (renovatie- en interieurbedrijf, Costa Blanca). STRIKTE REGEL: gebruik UITSLUITEND de feiten hieronder — niets aannemen, niets erbij verzinnen, geen inschattingen van karakter of intenties. Ontbreekt iets, laat het weg.

Structuur (kopjes exact zo, kopje weglaten als er niets is):
**Wie** — 1-2 zinnen: wie is dit, hoe binnengekomen.
**Laatste contact** — datum + richting (wij→klant of klant→wij) van het recentste contactmoment.
**Loopt nu** — projecten/offertes/aanvragen met status.
**Openstaand** — bedragen die nog betaald moeten worden of waar we op wachten.
**Aandachtspunten** — concrete vervolgacties die uit de feiten volgen (bv. "offerte X is N dagen stil").

Maximaal ~200 woorden, puntsgewijs waar het kan. Vandaag is ${new Date().toISOString().slice(0, 10)}.

=== FEITEN ===
${feiten.slice(0, 12_000)}
=== EINDE FEITEN ===`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-dossier faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const tekst = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n")
      .trim();
    if (!tekst) return null;

    await db
      .update(contacts)
      .set({ aiDossier: tekst, aiDossierAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, contactId));
    return tekst;
  } catch (err) {
    console.warn("AI-dossier error:", err);
    return null;
  }
}

/**
 * Nachtelijke run: ververs dossiers van contacten waar de afgelopen 24 uur
 * iets gebeurde (logboek, uitgaande of binnenkomende mail, document
 * verstuurd). Cap begrenst de AI-kosten per nacht.
 */
export async function verversDossiersMetRecenteActiviteit(
  limiet = 20,
): Promise<{ ok: boolean; kandidaten: number; ververst: number }> {
  if (!dossierConfigured()) return { ok: true, kandidaten: 0, ververst: 0 };

  const gisteren = sql`now() - interval '24 hours'`;
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      or(
        sql`exists (select 1 from ${activities} where ${activities.contactId} = ${contacts.id} and ${activities.createdAt} > ${gisteren})`,
        sql`exists (select 1 from ${documents} where ${documents.contactId} = ${contacts.id} and ${documents.sentAt} > ${gisteren})`,
        sql`${contacts.email} is not null and ${contacts.email} <> '' and exists (select 1 from ${sentEmails} where lower(${sentEmails.toEmail}) = lower(${contacts.email}) and ${sentEmails.createdAt} > ${gisteren})`,
        sql`${contacts.email} is not null and ${contacts.email} <> '' and exists (select 1 from ${emailInbox} where lower(${emailInbox.fromEmail}) = lower(${contacts.email}) and ${emailInbox.receivedAt} > ${gisteren})`,
      ),
    )
    .limit(limiet);

  let ververst = 0;
  for (const r of rows) {
    const resultaat = await genereerContactDossier(r.id);
    if (resultaat) ververst++;
  }
  return { ok: true, kandidaten: rows.length, ververst };
}
