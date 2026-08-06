/**
 * Cron: weekcontrole van de administratie, elke maandagochtend per mail naar
 * Nick en Hans.
 *
 * Draait in de app zelf (Vercel cron) en niet in een chatsessie, zodat hij
 * blijft lopen zonder dat iemand ernaar omkijkt. De controles staan in
 * lib/weekcontrole.ts; dit is alleen de bezorging.
 *
 * Stuurt ALTIJD — ook als alles in orde is. Een wekelijkse controle waarvan je
 * alleen hoort als er iets mis is, is niet te onderscheiden van een controle
 * die stilletjes kapot is.
 */
import { NextResponse } from "next/server";

import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { syncSanitairPrijzen } from "@/lib/sanitair-prijzen";
import { verzamelWeekcontrole } from "@/lib/weekcontrole";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ONTVANGERS = ["nick@habitat-one.com", "hans@habitat-one.com"];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Eerst de eigen-collectie badkamerposten verversen uit de catalogus, zodat
  // de calculator de week ingaat met actuele productprijzen.
  await syncSanitairPrijzen().catch((e) => console.error("[weekcontrole] sanitair-sync mislukt:", e));

  const data = await verzamelWeekcontrole();
  const hoog = data.signalen.filter((s) => s.ernst === "hoog").length;

  const blokken = data.signalen.length
    ? data.signalen
        .map(
          (s) => `
      <div style="border-left:4px solid ${s.ernst === "hoog" ? "#A83A2E" : "#B07C1F"};padding:8px 12px;margin:0 0 10px;background:#faf6ef">
        <p style="margin:0 0 4px;font-weight:600">${escapeHtml(s.titel)}</p>
        <ul style="margin:0;padding-left:18px;color:#6b5d4f;font-size:13px">
          ${s.regels.slice(0, 8).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
          ${s.regels.length > 8 ? `<li>… en ${s.regels.length - 8} meer</li>` : ""}
        </ul>
      </div>`,
        )
        .join("")
    : `<p style="color:#3E7C4F"><strong>Alles in orde</strong> — geen afwijkingen gevonden.</p>`;

  const html = brandedEmail(`
    <p><strong>Weekcontrole administratie</strong> — ${data.signalen.length} signa${data.signalen.length === 1 ? "al" : "len"}${hoog ? `, waarvan ${hoog} urgent` : ""}.</p>
    ${blokken}
    <p style="color:#888;font-size:13px">
      Automatische controle, elke maandagochtend. Dubbele boekingen, afwijkende urenregels, ontbrekende
      btw-uitsplitsingen en openstaande posten — rechtstreeks uit de CRM-database.
    </p>
  `);
  const text = data.signalen.length
    ? data.signalen.map((s) => `[${s.ernst.toUpperCase()}] ${s.titel}\n${s.regels.map((r) => `  - ${r}`).join("\n")}`).join("\n\n")
    : "Alles in orde — geen afwijkingen gevonden.";

  const res = await sendEmail({
    to: ONTVANGERS[0],
    bcc: ONTVANGERS.slice(1).join(", "),
    subject: `Weekcontrole: ${data.signalen.length} signa${data.signalen.length === 1 ? "al" : "len"}${hoog ? ` · ${hoog} urgent` : ""}`,
    html,
    text,
  });

  return NextResponse.json({ ok: true, signalen: data.signalen.length, urgent: hoog, sent: res.sent });
}
