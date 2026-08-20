"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOTIFY_RECIPIENTS, NOTIFY_TO } from "@/lib/mail-bcc";

import { db } from "@/lib/db";
import { syncDealFromDocument } from "@/lib/deals";
import { activities, contacts, documents, type DocumentSignature } from "@/lib/db/schema";
import { contractSignedEmail, offerteAcceptedEmail, sendEmail } from "@/lib/email";
import { richtProjectInNaAkkoord } from "@/lib/project-inrichting";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { renderDocumentPdfById } from "@/lib/document-render";
import { uploadDocumentBytes } from "@/lib/storage";
import {
  CONSENT_KEYS,
  CONTRACT_T,
  CONTRACT_TERMS_VERSION,
  buildSnapshot,
  contractChecks,
  contractLang,
  contractSnapshotHash,
} from "@/lib/contract-terms";

// No auth — these are invoked by the client from the public /offerte/[token] page.

async function loadByToken(token: string) {
  return db.query.documents.findFirst({
    where: eq(documents.acceptToken, token),
    with: { contact: { columns: { id: true, name: true, email: true, preferredLanguage: true, taxId: true } } },
  });
}

type OfferteDoc = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

async function notifyTeam(subject: string, html: string, attachments?: { filename: string; content: Uint8Array }[]) {
  await sendEmail({
    to: NOTIFY_TO,
    bcc: NOTIFY_RECIPIENTS.slice(1).join(", ") || undefined,
    subject,
    html,
    attachments,
  });
}

/** Verlopen klantlink? Offertes zijn 30 dagen geldig, de link krijgt 45. */
function isVerlopen(doc: { acceptTokenExpiresAt: Date | null }): boolean {
  return !!doc.acceptTokenExpiresAt && doc.acceptTokenExpiresAt.getTime() < Date.now();
}

async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFromHeaders(h), userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

/**
 * Alles wat er ná een akkoord moet gebeuren — of dat akkoord nu één klik was of
 * een ondertekening. Stond eerst inline in `acceptOfferte`; nu gedeeld, want een
 * tweede kopie van de project-inrichting gaat gegarandeerd uit elkaar lopen.
 */
async function markAccepted(doc: OfferteDoc, signed: DocumentSignature | null) {
  await db.insert(activities).values({
    type: "note",
    subject: `Offerte ${doc.docNumber ?? ""} ${signed ? "ONDERTEKEND" : "GEACCEPTEERD"} door klant`.trim(),
    body: signed
      ? `${signed.name} heeft de aannemingsovereenkomst online ondertekend (${signed.email}, IP ${signed.ip ?? "onbekend"}). Bevestigd: ${signed.confirmed.join(", ")}.`
      : `${doc.contact?.name ?? "De klant"} heeft de offerte online geaccepteerd. Klaar om te factureren.`,
    documentId: doc.id,
    dealId: doc.dealId,
    contactId: doc.contactId,
  });
  await syncDealFromDocument(doc.dealId, {
    kind: doc.kind,
    status: "accepted",
    totalEur: doc.totalEur,
  });
  // Gecalculeerde verbouwings-offerte → project inrichten (aanneemsom,
  // budgetregels, termijn-proforma's) — precies zoals bij intern op
  // "geaccepteerd" zetten. Best-effort: een fout hier mag het akkoord van
  // de klant zelf nooit blokkeren.
  try {
    await richtProjectInNaAkkoord(doc.id, null);
  } catch (e) {
    console.error("[markAccepted] project inrichten na akkoord mislukt:", e);
  }
}

