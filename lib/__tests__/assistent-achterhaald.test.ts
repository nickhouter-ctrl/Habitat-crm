import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { inboxSuggestions } from "@/lib/db/schema";
import { nogRelevant, openVoorstellenFilter } from "@/lib/assistant/achterhaald";

/** De SQL wordt alleen opgebouwd, niet uitgevoerd — geen database nodig. */
type Filter = Parameters<ReturnType<ReturnType<typeof db.select>["from"]>["where"]>[0];
const sqlVan = (filter: Filter) => db.select().from(inboxSuggestions).where(filter).toSQL().sql;

describe("assistent: welke voorstellen blijven staan", () => {
  it("laat een voorstel vallen zodra de mail gelezen, gekoppeld of niet meer nieuw is", () => {
    const sql = sqlVan(nogRelevant);
    expect(sql).toContain("read_at is null");
    expect(sql).toContain("linked_purchase_order_id is null");
    expect(sql).toContain("linked_quote_request_id is null");
    expect(sql).toContain("e.status = 'new'");
  });

  it("laat een voorstel vallen als de factuurkaart al beslist is", () => {
    expect(sqlVan(nogRelevant)).toContain("purchase_invoice_reviews");
  });

  it("houdt automatisch opgeborgen voorstellen wel in beeld", () => {
    const q = db.select().from(inboxSuggestions).where(nogRelevant).toSQL();
    expect(q.params).toContain("auto_archived");
  });

  it("de teller in het menu gebruikt dezelfde regel", () => {
    const sql = sqlVan(openVoorstellenFilter);
    expect(sql).toContain("read_at is null");
    expect(sql).toContain("reviewed_at");
  });
});
