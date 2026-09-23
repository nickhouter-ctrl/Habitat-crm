/**
 * Huisstijl van de mail van Habitat One Windows (kopie van lib/mail.ts in de
 * Windows-repo, zodat de activatiemails vanuit het CRM er hetzelfde uitzien):
 * crème vlak, witte kaart, logo, kop in serif, tekst in Arial, knop in kapitalen.
 */
const WINDOWS_URL = "https://windows.habitat-one.com";

export function windowsMailLayout(title: string, bodyHtml: string, opts: { eyebrow?: string } = {}): string {
  const eyebrow = opts.eyebrow ?? "Habitat One Windows";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<style>p{margin:0 0 14px}a{color:#8f6f47}table td{font-family:Arial,Helvetica,sans-serif}</style></head>
<body style="margin:0;padding:0;background:#f1ede5;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1ede5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0 6px 18px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle"><a href="${WINDOWS_URL}" style="text-decoration:none"><img src="${WINDOWS_URL}/mail/logo.png" width="72" height="43" alt="Habitat One" style="display:block;border:0;height:43px;width:72px"></a></td>
      <td valign="middle" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#8f6f47">Windows</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#fffdfa;border:1px solid #e6e0d4;border-radius:10px;padding:40px 40px 36px">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:#8f6f47;margin-bottom:14px">${eyebrow}</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.2;color:#1c1714;margin:0 0 22px">${title}</h1>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#3a342d">${bodyHtml}</div>
  </td></tr>
  <tr><td style="padding:22px 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#8a8177">
    <strong style="color:#5c554c">Habitat One</strong> · Camí de la Fontana 3, Locales 2, 3 y 5 · 03730 Xàbia (Alicante) · España<br>+34 663 361 623 · +31 6 51170545 · <a href="${WINDOWS_URL}" style="color:#8a8177">windows.habitat-one.com</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function windowsMailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#1c1714;border-radius:6px"><a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#f3efe7;text-decoration:none">${label}</a></td></tr></table>`;
}

export function windowsMailNote(html: string): string {
  return `<p style="font-size:12px;line-height:1.6;color:#8a8177;margin:0 0 6px;word-break:break-all">${html}</p>`;
}
