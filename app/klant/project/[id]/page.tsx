import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge, Card, CardContent, CardHeader, CardTitle, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { kiesTaal, klantEmail, klantProjectDetail } from "@/lib/klant-portal";
import { formatDate, formatEUR } from "@/lib/utils";

import { klantT } from "../../_t";

const DOC_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  partially_paid: "warning",
  overdue: "danger",
};

export default async function KlantProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const taal = kiesTaal(typeof sp.lang === "string" ? sp.lang : "nl");
  const t = klantT(taal);

  const email = await klantEmail();
  if (!email) redirect(`/klant?lang=${taal}`);

  const detail = await klantProjectDetail(email, id);
  if (!detail) notFound();
  const { project, fases, docs, betalingen, meerwerk } = detail;

  // Gewogen totaalvoortgang: gelijke weging per fase (zelfde beeld als de
  // voortgangs-PDF wanneer er geen begrotingsbedragen per fase zijn).
  const totaalPct =
    fases.length > 0 ? Math.round(fases.reduce((s, f) => s + (f.progressPct ?? 0), 0) / fases.length) : null;

  const facturen = docs.filter((d) => d.kind !== "estimate");
  const openstaand = facturen
    .filter((d) => d.kind !== "creditnote")
    .reduce((s, d) => s + Math.max(0, Number(d.totalEur ?? 0) - Number(d.paidEur ?? 0)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/klant/projecten?lang=${taal}`} className="text-xs text-muted hover:underline">
            ← {t.mijnProjecten}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        </div>
        <Badge tone={project.status === "completed" ? "success" : "accent"}>
          {t.statusLabels[project.status] ?? project.status}
        </Badge>
      </div>

      {/* Voortgang */}
      <Card>
        <CardHeader>
          <CardTitle>{t.voortgang}</CardTitle>
          {totaalPct != null && <span className="text-sm font-semibold">{totaalPct}%</span>}
        </CardHeader>
        <CardContent className="space-y-3">
          {totaalPct != null && (
            <div className="h-3 overflow-hidden rounded-full bg-border/60">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${totaalPct}%` }} />
            </div>
          )}
          {fases.length === 0 && <p className="text-sm text-muted">—</p>}
          {fases.map((f) => (
            <div key={f.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{f.name}</span>
                <span className="text-muted">
                  {f.progressPct >= 100 ? `✓ ${t.klaar}` : `${f.progressPct}%`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-border/60">
                <div className="h-full rounded-full bg-success/80" style={{ width: `${f.progressPct}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Facturen & termijnen */}
      <Card>
        <CardHeader>
          <CardTitle>{t.betalingen}</CardTitle>
          {openstaand > 0.01 && (
            <span className="text-sm">
              {t.openstaand}: <strong>{formatEUR(openstaand)}</strong>
            </span>
          )}
        </CardHeader>
        {docs.length === 0 ? (
          <CardContent className="text-sm text-muted">—</CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>{t.document}</Th>
                <Th>{t.datum}</Th>
                <Th className="text-right">{t.bedrag}</Th>
                <Th className="text-right">{t.betaald}</Th>
                <Th>{t.status}</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {docs.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium">
                    {t.docLabels[d.kind] ?? d.kind} {d.docNumber ?? ""}
                  </Td>
                  <Td className="text-muted">{d.issueDate ? formatDate(d.issueDate) : "—"}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(d.totalEur)}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(d.paidEur)}</Td>
                  <Td>
                    <Badge tone={DOC_STATUS_TONE[d.status] ?? "neutral"}>
                      {d.status === "paid" ? t.betaald : d.status === "overdue" ? t.openstaand : d.status}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <a href={`/klant/document/${d.id}/pdf`} className="text-accent hover:underline" target="_blank">
                      {t.pdf}
                    </a>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Ontvangen betalingen */}
      {betalingen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.ontvangenBetalingen}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/70">
            {betalingen.map((b, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted">
                  {b.date ? formatDate(b.date) : "—"}
                  {b.description ? ` · ${b.description}` : ""}
                </span>
                <span className="font-medium tabular-nums">{formatEUR(b.amountEur)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Meerwerk */}
      {meerwerk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.meerwerk}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/70">
            {meerwerk.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{m.description}</span>
                <span className="font-medium tabular-nums">{formatEUR(m.amountEur)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted">{t.disclaimer}</p>
    </div>
  );
}
