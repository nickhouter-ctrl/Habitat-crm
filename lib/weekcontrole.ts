/**
 * Weekcontrole: loopt de administratie na op de dingen die in de praktijk
 * misgingen — dubbele facturen, urenregels die centen lieten vallen, betaalde
 * facturen zonder ontvangst, btw die als kost werd geboekt.
 *
 * Gedeeld door twee afnemers:
 *  - `scripts/weekcontrole.ts` (handmatig / artifact-pagina);
 *  - `app/api/cron/weekcontrole/route.ts` (maandagochtend-mail naar Nick en Hans).
 *
 * Bewust géén `server-only`: het script moet dit kunnen laden.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { alGedekt } from "@/lib/project-receipts";

const eur = (n: number) =>
  "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Signaal = { ernst: "hoog" | "middel" | "laag"; titel: string; regels: string[] };

export type Projectcijfers = {
  naam: string; doel: number | null; arbeid: number; inkoop: number; losse: number;
  levKost: number; gefactureerd: number; openFacturen: number; ontvangenIncl: number; ontvangenEx: number;
};

export type Weekcontrole = { signalen: Signaal[]; projecten: Projectcijfers[]; openTotaal: number };

export async function verzamelWeekcontrole(): Promise<Weekcontrole> {
  const signalen: Signaal[] = [];

  /* ── A · Keurwachtrij ── */
  const [wachtrij] = await db.execute<{ n: number; oudste: number }>(sql`
    select count(*)::int n, coalesce(max(extract(day from now() - created_at))::int, 0) oudste
    from purchase_invoice_reviews where status = 'pending'`);
  if (wachtrij.n > 0) {
    const rijen = await db.execute<{ s: string; t: string; d: number }>(sql`
      select coalesce(proposed_supplier,'onbekend') s, coalesce(proposed_total::text,'?') t,
             extract(day from now() - created_at)::int d
      from purchase_invoice_reviews where status='pending' order by created_at`);
    signalen.push({
      ernst: wachtrij.oudste >= 7 ? "hoog" : "middel",
      titel: `${wachtrij.n} inkoopfactu${wachtrij.n === 1 ? "ur" : "ren"} wacht${wachtrij.n === 1 ? "" : "en"} op goedkeuring (oudste ${wachtrij.oudste} d)`,
      regels: rijen.map((r) => `${r.s} · € ${r.t} · wacht ${r.d} d`),
    });
  }

  /* ── B · Verkoopfacturen over de vervaldatum ── */
  const teLaat = await db.execute<{ nr: string; project: string | null; open: number; dagen: number }>(sql`
    select d.doc_number nr, p.name project,
           (coalesce(d.total_eur,0) - coalesce(d.paid_eur,0))::float8 open,
           greatest(0, extract(day from now() - d.due_date::timestamp))::int dagen
    from documents d left join projects p on p.id = d.project_id
    where d.kind = 'invoice' and d.status in ('sent','overdue','partially_paid')
      and coalesce(d.total_eur,0) - coalesce(d.paid_eur,0) > 0.01
    order by open desc`);
  const teLaatTot = teLaat.reduce((s, r) => s + r.open, 0);
  if (teLaat.length > 0) {
    signalen.push({
      ernst: teLaat.some((r) => r.dagen > 30) ? "hoog" : "middel",
      titel: `${teLaat.length} onbetaalde verkoopfactu${teLaat.length === 1 ? "ur" : "ren"} · ${eur(teLaatTot)} open`,
      regels: teLaat.map((r) => `${r.nr}${r.project ? ` (${r.project})` : ""} · ${eur(r.open)}${r.dagen > 0 ? ` · ${r.dagen} d over de vervaldatum` : ""}`),
    });
  }

  /* ── C · Betaalde facturen zonder ontvangstregel ── */
  const betaaldLos = await db.execute<{ id: string; nr: string | null; projectId: string; project: string; bedrag: number; kind: string }>(sql`
    select d.id, d.doc_number nr, d.project_id "projectId", p.name project,
           coalesce(nullif(d.paid_eur,0), d.total_eur, 0)::float8 bedrag, d.kind
    from documents d join projects p on p.id = d.project_id
    where d.kind in ('invoice','creditnote') and d.status = 'paid'
      and not exists (select 1 from project_payments pp where pp.document_id = d.id)`);
  const echtLos: string[] = [];
  for (const d of betaaldLos) {
    const bedrag = d.bedrag * (d.kind === "creditnote" ? -1 : 1);
    // Handmatig ingevoerde opgaves (Finca Lisa, Palijsje) dekken sommige facturen al.
    if (await alGedekt({ projectId: d.projectId, docNumber: d.nr, amount: bedrag })) continue;
    echtLos.push(`${d.nr ?? d.id.slice(0, 8)} (${d.project}) · ${eur(bedrag)}`);
  }
  if (echtLos.length > 0) {
    signalen.push({
      ernst: "middel",
      titel: `${echtLos.length} betaalde factu${echtLos.length === 1 ? "ur" : "ren"} zonder ontvangstregel op het project`,
      regels: echtLos,
    });
  }

  /* ── D · Urenregels die afwijken van hun factuur ── */
  const drift = await db.execute<{ ref: string | null; geboekt: number; sub: number; tot: number }>(sql`
    with x as (
      select po.id, po.reference ref, sum(t.hours * t.hourly_cost_eur)::float8 geboekt,
             coalesce(nullif(po.subtotal,0),0)::float8 sub, coalesce(po.total,0)::float8 tot
      from time_entries t join purchase_orders po on po.id = t.purchase_order_id
      where po.count_as_labor group by po.id
    )
    select * from x
    where abs(geboekt - case when sub > 0 then sub else tot end) > 0.05
      and abs(geboekt - tot / 1.21) > 0.05`);
  if (drift.length > 0) {
    signalen.push({
      ernst: "hoog",
      titel: `${drift.length} urenboeking${drift.length === 1 ? "" : "en"} wijk${drift.length === 1 ? "t" : "en"} af van de factuur`,
      regels: drift.map((r) => `${r.ref ?? "?"} · geboekt ${eur(r.geboekt)} · factuur ${eur(r.sub > 0 ? r.sub : r.tot)}`),
    });
  }

  /* ── E · Inkoop op een project zonder btw-uitsplitsing ── */
  const btwOnbekend = await db.execute<{ s: string; ref: string | null; t: number; project: string }>(sql`
    select po.supplier s, po.reference ref, po.total::float8 t, p.name project
    from purchase_orders po join projects p on p.id = po.project_id
    where coalesce(nullif(po.subtotal,0),0) = 0 and coalesce(po.tax,0) = 0
      and coalesce(po.total,0) <> 0 and not po.count_as_labor`);
  if (btwOnbekend.length > 0) {
    signalen.push({
      ernst: "middel",
      titel: `${btwOnbekend.length} inkoopfactu${btwOnbekend.length === 1 ? "ur" : "ren"} op een project zonder btw-uitsplitsing (kost mogelijk incl. btw geboekt)`,
      regels: btwOnbekend.map((r) => `${r.s} ${r.ref ?? ""} (${r.project}) · ${eur(r.t)}`),
    });
  }

  /* ── F · Meerwerk zonder akkoord ── */
  const meerwerk = await db.execute<{ project: string; d: string; b: number }>(sql`
    select p.name project, e.description d, e.amount_eur::float8 b
    from project_extras e join projects p on p.id = e.project_id
    where e.approved_at is null`);
  if (meerwerk.length > 0) {
    signalen.push({
      ernst: "middel",
      titel: `${meerwerk.length} meerwerkregel${meerwerk.length === 1 ? "" : "s"} zonder akkoord van de klant`,
      regels: meerwerk.map((r) => `${r.project}: ${r.d} · ${eur(r.b)}`),
    });
  }

  /* ── G · Geleverd maar nog te bestellen ── */
  const teBestellen = await db.execute<{ project: string; naam: string; q: number }>(sql`
    select p.name project, d.product_name naam, d.to_order_qty::float8 q
    from project_deliveries d join projects p on p.id = d.project_id
    where d.reversed_at is null and d.to_order_qty > 0`);
  if (teBestellen.length > 0) {
    signalen.push({
      ernst: "middel",
      titel: `${teBestellen.length} geleverd${teBestellen.length === 1 ? "e post ligt" : "e posten liggen"} nog niet op voorraad — bestellen`,
      regels: teBestellen.map((r) => `${r.project}: ${r.q} × ${r.naam}`),
    });
  }

  /* ── Projectcijfers (actieve projecten) ── */
  const projecten = await db.execute<Projectcijfers>(sql`
    select p.name naam, p.contract_price_eur::float8 doel,
      (select coalesce(sum(t.hours * t.hourly_cost_eur),0) from time_entries t
        where t.project_id = p.id and not (t.self_logged_at is not null and t.approved_at is null))::float8 arbeid,
      (select coalesce(sum(coalesce(nullif(po.subtotal,0),
              case when coalesce(po.tax,0) <> 0 then po.total - po.tax else po.total end, 0)),0)
        from purchase_orders po where po.project_id = p.id and not po.count_as_labor)::float8 inkoop,
      (select coalesce(sum(c.amount_eur),0) from project_costs c where c.project_id = p.id)::float8 losse,
      (select coalesce(sum(d.total_cost_eur),0) from project_deliveries d
        where d.project_id = p.id and d.reversed_at is null)::float8 "levKost",
      (select coalesce(sum(case when d.kind='creditnote' then -d.subtotal_eur else d.subtotal_eur end),0)
        from documents d where d.project_id = p.id and d.kind in ('invoice','creditnote')
          and d.status not in ('draft','void'))::float8 gefactureerd,
      (select coalesce(sum(coalesce(d.total_eur,0) - coalesce(d.paid_eur,0)),0)
        from documents d where d.project_id = p.id and d.kind = 'invoice'
          and d.status in ('sent','overdue','partially_paid'))::float8 "openFacturen",
      (select coalesce(sum(pp.amount_eur),0) from project_payments pp where pp.project_id = p.id)::float8 "ontvangenIncl",
      (select coalesce(sum(
          case when pp.vat_amount_eur is not null then pp.amount_eur - pp.vat_amount_eur
               when pp.vat_rate is not null then pp.amount_eur / (1 + pp.vat_rate/100)
               when pp.method = 'cash' then pp.amount_eur
               when dd.subtotal_eur > 0 and dd.total_eur > 0 then pp.amount_eur * (dd.subtotal_eur / dd.total_eur)
               else pp.amount_eur / 1.21 end), 0)
        from project_payments pp left join documents dd on dd.id = pp.document_id
        where pp.project_id = p.id)::float8 "ontvangenEx"
    from projects p
    where p.status = 'active' and p.name not in ('test')
    order by p.contract_price_eur desc nulls last, p.name`);

  /* ── H · Kostenplafond (85% van het doel) ── */
  for (const p of projecten) {
    const kosten = p.arbeid + p.inkoop + p.losse + p.levKost;
    if (p.doel && p.doel > 0 && kosten > p.doel * 0.85) {
      signalen.push({
        ernst: kosten > p.doel ? "hoog" : "middel",
        titel: `${p.naam}: kosten ${eur(kosten)} ${kosten > p.doel ? "BOVEN de aanneemsom" : "boven het kostenplafond (85%)"} van ${eur(p.doel)}`,
        regels: [`arbeid ${eur(p.arbeid)} · inkoop ${eur(p.inkoop + p.losse)} · geleverde producten ${eur(p.levKost)}`],
      });
    }
  }

  return { signalen, projecten: projecten as Projectcijfers[], openTotaal: teLaatTot };
}

