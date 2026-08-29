import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { kiesTaal, klantEmail } from "@/lib/klant-portal";

import { klantT } from "./_t";
import { vraagLoginLink } from "./actions";

const TALEN = [
  { key: "nl", label: "🇳🇱 NL" },
  { key: "en", label: "🇬🇧 EN" },
  { key: "es", label: "🇪🇸 ES" },
] as const;

export default async function KlantLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const taal = kiesTaal(typeof params.lang === "string" ? params.lang : "nl");
  const t = klantT(taal);

  // Al ingelogd → direct door naar de projecten.
  if (await klantEmail()) redirect(`/klant/projecten?lang=${taal}`);

  const verstuurd = params.sent === "1";
  const ongeldig = params.invalid === "1";

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex justify-end gap-1">
        {TALEN.map((l) => (
          <Link
            key={l.key}
            href={`/klant?lang=${l.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${taal === l.key ? "bg-accent text-white" : "bg-surface text-muted hover:bg-border"}`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.portaal}</h1>
      <p className="mb-6 text-sm text-muted">{t.welkom}</p>

      {ongeldig && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t.linkOngeldig}
        </div>
      )}

      {verstuurd ? (
        <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          ✉️ {t.linkGestuurd}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <form action={vraagLoginLink} className="space-y-3">
              <input type="hidden" name="lang" value={taal} />
              <label className="block text-sm font-medium" htmlFor="klant-email">
                {t.emailLabel}
              </label>
              <Input id="klant-email" name="email" type="email" required placeholder="naam@voorbeeld.com" />
              <SubmitButton pendingLabel="…">{t.stuurLink}</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-xs text-muted">{t.disclaimer}</p>
    </div>
  );
}
