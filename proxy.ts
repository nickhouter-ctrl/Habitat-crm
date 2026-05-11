import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

// Next.js 16 renamed Middleware to "Proxy" — same behaviour. We run the
// edge-safe Auth.js config here to redirect unauthenticated users to /login.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
