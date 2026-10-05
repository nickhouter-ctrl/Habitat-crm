import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { users } from "./lib/db/schema";
import { magPad, startPadVoorRol } from "./lib/auth/modules";

// Next 16 Proxy runs on Node.js. Check the current DB role before rendering:
// a layout redirect alone can still stream a child page's private RSC data.
export default NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async authorized(args) {
      const response = authConfig.callbacks.authorized(args);
      // Public routes and unauthenticated redirects retain their own policy.
      if (!(response instanceof NextResponse)) return response;
      const id = args.auth?.user?.id;
      if (!id) return false;
      try {
        const user = await db.query.users.findFirst({ where: eq(users.id, id), columns: { role: true } });
        if (!user) return false;
        const path = args.request.nextUrl.pathname;
        if (!magPad(user.role, path)) {
          return NextResponse.redirect(new URL(`${startPadVoorRol(user.role)}?geen-toegang=1`, args.request.url));
        }
        return response;
      } catch {
        console.error("CRM access check unavailable; request denied.");
        return new Response("Toegang kon niet worden gecontroleerd.", { status: 503 });
      }
    },
  },
}).auth;

export const config = {
  // Run on everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
