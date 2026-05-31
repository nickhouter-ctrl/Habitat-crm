"use client";

import type { ReactNode } from "react";

/**
 * Submit-knop met een bevestigingsvraag — voor onomkeerbare acties (verwijderen).
 * Gebruik binnen een <form action={serverAction}>.
 */
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        // Voorkom dat de klik de rij (RowLink) activeert.
        e.stopPropagation();
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
