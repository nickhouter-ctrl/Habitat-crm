import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { TaalKeuze } from "@/components/taal-keuze";
import { zetTaal } from "@/lib/i18n/actions";
import { huidigeTaal, tekst } from "@/lib/i18n/server";

export const metadata = {
  title: "Sign in · Habitat CRM",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const t = await tekst();
  const locale = await huidigeTaal();
  const params = await searchParams;
  const errorKey = typeof params?.error === "string" ? params.error : undefined;
  const code = typeof params?.code === "string" ? params.code : undefined;
  const callbackUrl = typeof params?.callbackUrl === "string" ? params.callbackUrl : "/";

  /**
   * De melding. "Te veel pogingen" is bewust een ander bericht dan "wachtwoord
   * klopt niet": iemand met het juiste wachtwoord die "onjuist" te zien krijgt,
   * blijft het proberen — en loopt de teller daarmee verder op.
   */
  const wachtMinuten = code?.startsWith("te_veel_pogingen:")
    ? Number(code.split(":")[1]) || 15
    : null;
  const melding = wachtMinuten
    ? t(
        "Te veel inlogpogingen. Wacht {minuten} minuten en probeer het dan opnieuw — je wachtwoord hoef je niet te veranderen.",
        { minuten: wachtMinuten },
      )
    : errorKey === "CredentialsSignin"
      ? t("Onjuist e-mailadres of wachtwoord.")
      : errorKey
        ? t("Inloggen mislukt. Probeer het opnieuw.")
        : null;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? "").toLowerCase().trim(),
        password: String(formData.get("password") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        // `code` draagt de reden; zonder dat wordt elke fout "wachtwoord fout".
        const reden = (error as { code?: string }).code;
        redirect(
          `/login?error=${error.type ?? "default"}${reden ? `&code=${encodeURIComponent(reden)}` : ""}`,
        );
      }
      throw error; // re-throw NEXT_REDIRECT etc.
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
            H
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Habitat CRM</h1>
          <p className="mt-1 text-sm text-muted">{t("Log in om verder te gaan")}</p>
        </div>

        <form action={authenticate} className="space-y-4 rounded-xl border bg-surface p-6 shadow-sm">
          {melding && (
            <p
              className={
                wachtMinuten
                  ? "rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
                  : "rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
              }
            >
              {melding}
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              {t("E-mailadres")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-base sm:text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              {t("Wachtwoord")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-base sm:text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            {t("Inloggen")}
          </button>
        </form>

        {/* Taal kiezen vóór het inloggen: wie het scherm niet kan lezen, komt
            nooit bij de instelling die achter de login zit. */}
        <TaalKeuze huidig={locale} zet={zetTaal} className="mt-5 justify-center" />
      </div>
    </main>
  );
}