export async function acceptOfferte(token: string) {
  const { ip, userAgent } = await requestContext();
  if (!(await rateLimit(`offerte-accept:${token}`, 10, 3600))) return;
  if (!(await rateLimit(`offerte-accept-ip:${ip}`, 40, 3600))) return;

  const doc = await loadByToken(token);
  if (!doc) return;
  // Alleen offertes kennen accepteren/afwijzen — een factuur/fondos-link mag
  // hiermee nooit van status veranderen (de knop is verborgen, maar de server
  // action is publiek aanroepbaar met een geldig token).
  if (doc.kind !== "estimate") return;
  if (isVerlopen(doc)) return;
  // Een verbouwingsofferte moet ondertekend worden. De knop is vervangen door
  // een link, maar deze action blijft publiek aanroepbaar — zonder deze guard
  // is het hele contract met één POST te omzeilen.
  if (doc.requiresContract && !doc.signature) return;

  if (!doc.acceptedAt) {
    const snapshot = buildSnapshot(doc, contractLang(doc.contact?.preferredLanguage));
    await db
      .update(documents)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        rejectedAt: null,
        rejectReason: null,
        // Ook zonder contract leggen we vast wát er stond en waarvandaan
        // geklikt is. Eén klik blijft één klik voor de klant, maar een
        // badkamerdiscussie van € 4.000 wordt hiermee een document.
        acceptRecord: {
          acceptedAt: new Date().toISOString(),
          snapshotSha256: contractSnapshotHash(snapshot),
          snapshot,
          ip,
          userAgent,
        },
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));
    await markAccepted(doc, null);
    await notifyTeam(
      `✅ Offerte ${doc.docNumber ?? ""} geaccepteerd`.trim(),
      `<p>${doc.contact?.name ?? "Een klant"} heeft offerte ${doc.docNumber ?? ""} geaccepteerd — tijd om te factureren.</p>`,
    );
    // Bevestigingsmail naar de klant, in diens eigen taal.
    if (doc.contact?.email) {
      const mail = offerteAcceptedEmail({
        lang: doc.contact.preferredLanguage,
        docNumber: doc.docNumber ?? "",
        contactName: doc.contact.name,
      });
      await sendEmail({ to: doc.contact.email, ...mail });
    }
  }
  revalidatePath(`/offerte/${token}`);
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath("/quotes");
  revalidatePath("/deals");
  revalidatePath("/");
}

export async function rejectOfferte(token: string, formData: FormData) {
  const { ip } = await requestContext();
  if (!(await rateLimit(`offerte-reject:${token}`, 10, 3600))) return;
  if (!(await rateLimit(`offerte-reject-ip:${ip}`, 40, 3600))) return;

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000) || null;
  const doc = await loadByToken(token);
  if (!doc) return;
  if (doc.kind !== "estimate") return;
  if (doc.signature) return; // een ondertekende overeenkomst wijs je niet met een knop af
  if (!doc.rejectedAt) {
    await db
      .update(documents)
      .set({ status: "rejected", rejectedAt: new Date(), rejectReason: reason, acceptedAt: null })
      .where(eq(documents.id, doc.id));
    await db.insert(activities).values({
      type: "note",
      subject: `Offerte ${doc.docNumber ?? ""} afgewezen door klant`.trim(),
      body: reason ? `Reden: ${reason}` : "Geen reden opgegeven.",
      documentId: doc.id,
      dealId: doc.dealId,
      contactId: doc.contactId,
    });
    await notifyTeam(
      `Offerte ${doc.docNumber ?? ""} afgewezen`.trim(),
      `<p>${doc.contact?.name ?? "Een klant"} heeft offerte ${doc.docNumber ?? ""} afgewezen.${reason ? ` Reden: ${reason}` : ""}</p>`,
    );
  }
  revalidatePath(`/offerte/${token}`);
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath("/quotes");
  revalidatePath("/");
}

/* ─────────────────────────── ondertekenen ─────────────────────────── */

export type SignState = { ok?: string; error?: string } | null;

const signSchema = z.object({
  // Twee woorden: "Jan" is geen ondertekening, "Jan de Vries" wel. Bewust mild —
  // een weigering hier kost een klant die wél wil tekenen.
  name: z.string().trim().min(3).refine((v) => v.split(/\s+/).length >= 2),
  email: z.email(),
  taxId: z.string().trim().max(40).optional(),
  snapshotSha256: z.string().trim().min(16),
});

