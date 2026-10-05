/** Only the receiving Gmail server's first result is trusted, never a quoted/forwarded header. */
export function gmailAuthenticatedSender(from: string | null | undefined, headers: readonly { key: string; line: string }[]): boolean {
  const domain = from?.trim().toLowerCase().split("@")[1];
  if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return false;
  const first = headers.find(h => h.key.toLowerCase() === "authentication-results")?.line.replace(/\r?\n[ \t]+/g, " ");
  if (!first || !/^Authentication-Results:\s*mx\.google\.com\s*;/i.test(first)) return false;
  return first.split(";").some(part => /\bdmarc=pass\b/i.test(part) && part.match(/\bheader\.from=([^\s;]+)/i)?.[1].toLowerCase() === domain);
}
