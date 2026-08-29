import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, Card, CardContent } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { kiesTaal, klantEmail, klantProjecten } from "@/lib/klant-portal";
import { formatEUR } from "@/lib/utils";

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

  const { projecten } = await klantProjecten(email);
  // Eén project → meteen door naar de detailpagina.
  if (projecten.length === 1) redirect(`/klant/project/${projecten[0].id}?lang=${taal}`);

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

      {projecten.length === 0 ? (
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
    </div>
  );
}
