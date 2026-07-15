/**
 * Centrale actie-guard: ingelogd zijn is niet genoeg voor mutaties — een
 * account met rol "viewer" is alleen-lezen. Alle server actions horen deze
 * guard te gebruiken (via hun lokale requireUser-helper).
 */
import "server-only";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export type SessionUser = { id: string; role?: string; name?: string | null; email?: string | null };

/** Ingelogd + mag muteren (rol ≠ viewer). Gebruik in alle server actions. */
export async function requireWriteUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = session.user as SessionUser;
  if (user.role === "viewer") {
    throw new Error("Alleen-lezen account: wijzigingen zijn niet toegestaan voor de rol 'viewer'.");
  }
  return user;
}
