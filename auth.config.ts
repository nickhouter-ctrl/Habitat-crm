import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — no database, no Node-only deps. Used by `proxy.ts`
 * for route protection. The full config (Drizzle adapter + Credentials provider)
 * lives in `auth.ts`.
 *
 * Twee taken:
 *  1. niet ingelogd → naar /login (zoals altijd);
 *  2. het pad doorgeven via de header `x-pathname`, want een layout weet zelf
 *     niet op welke URL hij staat.
 *
 * Bewust GEEN rolcontrole hier. De rol in de JWT kan tot een dag oud zijn
 * (`updateAge: 24h`), en dan zou iemand die net rechten kreeg alsnog worden
 * weggestuurd door een cookie. De grens ligt daarom op plekken die de rol uit
 * de database lezen: `app/(app)/layout.tsx` voor pagina's, `weigerRoute()` voor
 * routes zonder layout, en de guards in `lib/auth/guards.ts` voor acties.
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
