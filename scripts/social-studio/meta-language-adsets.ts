/**
 * Taaltest: 4 advertentiesets (ES/EN/NL/DE) in campagne "Klanten – showroom Jávea",
 * zelfde doelgroep als de bestaande Klanten-set, plus een taalfilter (locales).
 * Alles PAUSED en €0,85/dag per set (samen €3,40; totaal account ≤ €500/mnd).
 *
 *   npx tsx scripts/social-studio/meta-language-adsets.ts            (dry run)
 *   npx tsx scripts/social-studio/meta-language-adsets.ts --apply
 */
import "../load-env";

const V = process.env.META_GRAPH_VERSION ?? "v23.0";
const ACT = `act_${process.env.META_AD_ACCOUNT_ID}`;
const CAMPAIGN = "120250495174380513";
const SOURCE_ADSET = "120250495177650513";
const APPLY = process.argv.includes("--apply");

const LANGS = [
  { code: "ES", name: "Español", locales: [1002] },
  { code: "EN", name: "English", locales: [1001] },
  { code: "NL", name: "Nederlands", locales: [14] },
  { code: "DE", name: "Deutsch", locales: [5] },
];

async function graph(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}) {
  const u = new URL(`https://graph.facebook.com/${V}${path}`);
  const init: RequestInit = { method, headers: { authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } };
  if (method === "GET") for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  else {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    init.body = body;
  }
  const res = await fetch(u, init);
  const data = await res.json();
  if (data.error) throw new Error(`${data.error.error_user_title ?? ""} ${data.error.message} (${data.error.code}/${data.error.error_subcode ?? "-"})`);
  return data;
}

(async () => {
  const src = await graph("GET", `/${SOURCE_ADSET}`, { fields: "targeting,optimization_goal,billing_event,bid_strategy,dsa_beneficiary,dsa_payor" });
  const existing = await graph("GET", `/${CAMPAIGN}/adsets`, { fields: "name", limit: 50 });
  for (const l of LANGS) {
    const name = `Taaltest ${l.code} · Jávea +20 km`;
    if (existing.data.some((a: { name: string }) => a.name === name)) {
      console.log(`bestaat al: ${name}`);
      continue;
    }
    const targeting = { ...src.targeting, locales: l.locales };
    // De NL-expat-gedragsfilter alleen in de NL-set; elders zou hij het bereik scheeftrekken.
    if (l.code !== "NL" && targeting.flexible_spec?.[0]?.behaviors) {
      targeting.flexible_spec = [{ ...targeting.flexible_spec[0], behaviors: targeting.flexible_spec[0].behaviors.filter((b: { id: string }) => b.id !== "6023287393783") }];
    }
    console.log(`${APPLY ? "maak" : "zou maken"}: ${name} (locales ${l.locales.join(",")}, €0,85/dag, PAUSED)`);
    if (!APPLY) continue;
    const r = await graph("POST", `/${ACT}/adsets`, {
      name,
      campaign_id: CAMPAIGN,
      status: "PAUSED",
      daily_budget: "85",
      optimization_goal: src.optimization_goal,
      billing_event: src.billing_event,
      bid_strategy: src.bid_strategy,
      targeting,
      dsa_beneficiary: src.dsa_beneficiary,
      dsa_payor: src.dsa_payor,
    });
    console.log(`  → ${r.id}`);
  }
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
