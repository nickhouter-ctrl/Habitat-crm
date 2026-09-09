import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Doorstap naar Habitat One Windows zonder opnieuw in te loggen. We tekenen een
 * kortlevende token (60 s) met het gedeelde geheim WINDOWS_SSO_SECRET; Windows
 * controleert 'm, zoekt/maakt de medewerker op e-mailadres en zet zijn eigen
 * sessiecookie. Zonder geheim: gewoon naar het portaal (handmatig inloggen).
 */
const WINDOWS_URL = (process.env.NEXT_PUBLIC_WINDOWS_URL ?? "https://windows.habitat-one.com").replace(/\/$/, "");
const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", req.url));
  const next = new URL(req.url).searchParams.get("next") ?? "/admin";
  const target = `${WINDOWS_URL}${next.startsWith("/") ? next : "/admin"}`;
  const secret = process.env.WINDOWS_SSO_SECRET;
  if (!secret || session.user.role === "viewer") return NextResponse.redirect(target);

  const payload = { email: session.user.email.toLowerCase(), name: session.user.name ?? session.user.email, role: session.user.role ?? "agent", exp: Math.floor(Date.now() / 1000) + 60, nonce: randomBytes(8).toString("hex") };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const token = `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
  const url = new URL(`${WINDOWS_URL}/api/auth/sso`);
  url.searchParams.set("token", token);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
