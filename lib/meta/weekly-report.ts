/**
 * Wekelijkse advertentie-mail (maandagochtend): per campagne bereik,
 * weergaven, klikken, leads en uitgaven van de afgelopen 7 dagen, plus het
 * aantal Instagram-volgers. Gaat naar Nick, Frederique, Hans en Elles.
 */
import "server-only";

import { sendEmail } from "@/lib/email";
import { adAccountPath, meta } from "./client";

type Action = { action_type: string; value: string };
export type CampaignInsight = {
  campaign_name: string;
  reach?: string;
  impressions?: string;
  inline_link_clicks?: string;
  spend?: string;
  actions?: Action[];
};

/** Nick, Frederique, Hans en Elles (hi@ = Elles). */
export const REPORT_RECIPIENTS = [
  "nick@habitat-one.com",
  "frederique@habitat-one.com",
  "hans@habitat-one.com",
  "hi@habitat-one.com",
] as const;

const LEAD_TYPES = new Set(["offsite_conversion.fb_pixel_lead", "lead", "onsite_conversion.lead_grouped"]);

/** Leads (pixel/formulier) uit Meta's actions-lijst; telt elk type één keer. */
export function leadCount(actions: Action[] = []): number {
  return actions.filter((a) => LEAD_TYPES.has(a.action_type)).reduce((n, a) => n + Number(a.value || 0), 0);
}

const num = (v?: string) => Number(v ?? 0);
const eur = (v: number) => `€ ${v.toFixed(2).replace(".", ",")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderReport(rows: CampaignInsight[], followers: number | null) {
  const total = rows.reduce(
    (t, r) => ({
      reach: t.reach + num(r.reach),
      clicks: t.clicks + num(r.inline_link_clicks),
      leads: t.leads + leadCount(r.actions),
      spend: t.spend + num(r.spend),
    }),
    { reach: 0, clicks: 0, leads: 0, spend: 0 },
  );
  const lines = rows.map(
    (r) =>
      `${r.campaign_name}: bereik ${num(r.reach)}, weergaven ${num(r.impressions)}, klikken ${num(r.inline_link_clicks)}, leads ${leadCount(r.actions)}, uitgegeven ${eur(num(r.spend))}`,
  );
  const text = [
    "Advertenties afgelopen 7 dagen",
    "",
    ...(lines.length ? lines : ["Geen vertoningen deze week."]),
    "",
    `Totaal: bereik ${total.reach}, klikken ${total.clicks}, leads ${total.leads}, uitgegeven ${eur(total.spend)}`,
    followers !== null ? `Instagram-volgers nu: ${followers}` : "",
  ].join("\n");
  const td = (s: string | number) => `<td style="padding:6px 10px;border-bottom:1px solid #e8dfd0">${s}</td>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2a2520">
<h2 style="color:#3a2a20">Advertenties — afgelopen 7 dagen</h2>
<table style="border-collapse:collapse;font-size:14px">
<tr style="background:#f3efe9">${["Campagne", "Bereik", "Weergaven", "Klikken", "Leads", "Uitgegeven"].map((h) => `<th style="padding:6px 10px;text-align:left">${h}</th>`).join("")}</tr>
${rows.map((r) => `<tr>${td(esc(r.campaign_name))}${td(num(r.reach))}${td(num(r.impressions))}${td(num(r.inline_link_clicks))}${td(leadCount(r.actions))}${td(eur(num(r.spend)))}</tr>`).join("\n") || `<tr>${td("Geen vertoningen deze week")}</tr>`}
<tr style="font-weight:bold">${td("Totaal")}${td(total.reach)}${td("")}${td(total.clicks)}${td(total.leads)}${td(eur(total.spend))}</tr>
</table>
${followers !== null ? `<p>Instagram-volgers nu: <b>${followers}</b></p>` : ""}
<p style="color:#7a6f63;font-size:12px">Automatisch verstuurd door het CRM. Elke nieuwe post wordt vanzelf geadverteerd; posts ouder dan 3 weken gaan uit.</p>
</div>`;
  return { text, html, total };
}

export async function sendWeeklyAdReport(): Promise<{ ok: boolean; emailed: boolean; total: ReturnType<typeof renderReport>["total"] }> {
  const res = await meta.request<{ data?: CampaignInsight[] }>(`/${adAccountPath()}/insights`, {
    query: {
      level: "campaign",
      date_preset: "last_7d",
      fields: "campaign_name,reach,impressions,inline_link_clicks,spend,actions",
      limit: 50,
    },
  });
  let followers: number | null = null;
  const igId = process.env.META_IG_ACCOUNT_ID; // Graph-id (1784…), niet het Business-Suite-asset-id in IG_USER_ID
  if (igId) {
    try {
      followers = (await meta.request<{ followers_count?: number }>(`/${igId}`, { query: { fields: "followers_count" } }))
        .followers_count ?? null;
    } catch {
      followers = null; // volgers zijn een extraatje; de mail gaat ook zonder
    }
  }
  const { text, html, total } = renderReport(res.data ?? [], followers);
  const mail = await sendEmail({
    to: process.env.META_REPORT_TO ?? REPORT_RECIPIENTS.join(", "),
    subject: `Advertenties deze week — ${total.leads} leads, ${eur(total.spend)} uitgegeven`,
    html,
    text,
    // Bewust géén interneMelding: die filtert hi@ (= Elles) eruit. Vaste lijst,
    // dus ook geen extra bedrijfs-BCC of contact-uitbreiding nodig.
    noCompanyBcc: true,
  });
  return { ok: true, emailed: mail.sent, total };
}
