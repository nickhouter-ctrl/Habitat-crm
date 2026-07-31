"use server";

import { signIn } from "@/auth";

/**
 * Maakt de sessie aan met de token uit de mail. Alleen als POST bereikbaar, zodat
 * een mailscanner die de link ophaalt niemand inlogt.
 *
 * `redirectTo` blijft binnen het CRM: een doorgegeven pad uit de URL mag nooit
 * naar een ander domein wijzen (open redirect).
 */
export async function loginWithTokenAction(token: string, next: string) {
  const veilig = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  await signIn("maillink", { token, redirectTo: veilig });
}
