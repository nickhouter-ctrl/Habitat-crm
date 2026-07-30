/**
 * Meldingen over inkoopfacturen die op goedkeuring wachten.
 *
 * Twee vormen:
 * - **Direct**: één mail per poll-ronde over wat er net binnenkwam. Bewust één
 *   mail per ronde en niet per factuur — een Allpack-mail met drie bijlagen of
 *   een inhaalslag van twintig facturen mag geen twintig berichten opleveren.
 * - **Ochtendsamenvatting**: alles wat openstaat, oudste eerst. Verstuurt niets
 *   als er niets openstaat.
 */
import { randomBytes } from "node:crypto";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { purchaseInvoiceReviews } from "@/lib/db/schema";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { NOTIFY_RECIPIENTS } from "@/lib/mail-bcc";
import { formatEUR } from "@/lib/utils";

const APP_URL = process.env.APP_URL?.replace(/\/$/, "") ?? "https://crm.habitat-one.com";

/** Ontvangers van factuurmeldingen: eigen env, anders de algemene notify-lijst. */
function ontvangers(): { to: string; bcc?: string } {
  const eigen = (process.env.INVOICE_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const lijst = eigen.length > 0 ? eigen : NOTIFY_RECIPIENTS;
  return { to: lijst[0], bcc: lijst.slice(1).join(", ") || undefined };
}

/**
 * Token voor de knoppen in de mail: beoordelen zonder inloggen. Vervalt na twee
 * weken en wordt ongeldig zodra de factuur is afgehandeld.
 *
 * Let op: de LINK doet niets — die opent een bevestigingspagina. Mailscanners
 * halen links in mail automatisch op, dus een link die zélf goedkeurt zou
 * facturen goedkeuren die niemand heeft gezien.
 */
async function ensureActionToken(reviewId: string, bestaand: string | null): Promise<string> {
  if (bestaand) return bestaand;
  const token = randomBytes(24).toString("base64url");
  await db
    .update(purchaseInvoiceReviews)
    .set({
      actionToken: token,
      actionTokenExpiresAt: new Date(Date.now() + 14 * 86_400_000),
      updatedAt: new Date(),
    })
    .where(eq(purchaseInvoiceReviews.id, reviewId));
  return token;
}

const VERDICT_LABEL: Record<string, string> = {
  ok: "✅ compleet",
  warn: "⚠️ let op",
  reject: "⛔ incompleet",
  unreadable: "❓ niet gelezen",
  pending: "· nog niet beoordeeld",
};

type Regel = {
  id: string;
  supplier: string | null;
  reference: string | null;
  total: string | null;
  verdict: string;
  findings: unknown;
  dagen: number;
  /** Voor de knoppen in de mail; wordt aangemaakt bij de eerste melding. */
  token?: string | null;
};

function ontbrekend(findings: unknown): string {
  if (!Array.isArray(findings)) return "";
  return (findings as { label: string; ok: boolean; skipped?: boolean; internal?: boolean }[])
    .filter((c) => !c.ok && !c.skipped && !c.internal)
    .map((c) => c.label.toLowerCase())
    .slice(0, 4)
    .join(", ");
}

function tabel(regels: Regel[], toonLeeftijd = false): string {
  const rijen = regels
    .slice(0, 25)
    .map((r) => {
      const mist = ontbrekend(r.findings);
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.supplier ?? "onbekend")}<br>
          <span style="color:#888;font-size:12px">${escapeHtml(r.reference ?? "")}${toonLeeftijd && r.dagen > 0 ? ` · wacht ${r.dagen} dag${r.dagen === 1 ? "" : "en"}` : ""}</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${r.total ? formatEUR(Number(r.total)) : "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${VERDICT_LABEL[r.verdict] ?? r.verdict}${mist ? `<br><span style="color:#888;font-size:12px">${escapeHtml(mist)}</span>` : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap">${
          r.token
            ? `<a href="${APP_URL}/inkoop/keuren/${r.token}" style="display:inline-block;padding:6px 12px;background:#3a2a20;color:#fff;border-radius:6px;text-decoration:none;font-size:13px">Goedkeuren</a>
               <a href="${APP_URL}/inkoop/keuren/${r.token}#afkeuren" style="display:inline-block;padding:6px 12px;border:1px solid #ccc;border-radius:6px;text-decoration:none;color:#333;font-size:13px;margin-left:4px">Afkeuren</a>`
            : `<a href="${APP_URL}/inkooporders/te-verwerken">beoordelen</a>`
        }</td>
      </tr>`;
    })
    .join("");
  const rest = regels.length > 25 ? `<p style="color:#888">en nog ${regels.length - 25} andere.</p>` : "";
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rijen}</table>${rest}`;
}

/**
 * Meldt de facturen die in deze poll-ronde zijn binnengekomen. `notified_at`
 * voorkomt dat dezelfde factuur twee keer gemeld wordt; die wordt gezet
 * ongeacht of de mail aankwam (at-most-once, zoals bij de leveringsherinneringen).
 */
export async function notifyNewInvoiceReviews(reviewIds: string[]): Promise<{ sent: boolean; count: number }> {
  if (reviewIds.length === 0) return { sent: false, count: 0 };

  const regels = await db
    .select({
      id: purchaseInvoiceReviews.id,
      supplier: purchaseInvoiceReviews.proposedSupplier,
      reference: purchaseInvoiceReviews.proposedReference,
      total: purchaseInvoiceReviews.proposedTotal,
      verdict: purchaseInvoiceReviews.verdict,
      findings: purchaseInvoiceReviews.findings,
      token: purchaseInvoiceReviews.actionToken,
      dagen: sql<number>`0`,
    })
    .from(purchaseInvoiceReviews)
    .where(
      and(
        inArray(purchaseInvoiceReviews.id, reviewIds),
        isNull(purchaseInvoiceReviews.notifiedAt),
        eq(purchaseInvoiceReviews.status, "pending"),
      ),
    );
  if (regels.length === 0) return { sent: false, count: 0 };

  // Tokens aanmaken zodat de knoppen in de mail werken. Een bestaande token
  // hergebruiken, anders zou de link uit een eerdere melding dood raken.
  const metToken = await Promise.all(
    regels.map(async (r) => ({ ...r, token: await ensureActionToken(r.id, r.token) })),
  );

  const { to, bcc } = ontvangers();
  const aantal = regels.length;
  const som = regels.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const html = brandedEmail(`
    <p><strong>${aantal} nieuwe inkoopfactu${aantal === 1 ? "ur" : "ren"}</strong> ter goedkeuring — samen ${escapeHtml(formatEUR(som))}.</p>
    ${tabel(metToken)}
    <p style="color:#888;font-size:13px">Zolang een factuur niet is goedgekeurd telt hij niet mee in de projectkosten en gaat hij niet naar Holded.</p>
    <p><a href="${APP_URL}/inkooporders/te-verwerken">Alle facturen beoordelen</a></p>
  `);
  const text = [
    `${aantal} nieuwe inkoopfactu${aantal === 1 ? "ur" : "ren"} ter goedkeuring (samen ${formatEUR(som)}):`,
    "",
    ...regels.map(
      (r) =>
        `- ${r.supplier ?? "onbekend"} ${r.reference ?? ""} · ${r.total ? formatEUR(Number(r.total)) : "—"} · ${VERDICT_LABEL[r.verdict] ?? r.verdict}${ontbrekend(r.findings) ? ` (${ontbrekend(r.findings)})` : ""}`,
    ),
    "",
    `${APP_URL}/inkooporders/te-verwerken`,
  ].join("\n");

  const res = await sendEmail({
    to,
    bcc,
    subject: `${aantal} inkoopfactu${aantal === 1 ? "ur" : "ren"} ter goedkeuring`,
    html,
    text,
  });

  // Ook bij een mislukte verzending markeren: liever een gemiste melding dan
  // elke ronde opnieuw dezelfde mail.
  await db
    .update(purchaseInvoiceReviews)
    .set({ notifiedAt: new Date(), updatedAt: new Date() })
    .where(inArray(purchaseInvoiceReviews.id, regels.map((r) => r.id)));

  return { sent: res.sent, count: regels.length };
}

/** Ochtendsamenvatting van alles wat openstaat. */
export async function runPurchaseInvoiceDigest(): Promise<{
  ok: boolean;
  pending: number;
  sent: boolean;
  reason?: string;
}> {
  if (process.env.PURCHASE_INVOICE_DIGEST_ENABLED === "false") {
    return { ok: true, pending: 0, sent: false, reason: "uitgeschakeld" };
  }

  const regels = await db
    .select({
      id: purchaseInvoiceReviews.id,
      supplier: purchaseInvoiceReviews.proposedSupplier,
      reference: purchaseInvoiceReviews.proposedReference,
      total: purchaseInvoiceReviews.proposedTotal,
      verdict: purchaseInvoiceReviews.verdict,
      findings: purchaseInvoiceReviews.findings,
      token: purchaseInvoiceReviews.actionToken,
      dagen: sql<number>`greatest(0, extract(day from now() - ${purchaseInvoiceReviews.createdAt})::int)`,
    })
    .from(purchaseInvoiceReviews)
    .where(eq(purchaseInvoiceReviews.status, "pending"))
    .orderBy(asc(purchaseInvoiceReviews.createdAt));

  // Niets te melden = geen mail. Het dashboard is de altijd-zichtbare waarheid.
  if (regels.length === 0) return { ok: true, pending: 0, sent: false, reason: "niets openstaand" };

  const metToken = await Promise.all(
    regels.map(async (r) => ({ ...r, token: await ensureActionToken(r.id, r.token) })),
  );

  const { to, bcc } = ontvangers();
  const som = regels.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const oud = regels.filter((r) => r.dagen >= 7);
  const incompleet = regels.filter((r) => r.verdict === "reject");
  const onleesbaar = regels.filter((r) => r.verdict === "unreadable");

  const html = brandedEmail(`
    <p><strong>${regels.length} inkoopfactu${regels.length === 1 ? "ur" : "ren"}</strong> wacht${regels.length === 1 ? "" : "en"} op goedkeuring — samen ${escapeHtml(formatEUR(som))}.</p>
    ${oud.length > 0 ? `<p style="color:#b6552d"><strong>${oud.length}</strong> wacht${oud.length === 1 ? "" : "en"} al langer dan een week.</p>` : ""}
    ${incompleet.length > 0 ? `<p>${incompleet.length} incompleet — terug te sturen naar de leverancier.</p>` : ""}
    ${onleesbaar.length > 0 ? `<p>${onleesbaar.length} kon de uitlezing niet lezen — handmatig bekijken.</p>` : ""}
    ${tabel(metToken, true)}
    <p><a href="${APP_URL}/inkooporders/te-verwerken">Beoordelen</a></p>
  `);
  const text = [
    `${regels.length} inkoopfacturen wachten op goedkeuring (samen ${formatEUR(som)}).`,
    oud.length > 0 ? `${oud.length} wacht(en) al langer dan een week.` : "",
    "",
    ...regels.map(
      (r) =>
        `- ${r.supplier ?? "onbekend"} ${r.reference ?? ""} · ${r.total ? formatEUR(Number(r.total)) : "—"} · ${VERDICT_LABEL[r.verdict] ?? r.verdict}${r.dagen > 0 ? ` · ${r.dagen}d` : ""}`,
    ),
    "",
    `${APP_URL}/inkooporders/te-verwerken`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await sendEmail({
    to,
    bcc,
    subject: `${regels.length} inkoopfactu${regels.length === 1 ? "ur" : "ren"} te keuren${oud.length ? ` · ${oud.length} langer dan een week` : ""}`,
    html,
    text,
  });
  return { ok: true, pending: regels.length, sent: res.sent, reason: res.reason };
}
