import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { workers } from "@/lib/db/schema";

/** Zoek de (actieve) arbeider bij een portaal-token; null bij een ongeldige link. */
export async function workerForToken(token: string) {
  if (!token || token.length < 20) return null;
  const w = await db.query.workers.findFirst({
    where: and(eq(workers.portalToken, token), eq(workers.active, true)),
  });
  return w ?? null;
}
