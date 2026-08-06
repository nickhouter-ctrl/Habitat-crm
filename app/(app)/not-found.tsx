import Link from "next/link";

import { buttonClass } from "@/components/ui";

/** 404 binnen de app-layout (sidebar blijft staan) i.p.v. de kale Next-404. */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Niet gevonden</h1>
        <p className="mt-2 text-sm text-muted">
          Deze pagina of dit record bestaat niet (meer), of de link klopt niet.
        </p>
        <div className="mt-4">
          <Link href="/" className={buttonClass({})}>
            Naar dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
