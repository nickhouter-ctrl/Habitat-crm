/**
 * Deal/pipeline automation helpers (server-only).
 *
 * When a document changes we keep the linked deal in sync:
 *  - an estimate → the deal's value mirrors the estimate total; the stage moves
 *    forward to "proposal" (offerte) if it's still in an earlier stage;
 *  - an *accepted* estimate → the deal is "won" (probability 100).
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { deals } from "@/lib/db/schema";

type DealStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "on_hold";

const STAGE_ORDER: DealStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
];

function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as DealStage);
  return i === -1 ? 0 : i;
}

export async function syncDealFromDocument(
  dealId: string | null | undefined,
  doc: { kind: string; status: string; totalEur: string | number | null },
): Promise<void> {
  if (!dealId) return;
  if (doc.kind !== "estimate") return; // only estimates drive the pipeline for now

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: { id: true, stage: true, valueEur: true },
  });
  if (!deal) return;

  const patch: Partial<typeof deals.$inferInsert> = {};

  // Value mirrors the estimate total (so it isn't typed twice).
  if (doc.totalEur != null) patch.valueEur = String(doc.totalEur);

  if (doc.status === "accepted") {
    if (deal.stage !== "won") {
      patch.stage = "won";
      patch.probability = 100;
      patch.closedAt = new Date();
    }
  } else if (stageRank(deal.stage) < stageRank("proposal") && deal.stage !== "lost" && deal.stage !== "on_hold") {
    // An estimate exists → at least the "offerte" stage.
    patch.stage = "proposal";
    if ((deal.valueEur ?? null) === null) patch.probability = 50;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(deals).set(patch).where(eq(deals.id, dealId));
  }
}
