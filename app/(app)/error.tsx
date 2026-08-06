"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";

import { buttonClass } from "@/components/ui";

/**
 * Boundary voor de authenticated app: een gefaalde pagina of server action
 * toont een herstelbare melding binnen de app-layout in plaats van de kale
 * Next.js-500. In productie redigeert Next de foutmelding; de digest is dan
 * het opzoeknummer voor de Vercel-logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Er ging iets mis</h1>
        <p className="mt-2 text-sm text-muted">
          {error.message || "Onbekende fout — probeer het opnieuw."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-muted opacity-70">Foutcode: {error.digest}</p>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={reset} className={buttonClass({})}>
            <RotateCcw className="h-4 w-4" /> Opnieuw proberen
          </button>
          <Link href="/" className={buttonClass({ variant: "secondary" })}>
            Naar dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
