import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { huidigeToegangOfNull } from "@/lib/auth/access";

/**
 * Doorstap naar Habitat One Windows zonder opnieuw in te loggen. We tekenen een
 * kortlevende token (60 s) met het gedeelde geheim WINDOWS_SSO_SECRET; Windows
 * controleert 'm, zoekt/maakt de medewerker op e-mailadres en zet zijn eigen
 * sessiecookie. Zonder geheim: gewoon naar het portaal (handmatig inloggen).
 *
 * Twee dingen zijn hier bewust streng. De rol wordt niet doorgegeven zoals hij
 * is, maar teruggebracht tot wat de Windows-app kent (admin of agent) — een rol
 * die dáár onbekend is, mag niet als volwaardig gelden. En wie in dit CRM niet
 * bij de module kozijnen mag, krijgt geen token: anders is de doorstap een
 * achterdeur om de grens heen.
 */
const WINDOWS_URL = (process.env.NEXT_PUBLIC_WINDOWS_URL ?? "https://windows.habitat-one.com").replace(/\/$/, "");
const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function GET(req: Request) {
  const toegang = await huidigeToegangOfNull();
  if (!toegang?.email) return NextResponse.redirect(new URL("/login", req.url));
  if (!toegang.magModule("kozijnen")) {
    return new NextResponse("Geen toegang: kozijnen hoort niet bij jouw rol.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const next = new URL(req.url).searchParams.get("next") ?? "/admin";
  const target = `${WINDOWS_URL}${next.startsWith("/") ? next : "/admin"}`;
  const secret = process.env.WINDOWS_SSO_SECRET;
  // Geen geheim of geen schrijfrecht → wel naar het portaal, maar zonder token.
  if (!secret || !toegang.heeftCap("schrijven")) return NextResponse.redirect(target);

  const windowsRol = toegang.rol === "admin" ? "admin" : "agent";
  const payload = {
    email: toegang.email.toLowerCase(),
    name: toegang.name ?? toegang.email,
    role: windowsRol,
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: randomBytes(8).toString("hex"),
  };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const token = `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
  const url = new URL(`${WINDOWS_URL}/api/auth/sso`);
  url.searchParams.set("token", token);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
