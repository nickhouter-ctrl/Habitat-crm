/**
 * Inkoopfacturen aanmaken via Holded API v2 — alleen daar neemt Holded het
 * PROJECT PER REGEL over (v1 negeert projectid, getest 11-11-2026). Nick maakte
 * 21-11-2026 een v2-sleutel (HOLDED_API_KEY_V2, scope accounting:purchases.write).
 *
 * De rest van het CRM bouwt nog v1-lichamen (contactId, invoiceNum, items met
 * subtotal/accountingAccountId/projectid); die zetten we hier om naar v2
 * (contact_id, number, items met price/account/project_id). Zonder v2-sleutel,
 * of als v2 de factuur WEIGERT (4xx: er is dan niets aangemaakt), valt het
 * terug op v1 — de factuur komt er dan nog steeds, alleen zonder project.
 * Een time-out of 5xx valt NIET terug: dan kan hij al aangekomen zijn.
 */
import { holded, HoldedError } from "./client";

type V1Item = { name?: string; desc?: string; units?: number; subtotal?: number; taxes?: string[]; accountingAccountId?: string | null; projectid?: string | null };
type V1Body = { contactId?: string; invoiceNum?: string; date?: number; currency?: string; desc?: string; tags?: string[]; notes?: string; items?: V1Item[] };

export function v1ToV2Purchase(b: V1Body): Record<string, unknown> {
  return {
    contact_id: b.contactId,
    number: b.invoiceNum,
    ...(b.date ? { date: new Date(b.date * 1000).toISOString().slice(0, 10) } : {}),
    currency: (b.currency ?? "eur").toUpperCase(),
    description: b.desc ?? null,
    notes: b.notes ?? null,
    tags: b.tags ?? [],
    items: (b.items ?? []).map((i) => ({
      name: i.name ?? "",
      description: i.desc ?? null,
      units: i.units ?? 1,
      price: i.subtotal ?? 0,
      taxes: i.taxes ?? [],
      ...(i.accountingAccountId ? { account: i.accountingAccountId } : {}),
      ...(i.projectid ? { project_id: i.projectid } : {}),
    })),
  };
}

async function postV2(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("https://api.holded.com/api/v2/purchases", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.HOLDED_API_KEY_V2}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* tekst */ }
  if (!res.ok) throw new HoldedError(res.status, data, `Holded POST /v2/purchases → ${res.status}`);
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new HoldedError(res.status, data, "Holded v2 gaf geen id terug");
  return id;
}

/**
 * Maak een inkoopfactuur (concept) aan. Neemt een v1-lichaam, kiest zelf v2
 * als die sleutel er is. `via` zegt welke route het werd, voor de melding.
 */
export async function createPurchase(v1Body: Record<string, unknown>): Promise<{ id: string; via: "v2" | "v1"; v2Error?: string }> {
  let v2Error: string | undefined;
  if (process.env.HOLDED_API_KEY_V2) {
    try {
      return { id: await postV2(v1ToV2Purchase(v1Body as V1Body)), via: "v2" };
    } catch (e) {
      // Alleen een weigering (4xx) is veilig om terug te vallen: niets aangemaakt.
      if (!(e instanceof HoldedError) || e.status < 400 || e.status >= 500 || e.status === 429) throw e;
      v2Error = `${e.status}: ${JSON.stringify(e.body).slice(0, 200)}`;
      console.error("[holded] v2 weigerde inkoopfactuur, terugval op v1:", v2Error);
    }
  }
  const r = await holded.documents.create("purchase", v1Body);
  if (!r?.id) throw new HoldedError(200, r, "Holded gaf geen document-id terug");
  return { id: r.id, via: "v1", v2Error };
}
