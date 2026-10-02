import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
/**
 * Detailpagina van een creative: grote preview, feiten, layoutvalidatie en de
 * goedkeuringsstap met menselijke controlelijst (brief §6b/§7). Wat het
 * systeem niet kan controleren — klopt de prijs, leest de tekst natuurlijk,
 * wordt de claim waargemaakt — vinkt een mens hier expliciet af.
 * Geen vinkje, geen approved.
 */
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { approveCreative, archiveCreative } from "@/app/(app)/marketing/creatives/actions";
import { Badge, Card, LinkButton, PageHeader, buttonClass, type BadgeTone } from "@/components/ui";
import { creativeSpecSchema } from "@/lib/creatives/schema";
import { TEMPLATES } from "@/lib/creatives/templates";
import { FORMATS } from "@/lib/creatives/tokens";
import { validateSpecCopy, type CopyIssue } from "@/lib/creatives/validate";
import { db } from "@/lib/db";
import { creativeSpecs } from "@/lib/db/schema";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Concept", tone: "neutral" },
  approved: { label: "Goedgekeurd", tone: "success" },
  scheduled: { label: "Ingepland", tone: "info" },
  live: { label: "Live", tone: "accent" },
  archived: { label: "Gearchiveerd", tone: "neutral" },
};

const FOUT_UITLEG: Record<string, string> = {
  controlelijst: "Vink eerst alle drie de controlepunten af — geen vinkje, geen approved.",
  validatie: "Deze spec past niet binnen de layoutgaranties. Dupliceer hem en kort de teksten in.",
  status: "Alleen een concept kan worden goedgekeurd.",
};

const CHECKLIST: Array<{ name: string; label: string }> = [
  { name: "check-prijs", label: "De genoemde prijs klopt met de actuele prijslijst" },
  { name: "check-taal", label: "De tekst leest natuurlijk in de gekozen taal (geen kromme vertaling)" },
  { name: "check-claim", label: "Elke claim in beeld en tekst wordt waargemaakt" },
];

export default async function CreativeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const { id } = await params;
  const sp = await searchParams;
  const fout = typeof sp.fout === "string" ? sp.fout : "";

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [spec] = await db.select().from(creativeSpecs).where(eq(creativeSpecs.id, id)).limit(1);
  if (!spec) notFound();

  const meta = STATUS_META[spec.status] ?? STATUS_META.draft;
  const headline = spec.copy?.headline ?? "(zonder kop)";
  const format = FORMATS[spec.format];

  // Layoutvalidatie met dezelfde functie als de editor en de approve-actie.
  let issues: CopyIssue[] = [];
  const parsed = creativeSpecSchema.safeParse({ ...spec, copy: spec.copy ?? { headline: "" } });
  if (parsed.success) issues = validateSpecCopy(parsed.data);

  return (
    <>
      <PageHeader
        title={headline}
        subtitle={uiT("{v0} · {v1} · {v2} · palet {v3}", { v0: TEMPLATES[spec.template as keyof typeof TEMPLATES]?.label ?? spec.template, v1: format.label, v2: spec.locale.toUpperCase(), v3: spec.palette })}
        actions={
          <>
            <LinkButton href={`/marketing/creatives/new?from=${spec.id}`}>
              {uiT("Dupliceer en pas aan")} </LinkButton>
            <LinkButton variant="secondary" href="/marketing/creatives">
              {uiT("Alle creatives")} </LinkButton>
          </>
        }
      />

      {fout && FOUT_UITLEG[fout] && (
        <Card className="mb-4 border-red-300 bg-red-50 p-3 text-sm" role="alert">
          {FOUT_UITLEG[fout]}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card className="p-4">
          <div
            className="mx-auto w-full max-w-xl overflow-hidden rounded-md border bg-background"
            style={{ aspectRatio: `${format.width} / ${format.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/creatives/render?id=${spec.id}`}
              alt={uiT("Creative: {v0}", { v0: headline })}
              className="size-full object-contain"
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted">
            {uiT("Gerenderd door hetzelfde endpoint dat de PNG voor Meta levert.")} </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{uiT("Status")}</h2>
              <Badge tone={meta.tone}>{uiT(meta.label)}</Badge>
            </div>
            <dl className="mt-3 space-y-1.5 text-muted">
              <div className="flex justify-between gap-4">
                <dt>{uiT("Invalshoek")}</dt>
                <dd className="text-foreground">{spec.copyAngle ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{uiT("Gemaakt door")}</dt>
                <dd className="text-foreground">{spec.createdBy ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{uiT("Gemaakt op")}</dt>
                <dd className="text-foreground">
                  {spec.createdAt.toLocaleString(uiDateLocale, { dateStyle: "medium", timeStyle: "short" })}
                </dd>
              </div>
              {spec.parentId && (
                <div className="flex justify-between gap-4">
                  <dt>{uiT("Gedupliceerd van")}</dt>
                  <dd>
                    <a href={`/marketing/creatives/${spec.parentId}`} className="text-accent underline">
                      {uiT("origineel")} </a>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {issues.length > 0 && (
            <Card className="border-amber-300 bg-amber-50 p-4 text-sm">
              <h2 className="font-medium">{uiT("Past niet binnen de layoutgaranties")}</h2>
              <ul className="mt-1 list-disc pl-5">
                {issues.map((issue) => (
                  <li key={issue.role}>{issue.message}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">
                {uiT("Goedkeuren is geblokkeerd. Dupliceer de creative en kort de teksten in.")} </p>
            </Card>
          )}

          {spec.status === "draft" && (
            <Card className="p-4">
              <h2 className="text-sm font-medium">{uiT("Goedkeuren")}</h2>
              <p className="mt-1 text-xs text-muted">
                {uiT("Dit kan het systeem niet controleren — loop het zelf na (§6b):")} </p>
              <form action={approveCreative} className="mt-3 space-y-2.5">
                <input type="hidden" name="id" value={spec.id} />
                {CHECKLIST.map((item) => (
                  <label key={item.name} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={item.name}
                      required
                      className="mt-0.5 size-4 accent-[var(--color-accent,#0f2e36)]"
                    />
                    <span>{uiT(item.label)}</span>
                  </label>
                ))}
                <button
                  type="submit"
                  disabled={issues.length > 0}
                  className={buttonClass({ className: "mt-1" })}
                  title={issues.length > 0 ? uiT("Los eerst de layoutproblemen op") : undefined}
                >
                  {uiT("Keur goed")} </button>
              </form>
            </Card>
          )}

          {spec.status !== "archived" && spec.status !== "live" && (
            <form action={archiveCreative}>
              <input type="hidden" name="id" value={spec.id} />
              <button type="submit" className={buttonClass({ variant: "ghost", size: "sm" })}>
                {uiT("Archiveer")} </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
