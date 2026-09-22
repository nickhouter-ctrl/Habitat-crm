/**
 * E-mailmarketing — het overzicht.
 *
 * Losgetrokken van `/leads`, want het zijn twee soorten werk: daar vind je
 * bedrijven en houd je de lijst schoon, hier bepaal je wat ze krijgen en
 * wanneer.
 *
 * De indeling volgt de vraag "kan ik nu veilig versturen?", van boven naar
 * onder: eerst de cijfers die daarover gaan, dan een waarschuwing als er iets
 * in de weg staat, dan de lopende campagnes met hun voortgang, dan het tempo,
 * en onderaan een nieuwe campagne beginnen. Wat je het vaakst nodig hebt staat
 * bovenaan.
 */
import { desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import { AlertTriangle, Mail, Megaphone, Pause, Users } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { db } from "@/lib/db";
import { bulkMailSettings, campaignRecipients, emailCampaigns, emailSuppressions, prospects } from "@/lib/db/schema";
import { bulkGereed } from "@/lib/leads/transport";
import { dagCap } from "@/lib/leads/warmup";
import { madridMiddernacht } from "@/lib/tz-madrid";
import { formatDate } from "@/lib/utils";

import { NieuweCampagne } from "./nieuwe-campagne";
import { Verzendtempo } from "./verzendtempo";

export const metadata = { title: "E-mailmarketing" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "warning" | "success" }> = {
  draft: { label: "Concept", tone: "neutral" },
  queued: { label: "In de wachtrij", tone: "accent" },
  sending: { label: "Aan het versturen", tone: "accent" },
  paused: { label: "Gepauzeerd", tone: "warning" },
  sent: { label: "Verzonden", tone: "success" },
};

export default async function MailingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const nu = new Date();

  const [campagnes, standRijen, groepRijen, [inst], mailbaar, afgemeld, vandaag, teBellenRijen] = await Promise.all([
    db.query.emailCampaigns.findMany({ orderBy: desc(emailCampaigns.createdAt), limit: 25 }),
    // Per campagne de tellers in één query, in plaats van per campagne één.
    db
      .select({
        campaignId: campaignRecipients.campaignId,
        status: campaignRecipients.status,
        n: sql<number>`count(*)::int`,
      })
      .from(campaignRecipients)
      .groupBy(campaignRecipients.campaignId, campaignRecipients.status),
    db.execute(sql`
      select collection, count(*)::int as n, min(image_url) as image
      from products
      where is_active and collection is not null and collection <> '' and image_url is not null
      group by collection order by count(*) desc limit 60
    `),
    db.select().from(bulkMailSettings).where(eq(bulkMailSettings.id, "default")),
    db.$count(prospects, sql`${prospects.email} is not null and ${prospects.status} in ('new', 'emailed')`),
    db.$count(emailSuppressions),
    // gte() en niet een Date in een sql-template: postgres.js kan een Date
    // alleen binden via het kolomtype dat drizzle meegeeft.
    db.$count(campaignRecipients, gte(campaignRecipients.sentAt, madridMiddernacht(nu))),
    // Gemaild, telefoonnummer bekend, nog nooit gebeld — de nabelstapel.
    db.execute(sql`
      select count(*)::int n from prospects p
      where p.phone is not null and p.phone <> '' and p.status <> 'unsubscribed'
        and exists (select 1 from campaign_recipients r where r.prospect_id = p.id and r.status = 'sent' and r.bounced_at is null)
        and not exists (select 1 from prospect_calls c where c.prospect_id = p.id)
    `),
  ]);

  const perCampagne = new Map<string, Record<string, number>>();
  for (const r of standRijen) {
    const huidig = perCampagne.get(r.campaignId) ?? {};
    huidig[r.status] = Number(r.n);
    perCampagne.set(r.campaignId, huidig);
  }
  const totaalWachtrij = standRijen
    .filter((r) => r.status === "queued" || r.status === "sending")
    .reduce((a, r) => a + Number(r.n), 0);

  const groupOpts = (
    (groepRijen as unknown as { rows?: Array<{ collection: string; n: number; image: string | null }> }).rows ??
    (groepRijen as unknown as Array<{ collection: string; n: number; image: string | null }>)
  ).map((r) => ({ collection: r.collection, n: Number(r.n), image: r.image }));

  const teBellen = Number((teBellenRijen as unknown as { n: number }[])[0]?.n ?? 0);
  const cap = dagCap(inst?.warmupStartedAt ?? null, nu, inst?.dailyCapOverride ?? null);
  const gereed = bulkGereed();
  const lopend = campagnes.filter((c) => c.status === "queued" || c.status === "sending");
  const rest = campagnes.filter((c) => !lopend.includes(c));

  return (
    <>
      <PageHeader
        title="E-mailmarketing"
        subtitle="Campagnes naar bedrijven — met een dagcap, een afmeldlink en een noodrem"
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/broadcast/nabellen" className="underline">
              Nabellen
            </Link>
            <Link href="/leads/prospects" className="underline">
              Prospects
            </Link>
            <Link href="/leads/import" className="underline">
              Lijst importeren
            </Link>
            <Link href="/leads" className="underline">
              Bedrijven zoeken
            </Link>
          </div>
        }
      />

      {sp.error && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>}

      {/* Wat je moet weten vóór je verstuurt. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="In de wachtrij"
          value={String(totaalWachtrij)}
          hint={totaalWachtrij > 0 ? "wordt automatisch verstuurd" : "niets te versturen"}
          tone={totaalWachtrij > 0 ? "accent" : "neutral"}
          icon={<Mail className="size-4" />}
        />
        <StatTile
          label="Vandaag verstuurd"
          value={`${vandaag} / ${cap}`}
          hint="dagcap over alle campagnes"
          tone={vandaag >= cap && cap > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Bedrijven bereikbaar"
          value={String(mailbaar)}
          hint="prospects met e-mailadres"
          tone="info"
          icon={<Users className="size-4" />}
          href="/leads/prospects?ef=met"
        />
        <StatTile label="Afgemeld" value={String(afgemeld)} hint="worden nooit gemaild" />
        <StatTile
          label="Te bellen"
          value={String(teBellen)}
          hint="gemaild, met nummer, nog niet gebeld"
          tone={teBellen > 0 ? "accent" : "neutral"}
          href="/broadcast/nabellen"
        />
      </div>

      {/* Alleen tonen als er iets in de weg staat — geen vaste banner. */}
      {!gereed && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Het verzendkanaal is niet ingesteld (<code className="font-mono text-xs">RESEND_API_KEY</code>). Campagnes
            kunnen wel klaargezet worden, maar er gaat niets de deur uit.
          </span>
        </p>
      )}
      {inst?.paused && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <Pause className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            <strong>Het verzenden staat stil.</strong> {inst.pausedReason ?? ""} Aanzetten doe je op de pagina van een
            campagne.
          </span>
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {/* Lopende campagnes eerst, met voortgang. Dat is waar je naar kijkt. */}
          {lopend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Nu bezig</CardTitle>
                <span className="text-xs text-muted">{lopend.length} {lopend.length === 1 ? "campagne" : "campagnes"}</span>
              </CardHeader>
              <CardContent className="space-y-4">
                {lopend.map((c) => {
                  const s = perCampagne.get(c.id) ?? {};
                  const wachtrij = (s.queued ?? 0) + (s.sending ?? 0);
                  const klaar = s.sent ?? 0;
                  const totaal = wachtrij + klaar || 1;
                  const pct = Math.round((klaar / totaal) * 100);
                  const dagen = cap > 0 ? Math.ceil(wachtrij / cap) : null;
                  return (
                    <div key={c.id} className="space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/broadcast/${c.id}`} className="font-medium text-accent hover:underline">
                          {c.name}
                        </Link>
                        <span className="text-xs text-muted tabular-nums">
                          {klaar} van {wachtrij + klaar} verstuurd
                          {dagen ? ` · nog ± ${dagen} verzenddagen` : ""}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-background-soft">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{wachtrij} in wachtrij</span>
                        {(s.failed ?? 0) > 0 && <span className="text-danger">{s.failed} mislukt</span>}
                        {(s.bounced ?? 0) > 0 && <span className="text-warning">{s.bounced} bounce</span>}
                        {(s.complained ?? 0) > 0 && <span className="text-danger">{s.complained} klacht</span>}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Alle campagnes. */}
          <Card>
            <CardHeader>
              <CardTitle>Campagnes</CardTitle>
              <span className="text-xs text-muted">{campagnes.length} in totaal</span>
            </CardHeader>
            {rest.length === 0 && lopend.length === 0 ? (
              <CardContent>
                <EmptyState
                  title="Nog geen campagne"
                  description="Maak er hieronder een. Je kiest voor wie hij is en welke producten erin komen; onderwerp en tekst volgen daarna."
                />
              </CardContent>
            ) : (
              <CardContent className="divide-y divide-border/70 p-0">
                {[...lopend, ...rest].map((c) => {
                  const s = perCampagne.get(c.id) ?? {};
                  const meta = STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
                  return (
                    <Link
                      key={c.id}
                      href={`/broadcast/${c.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-background"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {c.subject || "nog geen onderwerp"} · {c.language.toUpperCase()} · {formatDate(c.createdAt)}
                        </span>
                      </span>
                      <span className="text-xs text-muted tabular-nums">
                        {(s.sent ?? 0) > 0 ? `${s.sent} verstuurd` : "—"}
                      </span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Link>
                  );
                })}
              </CardContent>
            )}
          </Card>

          <NieuweCampagne groupOpts={groupOpts} />
        </div>

        {/* Rechterkolom: het tempo en de lijst waar het uit komt. */}
        <div className="space-y-5">
          <Verzendtempo teGaan={totaalWachtrij || mailbaar} />

          <Card>
            <CardHeader>
              <CardTitle>De lijst</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted">
                Campagnes gaan naar <strong>prospects</strong>: bedrijven die apart van je contactenlijst staan. Pas wie
                klant wordt, zet je over naar contacten.
              </p>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-xs">
                <dt className="text-muted">Met e-mailadres</dt>
                <dd className="tabular-nums">{mailbaar}</dd>
                <dt className="text-muted">Afgemeld</dt>
                <dd className="tabular-nums">{afgemeld}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <LinkButton href="/leads/import" variant="secondary" size="sm">
                  <Megaphone className="size-4" /> Lijst importeren
                </LinkButton>
                <LinkButton href="/leads/prospects" variant="ghost" size="sm">
                  Prospects openen
                </LinkButton>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zo werkt het</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted">
              <p>
                <strong className="text-foreground">1.</strong> Campagne maken: voor wie, welke taal, welke producten.
              </p>
              <p>
                <strong className="text-foreground">2.</strong> Onderwerp en tekst — met AI of zelf getypt — naast een
                voorbeeld van de mail.
              </p>
              <p>
                <strong className="text-foreground">3.</strong> Testmail naar jezelf.
              </p>
              <p>
                <strong className="text-foreground">4.</strong> In de wachtrij zetten. Daarna verstuurt het systeem
                verspreid over de dagen, binnen de dagcap, en stopt zelf bij te veel bounces.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
