/**
 * Inloggen met de link uit een melding-mail — één knop, geen wachtwoord.
 *
 * De link logt bewust NIET in bij het openen: mailscanners van Gmail en Outlook
 * halen links vooraf op om ze te controleren, en dan zou er een sessie voor die
 * scanner ontstaan. Pas de knop (een POST) maakt de sessie aan. Dezelfde reden
 * waarom de goedkeurlink van een inkoopfactuur ook alleen een pagina opent.
 */
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { resolveLoginToken } from "@/lib/login-links";
import { loginWithTokenAction } from "./actions";

export const metadata = { title: "Inloggen" };
export const dynamic = "force-dynamic";

export default async function LoginLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const { next } = await searchParams;
  const user = await resolveLoginToken(token);

  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{user ? `Inloggen als ${user.name ?? user.email}` : "Link niet geldig"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {user ? (
            <>
              <p className="text-muted">
                Deze link hoort bij <strong>{user.email}</strong> en is persoonlijk — stuur hem niet door, want wie hem
                heeft kan met jouw account werken.
              </p>
              <form action={loginWithTokenAction.bind(null, token, next ?? "/")}>
                <SubmitButton variant="primary" pendingLabel="Bezig…">
                  Inloggen
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <p>Deze inloglink is verlopen of hoort niet bij een account. Log in met je e-mailadres en wachtwoord.</p>
              <p>
                <Link href="/login" className="text-accent hover:underline">
                  Naar het inlogscherm
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
