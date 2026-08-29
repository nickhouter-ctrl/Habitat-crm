import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { kiesTaal, klantCommissies, klantEmail, klantLosseOffertes, klantProjecten } from "@/lib/klant-portal";
import { formatDate, formatEUR } from "@/lib/utils";

import { klantT } from "../_t";
import { uitloggen } from "../actions";

export default async function KlantProjectenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const taal = kiesTaal(typeof params.lang === "string" ? params.lang : "nl");
  const t = klantT(taal);

  const email = await klantEmail();
  if (!email) redirect(`/klant?lang=${taal}`);

  const [{ projecten }, offertes, commissies] = await Promise.all([
    klantProjecten(email),
    klantLosseOffertes(email),
    klantCommissies(email),
  ]);
  // Eén project en verder niets → meteen door naar de detailpagina.
  if (projecten.length === 1 && offertes.length === 0 && commissies.length === 0)
    redirect(`/klant/project/${projecten[0].id}?lang=${taal}`);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t.mijnProjecten}</h1>
        <span className="flex items-center gap-3">
          <Link href={`/klant/gegevens?lang=${taal}`} className="text-sm text-accent hover:underline">
            {t.mijnGegevens}
          </Link>
          <form action={uitloggen.bind(null, taal)}>
            <SubmitButton variant="ghost" size="sm" pendingLabel="…">
              {t.uitloggen}
            </SubmitButton>
          </form>
        </span>
      </div>

      {projecten.length === 0 && offertes.length === 0 && commissies.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted">{t.geenProjecten}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projecten.map((p) => (
            <Link key={p.id} href={`/klant/project/${p.id}?lang=${taal}`} className="block">
              <Card className="transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3 pt-5">
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    {p.contractPriceEur && (
                      <span className="block text-sm text-muted">
                        {t.aanneemsom}: {formatEUR(p.contractPriceEur)}
                      </span>
                    )}
                  </span>
                  <Badge tone={p.status === "completed" ? "success" : "accent"}>
                    {t.statusLabels[p.status] ?? p.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {offertes.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.mijnOffertes}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/70 text-sm">
            {offertes.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">
                    {t.docLabels.estimate} {o.docNumber ?? ""}
                  </span>
                  {o.title && <span className="block truncate text-xs text-muted">{o.title}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {o.issueDate && <span className="text-xs text-muted">{formatDate(o.issueDate)}</span>}
                  <span className="font-medium tabular-nums">{formatEUR(o.totalEur)}</span>
                  <a href={`/klant/document/${o.id}/pdf`} target="_blank" className="text-accent hover:underline">
                    {t.pdf}
                  </a>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {commissies.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.commissies}</CardTitle>
            <span className="text-xs text-muted">{t.commissieUitleg}</span>
          </CardHeader>
          <CardContent className="divide-y divide-border/70 text-sm">
            {commissies.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{c.refereeNaam}</span>
                <span className="flex shrink-0 items-center gap-4 text-xs">
                  <span className="text-muted">{Number(c.commissionPct)}%</span>
                  <span>
                    {t.opgebouwd}: <strong className="tabular-nums">{formatEUR(c.opgebouwd)}</strong>
                  </span>
                  <span>
                    {t.uitbetaald}: <strong className="tabular-nums">{formatEUR(c.uitbetaald)}</strong>
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
