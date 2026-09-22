/**
 * Nabellen: wie heeft de campagnemail gekregen, en hoe staat dat gesprek ervoor?
 *
 * De lijst komt uit de wachtrij (`campaign_recipients` met status `sent`), want
 * dat is de enige plek die zeker weet wie er écht een mail heeft gehad. Per
 * bedrijf de laatste verzenddatum, het telefoonnummer als we dat hebben, en de
 * laatste belpoging. Wie een bounce had of zich afmeldde, hoort niet in een
 * belronde en valt standaard weg.
 *
 * Bellen gaat op volgorde van "langst geleden gemaild, nog niet gebeld" — dat
 * is de rij die anders blijft liggen.
 */
import Link from "next/link";
import { sql } from "drizzle-orm";

import { Badge, Card, CardContent, CardHeader, CardTitle, Input, LinkButton, PageHeader, Select, StatTile, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

import { legBelpogingVast } from "./actions";
import { BelFormulier } from "./bel-formulier";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nabellen" };

const PER_PAGINA = 40;

const UITKOMST: Record<string, { label: string; tone: "neutral" | "accent" | "info" | "success" | "warning" | "danger" }> = {
  "geen-antwoord": { label: "Geen antwoord", tone: "neutral" },
  terugbellen: { label: "Terugbellen", tone: "warning" },
  interesse: { label: "Interesse", tone: "success" },
  afspraak: { label: "Afspraak", tone: "success" },
  "geen-interesse": { label: "Geen interesse", tone: "neutral" },
  "verkeerd-nummer": { label: "Verkeerd nummer", tone: "danger" },
};

type Rij = {
  id: string;
  company_name: string;
  contact_person_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  sector: string | null;
  category: string | null;
  status: string;
  sent_at: string;
  campagne: string | null;
  bounced: boolean;
  laatste_uitkomst: string | null;
  laatste_belpoging: string | null;
  laatste_notitie: string | null;
  pogingen: number;
};

export default async function NabellenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireModule("broadcast");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const tel = sp.tel ?? "met"; // met | alle
  const gebeld = sp.gebeld ?? "open"; // open | alle | gebeld
  const sector = (sp.sector ?? "alle").trim();
  const pagina = Math.max(1, Number(sp.p ?? 1) || 1);

  const filters = sql`
    and (${!q} or p.company_name ilike ${`%${q}%`} or p.email ilike ${`%${q}%`} or p.contact_person_name ilike ${`%${q}%`} or p.city ilike ${`%${q}%`})
    and (${tel !== "met"} or (p.phone is not null and p.phone <> ''))
    and (${sector === "alle"} or p.sector = ${sector})
  `;
  const gebeldFilter =
    gebeld === "open"
      ? sql`and l.called_at is null`
      : gebeld === "gebeld"
        ? sql`and l.called_at is not null`
        : sql``;

  /** De basis: per prospect de laatste verzending + de laatste belpoging. */
  const basis = sql`
    from prospects p
    join (
      select r.prospect_id, max(r.sent_at) sent_at,
             bool_or(r.bounced_at is not null or r.complained_at is not null) mis,
             (array_agg(c.name order by r.sent_at desc))[1] campagne
      from campaign_recipients r
      join email_campaigns c on c.id = r.campaign_id
      where r.status = 'sent' and r.prospect_id is not null
      group by r.prospect_id
    ) v on v.prospect_id = p.id
    left join lateral (
      select pc.called_at, pc.outcome, pc.note, count(*) over () pogingen
      from prospect_calls pc where pc.prospect_id = p.id
      order by pc.called_at desc limit 1
    ) l on true
    where p.status <> 'unsubscribed' and not v.mis
    ${filters}
    ${gebeldFilter}
  `;

  const [{ n: totaal }] = (await db.execute(sql`select count(*)::int n ${basis}`)) as unknown as { n: number }[];
  const rijen = (await db.execute(sql`
    select p.id, p.company_name, p.contact_person_name, p.email, p.phone, p.city, p.province, p.sector, p.category, p.status,
           v.sent_at, v.campagne, v.mis as bounced,
           l.outcome as laatste_uitkomst, l.called_at as laatste_belpoging, l.note as laatste_notitie, coalesce(l.pogingen, 0)::int pogingen
    ${basis}
    order by l.called_at asc nulls first, v.sent_at asc
    limit ${PER_PAGINA} offset ${(pagina - 1) * PER_PAGINA}
  `)) as unknown as Rij[];

  const [tellers] = (await db.execute(sql`
    select
      count(*)::int gemaild,
      count(*) filter (where p.phone is not null and p.phone <> '')::int met_tel,
      count(*) filter (where exists (select 1 from prospect_calls pc where pc.prospect_id = p.id))::int gebeld,
      count(*) filter (where p.status = 'replied')::int reacties
    from prospects p
    join (select distinct prospect_id from campaign_recipients where status = 'sent' and prospect_id is not null) v on v.prospect_id = p.id
  `)) as unknown as { gemaild: number; met_tel: number; gebeld: number; reacties: number }[];

  const sectoren = (await db.execute(sql`
    select distinct p.sector from prospects p
    join (select distinct prospect_id from campaign_recipients where status = 'sent' and prospect_id is not null) v on v.prospect_id = p.id
    where p.sector is not null order by 1
  `)) as unknown as { sector: string }[];

  const laatste = Math.max(1, Math.ceil(totaal / PER_PAGINA));
  const href = (anders: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const alles = { q, tel, gebeld, sector, p: pagina, ...anders };
    for (const [k, v] of Object.entries(alles)) if (v !== undefined && v !== "" && v !== "alle") u.set(k, String(v));
    return `/broadcast/nabellen${u.toString() ? `?${u}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nabellen"
        subtitle="Bedrijven die de campagnemail hebben gekregen — met telefoonnummer, op volgorde van langst geleden"
        actions={
          <LinkButton href="/broadcast" variant="secondary" size="sm">
            Naar campagnes
          </LinkButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Gemaild" value={`${tellers.gemaild}`} hint="bedrijven met een verstuurde mail" />
        <StatTile label="Met telefoonnummer" value={`${tellers.met_tel}`} hint="direct te bellen" />
        <StatTile label="Gebeld" value={`${tellers.gebeld}`} hint="minstens één poging" />
        <StatTile label="Reageerde" value={`${tellers.reacties}`} hint="interesse of afspraak" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{totaal} te bellen</CardTitle>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder="Zoek op bedrijf, naam, e-mail of plaats" className="h-8 w-60 text-sm" />
            <Select name="sector" defaultValue={sector} className="h-8 text-sm">
              <option value="alle">Alle branches</option>
              {sectoren.map((s) => (
                <option key={s.sector} value={s.sector}>
                  {s.sector}
                </option>
              ))}
            </Select>
            <Select name="tel" defaultValue={tel} className="h-8 text-sm">
              <option value="met">Alleen met nummer</option>
              <option value="alle">Ook zonder nummer</option>
            </Select>
            <Select name="gebeld" defaultValue={gebeld} className="h-8 text-sm">
              <option value="open">Nog niet gebeld</option>
              <option value="gebeld">Al gebeld</option>
              <option value="alle">Alles</option>
            </Select>
            <button type="submit" className="h-8 rounded-md border px-3 text-sm hover:border-accent">
              Filter
            </button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <Th>Bedrijf</Th>
                <Th>Telefoon</Th>
                <Th>Plaats</Th>
                <Th>Gemaild</Th>
                <Th>Laatste belpoging</Th>
                <Th>Vastleggen</Th>
              </tr>
            </THead>
            <TBody>
              {rijen.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span className="font-medium">{r.company_name}</span>
                    {r.contact_person_name && r.contact_person_name !== r.company_name && (
                      <span className="block text-xs text-muted">{r.contact_person_name}</span>
                    )}
                    <span className="block text-xs text-muted">
                      {r.email}
                      {r.sector ? ` · ${r.sector}` : ""}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {r.phone ? (
                      <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="font-medium text-accent hover:underline">
                        {r.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-muted">geen nummer</span>
                    )}
                  </Td>
                  <Td className="text-muted">{[r.city, r.province].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDate(new Date(r.sent_at))}
                    {r.campagne && <span className="block max-w-[14rem] truncate text-xs">{r.campagne}</span>}
                  </Td>
                  <Td>
                    {r.laatste_uitkomst ? (
                      <>
                        <Badge tone={UITKOMST[r.laatste_uitkomst]?.tone ?? "neutral"}>
                          {UITKOMST[r.laatste_uitkomst]?.label ?? r.laatste_uitkomst}
                        </Badge>
                        <span className="block text-xs text-muted">
                          {r.laatste_belpoging ? formatDate(new Date(r.laatste_belpoging)) : ""}
                          {r.pogingen > 1 ? ` · ${r.pogingen} pogingen` : ""}
                        </span>
                        {r.laatste_notitie && <span className="block max-w-[16rem] truncate text-xs">{r.laatste_notitie}</span>}
                      </>
                    ) : (
                      <span className="text-xs text-muted">nog niet gebeld</span>
                    )}
                  </Td>
                  <Td>
                    <BelFormulier prospectId={r.id} action={legBelpogingVast} />
                  </Td>
                </Tr>
              ))}
              {rijen.length === 0 && (
                <Tr>
                  <Td colSpan={6} className="py-8 text-center text-sm text-muted">
                    Niets te bellen met deze filters. Zet "Ook zonder nummer" aan of kies een andere branche.
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </CardContent>
        {laatste > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted">
              Pagina {pagina} van {laatste}
            </span>
            <div className="flex gap-2">
              {pagina > 1 && (
                <Link href={href({ p: pagina - 1 })} className="rounded-md border px-3 py-1.5 hover:border-accent">
                  Vorige
                </Link>
              )}
              {pagina < laatste && (
                <Link href={href({ p: pagina + 1 })} className="rounded-md border px-3 py-1.5 hover:border-accent">
                  Volgende
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
