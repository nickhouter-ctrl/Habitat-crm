import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

import { bekendeRol, magAlles, magPad, startPadVoorRol } from "@/lib/auth/modules";

/**
 * Edge-safe Auth.js config — no database, no Node-only deps. Used by `proxy.ts`
 * for route protection. The full config (Drizzle adapter + Credentials provider)
 * lives in `auth.ts`.
 *
 * Twee taken:
 *  1. niet ingelogd → naar /login (zoals altijd);
 *  2. ingelogd met een beperkte rol → eerste controle op het pad, en het pad
 *     doorgeven aan de layout via de header `x-pathname` (een layout weet zelf
 *     niet op welke URL hij staat).
 *
 * De controle hier gebruikt de rol uit de JWT. Dat cookie kan een dag oud zijn,
 * dus het is de snelle voorfilter, niet de grens: `app/(app)/layout.tsx` en de
 * guards in `lib/auth/guards.ts` lezen de rol uit de database.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [], // declared in auth.ts
  callbacks: {
    /** Route guard used from `proxy.ts`. */
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/offerte") || // public accept/reject page for clients
        pathname.startsWith("/book") || // public "pick an appointment slot" page
        pathname.startsWith("/uren") || // zzp-urenportaal (personal token links)
        pathname.startsWith("/inkoop/keuren") || // inkoopfactuur keuren via de knop in de melding
        pathname === "/handtekening" || // handtekening-generator voor het personeel (geen gegevens, alleen bedrijfsinfo)
        pathname === "/klant" || pathname.startsWith("/klant/") || // klantportaal (eigen sessie-cookie via inloglink)
        pathname.startsWith("/handleiding"); // alleen metadata/deelkaart publiek — de pagina zelf checkt de sessie
      if (isPublic) return true;
      if (!isLoggedIn) return false;

      const rol = auth?.user?.role;
      // Een rol die deze build niet kent (oud sessiecookie na een uitrol) laten
      // we hier door; de layout beslist dan op basis van de database.
      // Rollen met volledige toegang (admin, agent, viewer) merken hier niets.
      if (bekendeRol(rol) && !magAlles(rol) && !magPad(rol, pathname)) {
        return NextResponse.redirect(new URL(startPadVoorRol(rol), request.nextUrl.origin));
      }

      // Het pad meegeven, zodat de layout de harde controle kan doen.
      const headers = new Headers(request.headers);
      headers.set("x-pathname", pathname);
      return NextResponse.next({ request: { headers } });
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "agent";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.role = token.role ?? "agent";
      return session;
    },
  },
} satisfies NextAuthConfig;
