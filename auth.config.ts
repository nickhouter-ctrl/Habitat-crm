import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — no database, no Node-only deps. Used by `proxy.ts`
 * for route protection. The full config (Drizzle adapter + Credentials provider)
 * lives in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [], // declared in auth.ts
  callbacks: {
    /** Route guard used from `proxy.ts`. Authenticated users may see everything. */
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/offerte") || // public accept/reject page for clients
        pathname.startsWith("/book") || // public "pick an appointment slot" page
        pathname.startsWith("/uren"); // zzp-urenportaal (personal token links)
      return isPublic || isLoggedIn;
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
