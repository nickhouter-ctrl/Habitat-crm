import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailSuppressions, prospects } from "@/lib/db/schema";

/**
 * Publieke één-klik-afmeldroute voor campagne-mails. Zet het adres op de
 * suppressielijst en markeert de prospect als afgemeld. Geen login (verplicht
 * voor werkende opt-out onder LSSI/AVG). Ook per POST (List-Unsubscribe one-click).
 */

function page(title: string, body: string): Response {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title></head>
<body style="font-family:Helvetica,Arial,sans-serif;background:#f3efe9;margin:0;padding:48px 16px;color:#2a2520">
  <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;text-align:center">
    <h1 style="font-size:20px;margin:0 0 10px;color:#3a2a20">${title}</h1>
    <p style="font-size:14px;line-height:1.6;color:#7a6f63;margin:0">${body}</p>
  </div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function unsubscribe(token: string | null): Promise<Response> {
  if (!token) return page("Ongeldige link", "Deze afmeldlink is ongeldig of onvolledig.");
  const prospect = await db.query.prospects.findFirst({
    where: eq(prospects.unsubscribeToken, token),
    columns: { id: true, email: true, companyName: true },
  });
  if (!prospect) return page("Ongeldige link", "Deze afmeldlink is ongeldig of al vervallen.");

  if (prospect.email) {
    await db
      .insert(emailSuppressions)
      .values({ email: prospect.email.toLowerCase(), reason: "unsubscribed" })
      .onConflictDoNothing({ target: emailSuppressions.email });
  }
  await db
    .update(prospects)
    .set({ status: "unsubscribed", updatedAt: sql`now()` })
    .where(eq(prospects.id, prospect.id));

  return page(
    "Je bent afgemeld",
    `${prospect.companyName ? `${prospect.companyName} ontvangt` : "Je ontvangt"} geen commerciële e-mails meer van Habitat One. Bedankt.`,
  );
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  return unsubscribe(token);
}

export async function POST(req: Request) {
  // List-Unsubscribe-Post: One-Click stuurt een POST; token zit in de query.
  const token = new URL(req.url).searchParams.get("token");
  return unsubscribe(token);
}
