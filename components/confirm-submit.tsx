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
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
