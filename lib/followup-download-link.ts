import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET ontbreekt of is te kort.");
  return value;
}

/** Stable opaque bearer token: the customer link itself does not expire. */
export function createFollowupDownloadToken(path: string): string {
  if (!/^followup:[^/\\]{1,180}\.pdf$/i.test(path)) throw new Error("Ongeldig downloadbestand.");
  const objectPath = path.slice("followup:".length);
  return createHmac("sha256", secret()).update(objectPath).digest("base64url");
}

export function resolveFollowupDownloadToken(token: string, paths: string[]): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const supplied = Buffer.from(token);
  for (const path of paths) {
    if (!/^followup:[^/\\]{1,180}\.pdf$/i.test(path)) continue;
    const objectPath = path.slice("followup:".length);
    const expected = Buffer.from(createHmac("sha256", secret()).update(objectPath).digest("base64url"));
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return path;
  }
  return null;
}
