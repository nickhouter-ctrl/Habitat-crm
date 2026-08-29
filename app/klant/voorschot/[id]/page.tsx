import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui";
import { kiesTaal, klantEmail, klantVoorschotBericht } from "@/lib/klant-portal";
import { formatDate } from "@/lib/utils";

import { klantT } from "../../_t";

/**
 * Het originele voorschotbericht (met rekeningnummer en betaalinstructies),
 * precies zoals het per mail is verstuurd. Eigen gegenereerde inhoud, dus
 * veilig om als HTML te tonen; eigendom wordt per opvraag gecontroleerd.
 */
export default async function KlantVoorschotPage({
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
  const bericht = await klantVoorschotBericht(email, id);
  if (!bericht) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={bericht.projectId ? `/klant/project/${bericht.projectId}?lang=${taal}` : `/klant/projecten?lang=${taal}`}
        className="text-xs text-muted hover:underline"
      >
        ← {t.mijnProjecten}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.voorschotten}</h1>
      {bericht.datum && <p className="mb-5 text-sm text-muted">{formatDate(bericht.datum)}</p>}

      <Card>
        <CardContent className="pt-5">
          {bericht.html ? (
            <div className="[&_a]:text-accent" dangerouslySetInnerHTML={{ __html: bericht.html }} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">{bericht.body}</pre>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted">{t.disclaimer}</p>
    </div>
  );
}
