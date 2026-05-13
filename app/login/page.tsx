import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

export const metadata = {
  title: "Sign in · Habitat CRM",
};

const ERRORS: Record<string, string> = {
  CredentialsSignin: "Onjuist e-mailadres of wachtwoord.",
  default: "Inloggen mislukt. Probeer het opnieuw.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const errorKey = typeof params?.error === "string" ? params.error : undefined;
  const callbackUrl =
    typeof params?.callbackUrl === "string" ? params.callbackUrl : "/";

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
        redirect(`/login?error=${error.type ?? "default"}`);
      }
      throw error; // re-throw NEXT_REDIRECT etc.
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
            H
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Habitat CRM</h1>
          <p className="mt-1 text-sm text-muted">Log in om verder te gaan</p>
        </div>

        <form
          action={authenticate}
          className="space-y-4 rounded-xl border bg-surface p-6 shadow-sm"
        >
          {errorKey && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
              {ERRORS[errorKey] ?? ERRORS.default}
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mailadres
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
              Wachtwoord
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
            Inloggen
          </button>
        </form>
      </div>
    </main>
  );
}
