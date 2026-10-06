import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

/**
 * Shared Auth.js config — no database, no Node-only deps. Used by `proxy.ts`
 * for authentication. The full config (Drizzle adapter + Credentials provider)
 * lives in `auth.ts`.
 *
 * Twee taken:
 *  1. niet ingelogd → naar /login (zoals altijd);
 *  2. het pad doorgeven via de header `x-pathname`, want een layout weet zelf
 *     niet op welke URL hij staat.
 *
 * De JWT-rol kan oud zijn. Daarom voegt de Node.js Proxy een actuele DB-
 * rolcontrole toe vóór pagina's/RSC worden geladen. De layout, `weigerRoute()`
 * voor exports en de guards voor server actions controleren aanvullend.
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
        pathname.startsWith("/afspraak") || // klant reageert op een afspraakbevestiging (token-link)
        pathname.startsWith("/uren") || // zzp-urenportaal (personal token links)
        pathname.startsWith("/inkoop/keuren") || // inkoopfactuur keuren via de knop in de melding
        pathname === "/verkooppunten" ||
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
