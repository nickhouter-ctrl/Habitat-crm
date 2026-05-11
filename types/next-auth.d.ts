import type { DefaultSession } from "next-auth";

type Role = "admin" | "agent" | "viewer";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
  }
}

// The `JWT` interface lives in `@auth/core/jwt` (re-exported by `next-auth/jwt`).
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
