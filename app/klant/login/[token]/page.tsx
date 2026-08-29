import { kiesTaal, verifieerLoginToken } from "@/lib/klant-portal";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui";

import { klantT } from "../../_t";
import { loginMetToken } from "../../actions";

/**
 * Klik-om-in-te-loggen: bewust een POST-knop i.p.v. automatisch inloggen bij
 * GET — mailscanners openen links en zouden de sessie anders "opeten".
 * (Zelfde aanpak als de interne inloglinks.)
 */
export default async function KlantLoginTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const taal = kiesTaal(typeof sp.lang === "string" ? sp.lang : "nl");
  const t = klantT(taal);
  const geldig = !!verifieerLoginToken(token);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t.inloggen}</h1>
      {geldig ? (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-muted">{t.loginUitleg}</p>
            <form action={loginMetToken.bind(null, token, taal)}>
              <SubmitButton pendingLabel="…">{t.loginKnop}</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t.linkOngeldig}
        </div>
      )}
    </div>
  );
}
