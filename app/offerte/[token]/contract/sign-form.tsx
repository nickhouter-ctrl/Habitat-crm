"use client";

import { useActionState } from "react";

import { signContract, type SignState } from "../../actions";

/**
 * Het ondertekenformulier. Alle vinkjes zijn verplicht en staan standaard uit;
 * de verborgen `snapshotSha256` is de vingerafdruk van wat er op dít scherm
 * stond, zodat de server kan weigeren als de offerte inmiddels is bijgewerkt.
 */
export function SignForm({
  token,
  checks,
  snapshotSha256,
  vraagTaxId,
  defaultEmail,
  defaultName,
  t,
}: {
  token: string;
  checks: { key: string; text: string }[];
  snapshotSha256: string;
  vraagTaxId: boolean;
  defaultEmail: string;
  defaultName: string;
  t: {
    sign: string;
    signIntro: string;
    yourName: string;
    yourEmail: string;
    yourTaxId: string;
    submit: string;
  };
}) {
  const actie = signContract.bind(null, token);
  const [state, formAction, pending] = useActionState<SignState, FormData>(actie, null);

  return (
    <form action={formAction} className="mt-6 rounded-xl border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold">{t.sign}</h2>
      <p className="mt-1 text-sm text-muted">{t.signIntro}</p>

      <input type="hidden" name="snapshotSha256" value={snapshotSha256} />

      <div className="mt-4 space-y-3">
        {checks.map((c) => (
          <label key={c.key} className="flex cursor-pointer gap-3 text-sm">
            <input
              type="checkbox"
              name={`consent:${c.key}`}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>{c.text}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t.yourName}</span>
          <input
            name="name"
            required
            autoComplete="name"
            defaultValue={defaultName}
            className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t.yourEmail}</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={defaultEmail}
            className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        {vraagTaxId && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t.yourTaxId}</span>
            <input
              name="taxId"
              className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
        )}
      </div>

      {state?.error && (
        <p className="mt-4 rounded-md border bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
      {state?.ok && (
        <p className="mt-4 rounded-md border bg-green-50 px-3 py-2 text-sm text-success">{state.ok}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "…" : `✍️ ${t.submit}`}
      </button>
    </form>
  );
}
