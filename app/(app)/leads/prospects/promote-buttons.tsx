"use client";

import { useState } from "react";

/**
 * Twee knoppen op één regel: contact of klant. Met een bevestiging, want dit is
 * het moment dat een rij uit de koude lijst in de contactenlijst terechtkomt —
 * en dat is precies wat je niet per ongeluk wil doen.
 */
export function PromoteButtons({
  id,
  naam,
  action,
}: {
  id: string;
  naam: string;
  action: (id: string, formData: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const verstuur = (type: "lead" | "customer") => async (formData: FormData) => {
    formData.set("type", type);
    setBusy(true);
    try {
      await action(id, formData);
    } finally {
      setBusy(false);
    }
  };

  const klik = (wat: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!confirm(`"${naam}" als ${wat} in de contactenlijst zetten?`)) e.preventDefault();
  };

  return (
    <span className="flex justify-end gap-2">
      <form action={verstuur("lead")}>
        <button type="submit" disabled={busy} onClick={klik("lead")} className="text-xs text-accent hover:underline disabled:opacity-50">
          → contact
        </button>
      </form>
      <form action={verstuur("customer")}>
        <button type="submit" disabled={busy} onClick={klik("klant")} className="text-xs text-accent hover:underline disabled:opacity-50">
          → klant
        </button>
      </form>
    </span>
  );
}
