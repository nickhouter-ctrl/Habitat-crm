import { tekst as uiTranslation } from '@/lib/i18n/server';
/**
 * Overzicht van creatives (brief §7): alle specs met status en voorbeeld.
 * De hoofdactie per rij is "Dupliceer en pas aan" (§3.5) — bewerken van een
 * lopende advertentie bestaat bewust niet.
 */
import { and, desc, eq, or } from "drizzle-orm";
import Link from "next/link";

import { approveCreativeSet } from "@/app/(app)/marketing/creatives/actions";
import { Badge, Card, EmptyState, LinkButton, PageHeader, buttonClass, type BadgeTone } from "@/components/ui";
import { db } from "@/lib/db";
import { creativeSpecs } from "@/lib/db/schema";
import { creativeSpecSchema } from "@/lib/creatives/schema";
import { validateSpecCopy } from "@/lib/creatives/validate";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Creatives") };
}

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Concept", tone: "neutral" },
  approved: { label: "Goedgekeurd", tone: "success" },
  scheduled: { label: "Ingepland", tone: "info" },
  live: { label: "Live", tone: "accent" },
  archived: { label: "Gearchiveerd", tone: "neutral" },
};

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiT = await uiTranslation();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const setId = typeof params.set === "string" ? params.set : "";

  const rows = await db
    .select()
    .from(creativeSpecs)
    .where(status && status in STATUS_META ? eq(creativeSpecs.status, status as "draft") : undefined)
    .orderBy(desc(creativeSpecs.createdAt))
    .limit(200);

  // Sets met openstaande concepten: groepeer drafts op hun basis-spec, zodat
  // het goedkeurblok altijd zichtbaar is — niet alleen direct na "Maak set".
  const draftRows = await db
    .select({ id: creativeSpecs.id, parentId: creativeSpecs.parentId })
    .from(creativeSpecs)
    .where(eq(creativeSpecs.status, "draft"));
  const setCounts = new Map<string, number>();
  for (const row of draftRows) {
    const base = row.parentId ?? row.id;
    setCounts.set(base, (setCounts.get(base) ?? 0) + 1);
  }
  const draftSetIds = [...setCounts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);

  const buildHref = (s?: string) => (s ? `/marketing/creatives?status=${s}` : "/marketing/creatives");

  return (
    <>
      <PageHeader
        title={uiT("Creatives")}
        subtitle={uiT("{n} creative(s) — het ontwerp is de bron, de PNG wordt daaruit gemaakt", { n: rows.length })}
        actions={
          <div className="flex gap-2">
            <LinkButton href="/marketing/creatives/carousel" variant="secondary">
              {uiT("Carrousel met AI")} </LinkButton>
            <LinkButton href="/marketing/creatives/new">{uiT("Nieuwe creative")}</LinkButton>
          </div>
        }
      />

      {(draftSetIds.length > 0 ? draftSetIds : setId ? [setId] : []).map((id) => (
        <SetApproval
          key={id}
          setId={id}
          fout={id === setId && typeof params.fout === "string" ? params.fout : ""}
          aantal={typeof params.aantal === "string" ? params.aantal : ""}
        />
      ))}

      <nav aria-label={uiT("Filter op status")} className="mb-4 flex flex-wrap gap-1">
        {[["", "Alle"], ...Object.entries(STATUS_META).map(([k, v]) => [k, v.label])].map(
          ([value, label]) => (
            <Link
              key={value || "alle"}
              href={buildHref(value || undefined)}
              aria-current={status === value ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                status === value
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ),
        )}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={status ? uiT("Geen creatives met deze status") : uiT("Nog geen creatives")}
          description={uiT("Maak een creative vanuit de beeldbibliotheek of met de knop hierboven.")}
          action={<LinkButton href="/marketing/creatives/new">{uiT("Nieuwe creative")}</LinkButton>}
        />
      ) : (
        <ul
          className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          aria-label={uiT("Creatives")}
        >
          {rows.map((spec) => {
            const meta = STATUS_META[spec.status] ?? STATUS_META.draft;
            const headline = spec.copy?.headline ?? "(zonder kop)";
            return (
              <li key={spec.id}>
                <Card className="group overflow-hidden p-0">
                  <Link
                    href={`/marketing/creatives/${spec.id}`}
                    className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={uiT("Bekijk creative \"{v0}\"", { v0: headline })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/creatives/render?id=${spec.id}`}
                      alt={uiT("Voorbeeld: {v0}", { v0: headline })}
                      loading="lazy"
                      className="aspect-square w-full bg-background object-contain"
                    />
                  </Link>
                  <div className="space-y-1.5 border-t border-border/60 px-3 py-2 text-xs">
                    <p className="truncate font-medium" title={headline}>
                      {headline}
                    </p>
                    <p className="text-muted">
                      {spec.template} · {spec.format} · {spec.locale.toUpperCase()} · {spec.palette}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={meta.tone}>{uiT(meta.label)}</Badge>
                      <Link
                        href={`/marketing/creatives/new?from=${spec.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {uiT("Dupliceer en pas aan")} </Link>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Goedkeurblok voor een hele set: één controlelijst voor alle varianten
 * (dezelfde prijs/claim; het taalvinkje dekt álle talen), daarna keurt
 * `approveCreativeSet` alles in één keer — of niets, als er één variant door
 * de layoutvalidatie zakt.
 */
async function SetApproval({ setId, fout, aantal }: { setId: string; fout: string; aantal: string }) {
  const uiT = await uiTranslation();
  const drafts = await db
    .select()
    .from(creativeSpecs)
    .where(
      and(
        or(eq(creativeSpecs.id, setId), eq(creativeSpecs.parentId, setId)),
        eq(creativeSpecs.status, "draft"),
      ),
    );

  // Vooraf laten zien wat er niet past — niet pas klagen na de klik. Groepeer
  // identieke problemen (zelfde taal/rol/melding) met een voorbeeldlink.
  const problems = new Map<string, { count: number; exampleId: string }>();
  for (const row of drafts) {
    const parsed = creativeSpecSchema.safeParse({ ...row, copy: row.copy ?? { headline: "" } });
    const issues = parsed.success
      ? validateSpecCopy(parsed.data).map((i) => i.message)
      : ["Onvolledige spec (ontbrekende velden)"];
    for (const message of issues) {
      const key = `${row.locale.toUpperCase()} · ${message}`;
      const entry = problems.get(key);
      if (entry) entry.count += 1;
      else problems.set(key, { count: 1, exampleId: row.id });
    }
  }
  if (drafts.length === 0) {
    return (
      <Card className="mb-4 border-green-300 bg-green-50 p-3 text-sm" role="status">
        {uiT("Deze set is volledig goedgekeurd — klaar om te publiceren via een campagne.")} </Card>
    );
  }

  const FOUT: Record<string, string> = {
    controlelijst: "Vink eerst alle drie de controlepunten af — geen vinkje, geen goedkeuring.",
    validatie: `${aantal || "Eén of meer"} variant(en) zakken door de layoutvalidatie (tekst te lang voor het formaat). Open die concepten, kort de tekst in en probeer opnieuw.`,
    leeg: "Er zijn geen concepten meer in deze set om goed te keuren.",
  };

  return (
    <Card className="mb-4 border-accent/40 bg-accent/5 p-4 text-sm" role="status">
      <p className="font-medium">
        {drafts.some((d) => d.carouselOrder != null)
          ? uiT("Carrouselset met {v0} kaartjes. Loop ze hieronder na en keur ze daarna hier in één keer goed.", { v0: drafts.length })
          : uiT(drafts.length === 1 ? "Set met {n} openstaand concept. Controleer het concept en keur het hier goed." : "Set met {n} openstaande concepten (beelden × formaten × talen). Controleer ze en keur ze hier samen goed.", { n: drafts.length })}
      </p>
      {fout && FOUT[fout] && (
        <p className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-900" role="alert">
          {FOUT[fout]}
        </p>
      )}
      {problems.size > 0 && (
        <div className="mt-2 space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" role="alert">
          <p className="font-medium">
            {uiT("Deze set kan nog niet goedgekeurd worden — dit past niet:")} </p>
          <ul className="list-disc pl-5">
            {[...problems.entries()].map(([key, { count, exampleId }]) => (
              <li key={key}>
                {count}{uiT("×")} {key}{" "}
                <Link href={`/marketing/creatives/${exampleId}`} className="font-medium underline">
                  {uiT("bekijk voorbeeld")} </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form action={approveCreativeSet} className="mt-3 space-y-2">
        <input type="hidden" name="setId" value={setId} />
        {[
          { name: "check-prijs", label: uiT("De genoemde prijs klopt met de actuele prijslijst") },
          { name: "check-taal", label: uiT("De tekst leest natuurlijk in álle talen (geen kromme vertaling)") },
          { name: "check-claim", label: uiT("Elke claim in beeld en tekst wordt waargemaakt") },
        ].map((item) => (
          <label key={item.name} className="flex items-center gap-2">
            <input type="checkbox" name={item.name} className="size-4" /> {uiT(item.label)}
          </label>
        ))}
        <button type="submit" className={buttonClass()}>
          {uiT("Keur alle")} {drafts.length} {uiT("concepten goed")} </button>
      </form>
    </Card>
  );
}
