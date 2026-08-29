import Link from "next/link";
import { redirect } from "next/navigation";

import { emailUitVerlopenLoginToken, kiesTaal, klantEmail, verifieerLoginToken } from "@/lib/klant-portal";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui";

import { klantT } from "../../_t";
import { loginMetToken, stuurNieuweLink } from "../../actions";

/**
 * Klik-om-in-te-loggen: bewust een POST-knop i.p.v. automatisch inloggen bij
 * GET — mailscanners openen links en zouden de sessie anders "opeten".
 *
 * Herlogin-vriendelijk: wie al een geldige sessie heeft gaat meteen door
 * (ook met een verlopen link), en een verlopen-maar-echte link biedt één
 * klik om een verse link naar hetzelfde adres te sturen.
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

  // Al ingelogd? Dan is de (verlopen) link irrelevant — gewoon door.
  if (await klantEmail()) redirect(`/klant/projecten?lang=${taal}`);

  const geldig = !!verifieerLoginToken(token);
  const verlopenEmail = geldig ? null : emailUitVerlopenLoginToken(token);

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
      ) : verlopenEmail ? (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-muted">{t.linkVerlopen}</p>
            <form action={stuurNieuweLink.bind(null, token, taal)}>
              <SubmitButton pendingLabel="…">{t.stuurNieuweLink}</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {t.linkOngeldig}
          </div>
          <Link href={`/klant?lang=${taal}`} className="inline-block text-sm text-accent hover:underline">
            → {t.portaal}
          </Link>
        </div>
      )}
    </div>
  );
}