/* ─────────────────────────────── pagina ─────────────────────────────── */

export function bouwArtifactHtml({ signalen, projecten, openTotaal }: Weekcontrole): string {
  const nu = new Date().toLocaleString("nl-NL", { dateStyle: "full", timeStyle: "short" });
  const hoog = signalen.filter((s) => s.ernst === "hoog").length;
  const middel = signalen.filter((s) => s.ernst === "middel").length;
  const kostenTotaal = projecten.reduce((s, p) => s + p.arbeid + p.inkoop + p.losse + p.levKost, 0);
  const ontvangenTotaal = projecten.reduce((s, p) => s + p.ontvangenEx, 0);

  const signaalHtml = signalen.length
    ? signalen
        .map(
          (s) => `
      <section class="signaal ${s.ernst}">
        <h3>${esc(s.titel)}</h3>
        <ul>${s.regels.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      </section>`,
        )
        .join("")
    : `<section class="signaal ok"><h3>Geen afwijkingen gevonden</h3><ul><li>Alle controles kwamen schoon terug.</li></ul></section>`;

  const rijen = projecten
    .map((p) => {
      const kosten = p.arbeid + p.inkoop + p.losse + p.levKost;
      const plafond = p.doel && p.doel > 0 ? kosten / (p.doel * 0.85) : null;
      return `<tr>
        <td class="naam">${esc(p.naam)}</td>
        <td class="num">${p.doel ? eur(p.doel) : "—"}</td>
        <td class="num">${eur(kosten)}${plafond != null && plafond > 1 ? ` <span class="vlag">plafond</span>` : ""}</td>
        <td class="num">${eur(p.gefactureerd)}</td>
        <td class="num">${p.openFacturen > 0.01 ? `<span class="warn">${eur(p.openFacturen)}</span>` : "—"}</td>
        <td class="num">${eur(p.ontvangenEx)}</td>
        <td class="num ${p.ontvangenEx - kosten < 0 ? "warn" : "goed"}">${eur(p.ontvangenEx - kosten)}</td>
      </tr>`;
    })
    .join("");

  return `<title>Habitat CRM — weekcontrole</title>
<style>
  :root {
    --grond: #FAF6EF; --paneel: #FFFFFF; --inkt: #2B2118; --gedempt: #8A7B6C;
    --lijn: #E8DFD2; --accent: #B6552D; --goed: #3E7C4F; --let-op: #B07C1F; --fout: #A83A2E;
  }
  @media (prefers-color-scheme: dark) {
    :root { --grond: #191410; --paneel: #221C16; --inkt: #EDE5DA; --gedempt: #A69684; --lijn: #3A3128; }
  }
  :root[data-theme="dark"] { --grond: #191410; --paneel: #221C16; --inkt: #EDE5DA; --gedempt: #A69684; --lijn: #3A3128; }
  :root[data-theme="light"] { --grond: #FAF6EF; --paneel: #FFFFFF; --inkt: #2B2118; --gedempt: #8A7B6C; --lijn: #E8DFD2; }

  body { background: var(--grond); color: var(--inkt); margin: 0;
    font: 16px/1.55 "Avenir Next", Seravek, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 68rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  header { border-bottom: 2px solid var(--inkt); padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .merk { font-size: .75rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
  h1 { margin: .15rem 0 .3rem; font-size: 1.7rem; letter-spacing: -.01em; text-wrap: balance; }
  .stempel { color: var(--gedempt); font-size: .85rem; }

  .tegels { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr)); margin: 1.25rem 0 2rem; }
  .tegel { background: var(--paneel); border: 1px solid var(--lijn); border-radius: .5rem; padding: .8rem 1rem; }
  .tegel b { display: block; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
  .tegel span { color: var(--gedempt); font-size: .78rem; }
  .tegel.hoog b { color: var(--fout); } .tegel.middel b { color: var(--let-op); } .tegel.geen b { color: var(--goed); }

  h2 { font-size: .8rem; letter-spacing: .1em; text-transform: uppercase; color: var(--gedempt); margin: 2rem 0 .75rem; }
  .signaal { background: var(--paneel); border: 1px solid var(--lijn); border-left-width: 4px;
    border-radius: .4rem; padding: .8rem 1.1rem; margin-bottom: .75rem; }
  .signaal.hoog { border-left-color: var(--fout); } .signaal.middel { border-left-color: var(--let-op); }
  .signaal.ok { border-left-color: var(--goed); }
  .signaal h3 { margin: 0 0 .35rem; font-size: 1rem; }
  .signaal ul { margin: 0; padding-left: 1.1rem; color: var(--gedempt); font-size: .88rem; }
  .signaal li { margin: .12rem 0; }

  .tabelwrap { overflow-x: auto; background: var(--paneel); border: 1px solid var(--lijn); border-radius: .5rem; }
  table { border-collapse: collapse; width: 100%; font-size: .88rem; min-width: 52rem; }
  th { text-align: right; font-size: .7rem; letter-spacing: .08em; text-transform: uppercase;
    color: var(--gedempt); padding: .65rem .9rem; border-bottom: 1px solid var(--lijn); }
  th:first-child { text-align: left; }
  td { padding: .55rem .9rem; border-bottom: 1px solid var(--lijn); }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.naam { font-weight: 600; }
  .warn { color: var(--let-op); } .goed { color: var(--goed); }
  .vlag { font-size: .68rem; color: var(--fout); border: 1px solid currentColor; border-radius: 99px; padding: 0 .4rem; }

  footer { margin-top: 2.5rem; color: var(--gedempt); font-size: .78rem; border-top: 1px solid var(--lijn); padding-top: 1rem; }
</style>
<main>
  <header>
    <div class="merk">Habitat One · intern</div>
    <h1>Weekcontrole administratie</h1>
    <div class="stempel">Gegenereerd ${esc(nu)} · rechtstreeks uit de CRM-database</div>
  </header>

  <div class="tegels">
    <div class="tegel ${hoog ? "hoog" : signalen.length ? "middel" : "geen"}"><b>${signalen.length}</b><span>signalen${hoog ? ` · ${hoog} urgent` : ""}</span></div>
    <div class="tegel"><b>${eur(openTotaal)}</b><span>openstaand bij klanten</span></div>
    <div class="tegel"><b>${eur(ontvangenTotaal)}</b><span>ontvangen op actieve projecten (ex. btw)</span></div>
    <div class="tegel"><b>${eur(kostenTotaal)}</b><span>kosten actieve projecten</span></div>
  </div>

  <h2>Signalen</h2>
  ${signaalHtml}

  <h2>Actieve projecten</h2>
  <div class="tabelwrap">
    <table>
      <thead><tr>
        <th>Project</th><th>Aanneemsom</th><th>Kosten</th><th>Gefactureerd</th>
        <th>Open bij klant</th><th>Ontvangen (ex)</th><th>Saldo</th>
      </tr></thead>
      <tbody>${rijen}</tbody>
    </table>
  </div>

  <footer>
    Indicatieve cijfers — de projectpagina in het CRM is leidend. Saldo = ontvangen (ex. btw) − kosten.
    Kosten = arbeid + inkoop + losse kosten + kostprijs geleverde producten. Deze pagina wordt wekelijks automatisch ververst.
  </footer>
</main>`;
}


/** Tekstsamenvatting — voor het script (stdout) en de melding. */
export function tekstSamenvatting({ signalen }: Weekcontrole): string {
  const hoog = signalen.filter((s) => s.ernst === "hoog").length;
  const r: string[] = [
    `WEEKCONTROLE ${new Date().toLocaleDateString("nl-NL")} — ${signalen.length} signa${signalen.length === 1 ? "al" : "len"}${hoog ? ` (${hoog} urgent)` : ""}`,
  ];
  for (const s of signalen) {
    r.push("", `[${s.ernst.toUpperCase()}] ${s.titel}`);
    for (const x of s.regels.slice(0, 6)) r.push(`   - ${x}`);
    if (s.regels.length > 6) r.push(`   … en ${s.regels.length - 6} meer`);
  }
  if (signalen.length === 0) r.push("", "Alles in orde — geen afwijkingen gevonden.");
  return r.join("\n");
}
