import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { sentEmails } from "@/lib/db/schema";
import { mailHtmlOpgeschoond } from "@/lib/mail-html";

export const dynamic = "force-dynamic";

/**
 * Een verstuurde mail als los vel om te printen of als pdf te bewaren.
 *
 * Op de leespagina zit de brief in een sandbox-iframe van 640 pixels hoog; die
 * print half en met het hele schermmenu eromheen. Dit is dezelfde brief als een
 * zelfstandig document, met bovenaan aan wie en wanneer hij verstuurd is — dat
 * is wat een archiefstuk moet dragen. Printen of "bewaar als pdf" in het
 * printvenster levert allebei hetzelfde vel op.
 *
 * Ligt binnen de `(app)`-groep, dus `proxy.ts` beschermt hem al: een uitgelogde
 * bezoeker komt op /login uit.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const mail = await db.query.sentEmails.findFirst({ where: eq(sentEmails.id, id) });
  if (!mail) return new Response("Niet gevonden", { status: 404 });

  // ?auto=1 → printvenster meteen openen; dat is wat je van een printknop
  // verwacht. Zonder die parameter kun je het vel eerst rustig nalezen.
  const auto = new URL(req.url).searchParams.get("auto") === "1";

  const onderwerp = mail.subject ?? "Verstuurde mail";
  const verstuurd = mail.createdAt.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const inhoud = mail.html
    ? mailHtmlOpgeschoond(mail.html)
    : `<pre style="white-space:pre-wrap;font-family:Helvetica,Arial,sans-serif;font-size:14px">${escapeHtml(mail.body ?? "")}</pre>`;

  const doc = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(onderwerp)}</title>
<style>
  :root{ --ink:#1F2321; --muted:#6E7472; --line:#D9D3C7; }
  *{ box-sizing:border-box; }
  body{
    margin:0; background:#F5F3EF; color:var(--ink);
    font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:15px; line-height:1.5;
  }
  .vel{ max-width:720px; margin:0 auto; padding:24px 16px 64px; }
  .balk{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:20px; }
  .balk a, .balk button{
    font:inherit; font-size:14px; text-decoration:none; border:1px solid var(--line);
    background:#fff; color:var(--ink); padding:8px 16px; border-radius:3px; cursor:pointer;
  }
  .balk button{ background:var(--ink); color:#fff; border-color:var(--ink); }
  .kop{
    background:#fff; border:1px solid var(--line); border-bottom:0; padding:20px 24px;
  }
  .kop dl{ display:grid; grid-template-columns:auto 1fr; gap:3px 14px; margin:0; font-size:13px; }
  .kop dt{ color:var(--muted); }
  .kop dd{ margin:0; }
  .kop dd.onderwerp{ font-weight:600; }
  .mail{ background:#fff; border:1px solid var(--line); }

  @media print{
    /* Alleen de brief hoort op papier. */
    body{ background:#fff; }
    .vel{ max-width:none; padding:0; }
    .balk{ display:none; }
    .kop{ border:0; border-bottom:1px solid var(--line); padding:0 0 10px; margin:0 0 14px; max-width:560px; }
    .mail{ border:0; }
    /* De crème ondergrond eromheen kost alleen inkt. De brief zelf houdt zijn
       breedte: rek je hem tot paginabreed, dan wordt de letterhead een balk
       over het hele vel en loopt de tekst veel te ver door. */
    .mail > div{ background:#fff !important; padding:0 !important; }
    .mail > div > div{ margin:0 !important; border-radius:0 !important; box-shadow:none !important; }
    @page{ margin:18mm 16mm; }
  }
</style>
</head>
<body>
  <div class="vel">
    <div class="balk">
      <a href="/sent-mail/${escapeHtml(id)}">&larr; Terug</a>
      <button type="button" onclick="window.print()">Printen of opslaan als pdf</button>
    </div>

    <div class="kop">
      <dl>
        <dt>Aan</dt><dd>${escapeHtml(mail.toEmail ?? "—")}</dd>
        <dt>Onderwerp</dt><dd class="onderwerp">${escapeHtml(onderwerp)}</dd>
        <dt>Verstuurd</dt><dd>${escapeHtml(verstuurd)}</dd>
      </dl>
    </div>

    <div class="mail">${inhoud}</div>
  </div>
${auto ? '<script>window.addEventListener("load", function(){ window.print(); });</script>' : ""}
</body>
</html>`;

  return new Response(doc, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
