import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile } from "@/components/ui";
import { db } from "@/lib/db";
import { prospectImports } from "@/lib/db/schema";
import { droogloop, leesBestand, VOORBEELD_RIJEN } from "@/lib/leads/import-run";
import { suggestMapping, type ProspectField } from "@/lib/leads/prospect-columns";
import { aantalOvergeslagen, REDEN_TEKST, type OverslagReden } from "@/lib/leads/prospect-import";
import { formatDate } from "@/lib/utils";

import { applyImport, deleteImportBatch, setImportMapping } from "../actions";
import { ApplyButton } from "./apply-button";
import { MappingForm } from "./mapping-form";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Import bekijken" };

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; stap?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const batch = await db.query.prospectImports.findFirst({ where: eq(prospectImports.id, id) });
  if (!batch) notFound();

  const kopregel = (
    <PageHeader
      title={batch.label}
      subtitle={`${batch.filename}${batch.vendor ? ` · ${batch.vendor}` : ""} · geüpload ${formatDate(batch.createdAt)}`}
      actions={
        <div className="flex items-center gap-3">
          <Link href="/leads/import" className="text-sm underline">
            Alle imports
          </Link>
          <form action={deleteImportBatch.bind(null, id)}>
            <ConfirmSubmit
              message={`"${batch.label}" terugdraaien? Prospects uit deze lijst die nog niet gemaild zijn, worden verwijderd.`}
              className="rounded px-2 py-1 text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              Terugdraaien
            </ConfirmSubmit>
          </form>
        </div>
      }
    />
  );

  // Stap 1 — de kolommen zijn nog niet vastgesteld (of iemand wil ze opnieuw
  // kiezen): alleen de kolomkeuze tonen, en het bestand niet verder inlezen dan
  // de eerste rijen.
  if (batch.status === "uploaded" || sp.stap === "kolommen") {
    const gelezen = await leesBestand(batch, { maxRows: 12 });
    const voorstel = suggestMapping(gelezen.koppen);
    const voorbeelden = gelezen.koppen.map((_, i) => gelezen.ruw.slice(0, 5).map((r) => r[i] ?? ""));
    const opgeslagen = (batch.mapping ?? []) as (ProspectField | null)[];

    return (
      <>
        {kopregel}
        {sp.error && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Welke kolom is wat?</CardTitle>
            {voorstel.onbekend.length > 0 && (
              <span className="text-xs text-warning">
                {voorstel.onbekend.length} {voorstel.onbekend.length === 1 ? "kolom" : "kolommen"} niet herkend
              </span>
            )}
          </CardHeader>
          <CardContent>
            <MappingForm
              id={id}
              koppen={gelezen.koppen}
              voorbeelden={voorbeelden}
              mapping={opgeslagen.length ? opgeslagen : voorstel.mapping}
              bladen={gelezen.bladen}
              sheetName={batch.sheetName ?? gelezen.bladen[0]}
              headerRow={batch.headerRow}
              saveAction={setImportMapping}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  // Stap 2 — droogloop: precies wat het wegschrijven gaat doen.
  const { plan } = await droogloop(batch);
  const weg = aantalOvergeslagen(plan);
  const nogTeDoen = Math.max(0, plan.nieuw.length - batch.processedRows);
  const redenen = (Object.entries(plan.overgeslagen) as [OverslagReden, number][]).filter(([, n]) => n > 0);

  return (
    <>
      {kopregel}
      {sp.error && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Rijen in bestand" value={String(plan.totaal)} />
        <StatTile label="Nieuw" value={String(plan.nieuw.length)} tone="success" hint="worden toegevoegd" />
        <StatTile label="Vallen weg" value={String(weg)} tone={weg > 0 ? "warning" : "neutral"} hint="dubbel, bekend of afgemeld" />
        <StatTile label="Zonder e-mail" value={String(plan.zonderEmail)} hint="wel in de lijst, niet mailbaar" />
        <StatTile label="Al toegevoegd" value={String(batch.insertedCount)} tone={batch.insertedCount > 0 ? "info" : "neutral"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wat er wegvalt, en waarom</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {redenen.length === 0 ? (
              <p className="text-muted">Niets — elke rij in dit bestand is nieuw en bruikbaar.</p>
            ) : (
              <ul className="space-y-1.5">
                {redenen.map(([reden, n]) => (
                  <li key={reden} className="flex items-baseline justify-between gap-3">
                    <span>{REDEN_TEKST[reden]}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            )}
            {plan.voorbeelden.length > 0 && (
              <details className="rounded-md bg-background-soft p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted">
                  Voorbeelden met rijnummer ({plan.voorbeelden.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {plan.voorbeelden.map((v, i) => (
                    <li key={i}>
                      rij {v.rij}: <span className="font-mono">{v.waarde}</span> — {REDEN_TEKST[v.reden]}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-muted">
              Een rij met een onleesbaar e-mailadres wordt niet weggegooid: die komt er zonder adres in, zodat naam,
              telefoon en plaats bewaard blijven.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Importeren</CardTitle>
            {batch.status === "done" && <Badge tone="success">Klaar</Badge>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Herkomst</dt>
              <dd>{batch.provenance}</dd>
              {batch.vendor && (
                <>
                  <dt className="text-muted">Leverancier</dt>
                  <dd>
                    {batch.vendor}
                    {batch.acquiredAt ? ` · ${formatDate(batch.acquiredAt)}` : ""}
                    {batch.vendorRef ? ` · ${batch.vendorRef}` : ""}
                  </dd>
                </>
              )}
              <dt className="text-muted">Categorie</dt>
              <dd>{batch.defaultCategory}</dd>
              <dt className="text-muted">Taal</dt>
              <dd>{batch.language}</dd>
              <dt className="text-muted">Blad · kopregel</dt>
              <dd>
                {batch.sheetName} · rij {batch.headerRow}
              </dd>
            </dl>

            {nogTeDoen > 0 ? (
              <ApplyButton id={id} aantal={nogTeDoen} applyAction={applyImport} />
            ) : (
              <p className="rounded-md bg-success/10 px-3 py-2 text-success">
                Alles uit deze lijst staat in het CRM — {batch.insertedCount} prospects.{" "}
                <Link href="/leads/prospects" className="underline">
                  Bekijk de lijst
                </Link>
              </p>
            )}
            <Link href={`/leads/import/${id}?stap=kolommen`} className="block text-xs underline">
              Kolommen opnieuw kiezen
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Eerste {Math.min(VOORBEELD_RIJEN, plan.nieuw.length)} rijen zoals ze erin komen</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Rij</th>
                <th className="px-3 py-2 text-left">Bedrijf</th>
                <th className="px-3 py-2 text-left">E-mail</th>
                <th className="px-3 py-2 text-left">Plaats</th>
                <th className="px-3 py-2 text-left">Branche</th>
                <th className="px-3 py-2 text-left">Labels</th>
              </tr>
            </thead>
            <tbody>
              {plan.nieuw.slice(0, VOORBEELD_RIJEN).map((n) => (
                <tr key={n.rij} className="border-t border-border">
                  <td className="px-3 py-2 text-muted tabular-nums">{n.rij}</td>
                  <td className="px-3 py-2 font-medium">{n.companyName}</td>
                  <td className="px-3 py-2">{n.email ?? <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2 text-muted">{[n.postalCode, n.city].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2 text-muted">{n.sector ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted">{n.tags?.join(" · ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
