import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(secret: string) {
  if (secret.length < 32) throw new Error("Calendar encryption unavailable");
  return Buffer.from(hkdfSync("sha256", secret, "habitat-crm", "apple-calendar-credentials-v1", 32));
}
export function encryptPassword(password: string, account: string, secret: string): string {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), nonce);
  cipher.setAAD(Buffer.from(`team:${account}`));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptPassword(value: string, account: string, secret: string): string {
  const [version, nonce, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || extra || !nonce || !tag || !encrypted) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`team:${account}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export function appleUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.search
    || !/^(?:p\d+-)?caldav\.icloud\.com$/.test(url.hostname)) throw new Error("Invalid Apple calendar URL");
  return url;
}
/** Only the central iCloud host and one validated partition are interchangeable. */
export function sameAppleOrigin(first: URL, second: URL): boolean {
  appleUrl(first.href); appleUrl(second.href);
  return first.origin === second.origin || first.hostname === "caldav.icloud.com" || second.hostname === "caldav.icloud.com";
}
export function eventUrl(value: string, calendarUrl: string): string {
  const calendar = appleUrl(calendarUrl), event = appleUrl(new URL(value, calendar).href);
  if (!sameAppleOrigin(event, calendar) || !calendar.pathname.endsWith("/") || !event.pathname.startsWith(calendar.pathname)
    || !event.pathname.slice(calendar.pathname.length) || /[/%\\]/.test(decodeURIComponent(event.pathname.slice(calendar.pathname.length)))) {
    throw new Error("Event outside work calendar");
  }
  // Stable mapping keys even when an iCloud REPORT uses the central hostname.
  event.hostname = calendar.hostname;
  return event.href;
}
