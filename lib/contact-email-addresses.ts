import { z } from "zod";

/** Store extra business recipients separately; the primary email remains the
 * identity used for logins, customer accounts and integrations. */
export const additionalContactEmailsSchema = z.preprocess(
  value => typeof value === "string" ? value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : value ?? [],
  z.array(z.string().trim().email().max(254).transform(s => s.toLowerCase())).max(10),
).transform(values => [...new Set(values)]);

export function emailAddress(value: string): string | null {
  const address = (value.match(/<([^<>]+)>/)?.[1] ?? value).trim().toLowerCase();
  return z.string().email().safeParse(address).success ? address : null;
}

export function appendContactEmails(to: string, extras: string[]): string {
  const seen = new Set(to.split(",").map(emailAddress).filter(Boolean));
  const added: string[] = [];
  for (const extra of extras) {
    const address = emailAddress(extra);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    added.push(address);
  }
  return [to, ...added].filter(Boolean).join(", ");
}