export async function signContract(
  token: string,
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const { ip, userAgent } = await requestContext();
  const doc = await loadByToken(token);
  if (!doc) return { error: CONTRACT_T.es.expired };

  const lang = contractLang(doc.contact?.preferredLanguage);
  const t = CONTRACT_T[lang];

  // Ruim bemeten: elke mislukte poging (vergeten vinkje, typefout in de naam)
  // telt mee, en een klant buitensluiten die wél wil tekenen is erger dan het
  // misbruik dat we hier afvangen — het token is met 64 tekens toch niet te raden.
  if (!(await rateLimit(`offerte-sign:${token}`, 25, 3600))) return { error: t.tooMany };
  if (!(await rateLimit(`offerte-sign-ip:${ip}`, 60, 3600))) return { error: t.tooMany };

  if (doc.kind !== "estimate" || doc.status === "void") return { error: t.expired };
  if (isVerlopen(doc)) return { error: t.expired };
  if (doc.rejectedAt) return { error: t.expired };
  // Idempotent: dubbel indienen (of een tweede tabblad) maakt geen tweede
  // handtekening en stuurt geen tweede mail.
  if (doc.signature) return { ok: t.alreadySigned };

  const parsed = signSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    taxId: formData.get("taxId") ?? undefined,
    snapshotSha256: formData.get("snapshotSha256"),
  });
  if (!parsed.success) {
    const velden = z.flattenError(parsed.error).fieldErrors;
    if (velden.name) return { error: t.missingName };
    if (velden.email) return { error: t.missingEmail };
    return { error: t.stale };
  }

  const checks = contractChecks(lang);
  const confirmed = CONSENT_KEYS.filter((k) => formData.get(`consent:${k}`) === "on");
  if (confirmed.length !== CONSENT_KEYS.length) return { error: t.missingChecks };

  // De offerte kan zijn bijgewerkt terwijl de klant de pagina open had staan.
  // Zonder deze check tekent hij scherm A terwijl wij akkoord vastleggen op
  // versie B — een klein venster, maar een vervelend venster.
  const snapshot = buildSnapshot(doc, lang);
  const hash = contractSnapshotHash(snapshot);
  if (hash !== parsed.data.snapshotSha256) return { error: t.stale };

  const signature: DocumentSignature = {
    signedAt: new Date().toISOString(),
    name: parsed.data.name,
    email: parsed.data.email,
    taxId: parsed.data.taxId?.trim() || null,
    lang,
    confirmed,
    consentTexts: checks.map((c) => ({ key: c.key, text: c.text })),
    termsVersion: CONTRACT_TERMS_VERSION,
    snapshotSha256: hash,
    snapshot,
    ip,
    userAgent,
    pdfPath: null,
  };

  await db
    .update(documents)
    .set({
      signature,
      status: "accepted",
      acceptedAt: new Date(),
      rejectedAt: null,
      rejectReason: null,
      lockedAt: new Date(),
      unlockedAt: null,
      unlockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));

  await markAccepted(doc, signature);

  // NIE/NIF meenemen als we die nog niet hadden — je hebt hem toch nodig voor
  // de factuur, en de klant heeft hem net ingetypt.
  if (signature.taxId && doc.contact?.id && !doc.contact.taxId) {
    try {
      await db.update(contacts).set({ taxId: signature.taxId }).where(eq(contacts.id, doc.contact.id));
    } catch (e) {
      console.error("[signContract] NIE/NIF overnemen mislukt:", e);
    }
  }

  // PDF renderen, opslaan en versturen. Best-effort in z'n geheel: de
  // handtekening staat al vast en een storings- of mailfout mag die nooit
  // ongeldig maken. De PDF is afgeleid — hij is altijd opnieuw te maken uit de
  // snapshot.
  let pdf: Uint8Array | null = null;
  try {
    const out = await renderDocumentPdfById(doc.id, { signature });
    if (out) {
      pdf = new Uint8Array(out.buf);
      try {
        const opgeslagen = await uploadDocumentBytes(doc.id, out.filename, out.buf);
        await db
          .update(documents)
          .set({ signature: { ...signature, pdfPath: opgeslagen.path } })
          .where(eq(documents.id, doc.id));
      } catch (e) {
        console.error("[signContract] getekende PDF opslaan mislukt:", e);
      }
    }
  } catch (e) {
    console.error("[signContract] getekende PDF renderen mislukt:", e);
  }

  const bijlagen = pdf
    ? [{ filename: `Overeenkomst-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf`, content: pdf }]
    : undefined;
  try {
    await notifyTeam(
      `✍️ Overeenkomst ${doc.docNumber ?? ""} ondertekend`.trim(),
      `<p>${signature.name} heeft de aannemingsovereenkomst bij offerte ${doc.docNumber ?? ""} ondertekend.</p>
       <p>E-mail: ${signature.email}<br/>IP: ${signature.ip ?? "onbekend"}<br/>Vingerafdruk: ${hash.slice(0, 12)}</p>`,
      bijlagen,
    );
    const ontvanger = doc.contact?.email ?? signature.email;
    if (ontvanger) {
      const mail = contractSignedEmail({
        lang,
        docNumber: doc.docNumber ?? "",
        contactName: signature.name,
        signedAt: new Date(signature.signedAt),
      });
      await sendEmail({ to: ontvanger, ...mail, attachments: bijlagen });
    }
  } catch (e) {
    console.error("[signContract] mails versturen mislukt:", e);
  }

  revalidatePath(`/offerte/${token}`);
  revalidatePath(`/offerte/${token}/contract`);
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath("/quotes");
  revalidatePath("/deals");
  revalidatePath("/");
  return { ok: t.alreadySigned };
}
