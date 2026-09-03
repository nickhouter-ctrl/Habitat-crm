/**
 * Opgeslagen mail-HTML klaarmaken om te tonen of te printen.
 *
 * Onze eigen mails bevatten geen scripts, maar een brief uit de administratie
 * hoort niets te kunnen doen — niet op het scherm en niet op een vel dat je
 * uitdraait. Wat overblijft is opmaak.
 */
export function mailHtmlOpgeschoond(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}
