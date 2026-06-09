"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit-knop met een bevestigingsvraag — voor onomkeerbare acties (verwijderen).
 * Gebruik binnen een <form action={serverAction}>.
 *
 * Schakelt zichzelf uit zodra het formulier verstuurt (useFormStatus), zodat een
 * trage actie niet per ongeluk dubbel uitgevoerd wordt.
 */
export function ConfirmSubmit({
  message,
  className,
  children,
  pendingLabel = "Bezig…",
}: {
  message: string;
  className?: string;
  children: ReactNode;
  pendingLabel?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        // Voorkom dat de klik de rij (RowLink) activeert.
        e.stopPropagation();
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
