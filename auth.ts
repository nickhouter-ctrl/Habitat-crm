import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { accounts, sessions, users, verificationTokens } from "./lib/db/schema";
import { verifyPassword } from "./lib/auth/password";
import { markLoginTokenUsed, resolveLoginToken } from "./lib/login-links";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Credentials provider requires the JWT session strategy.
  // 30 dagen, en de sessie schuift mee bij gebruik: wie via de inloglink uit een
  // melding binnenkomt hoeft daarna niet telkens opnieuw in te loggen.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
        });
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
    /**
     * Inloggen met de link uit een melding-mail. De token doet het werk; er is
     * geen wachtwoord. De knop op /login/link/[token] POST hierheen — nooit een
     * GET, want mailscanners halen links vooraf op.
     */
    Credentials({
      id: "maillink",
      name: "Inloglink",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(raw) {
        const token = typeof raw?.token === "string" ? raw.token : "";
        const user = await resolveLoginToken(token);
        if (!user) return null;
        await markLoginTokenUsed(token);
        return { id: user.id, name: user.name, email: user.email, image: null, role: user.role };
      },
    }),
  ],
});
