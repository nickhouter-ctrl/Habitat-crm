import { tekst as uiTranslation } from '@/lib/i18n/server';
import Link from "next/link";

import { buttonClass } from "@/components/ui";

/** 404 binnen de app-layout (sidebar blijft staan) i.p.v. de kale Next-404. */
export default async function AppNotFound() {
  const uiT = await uiTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">{uiT("Niet gevonden")}</h1>
        <p className="mt-2 text-sm text-muted">
          {uiT("Deze pagina of dit record bestaat niet (meer), of de link klopt niet.")} </p>
        <div className="mt-4">
          <Link href="/" className={buttonClass({})}>
            {uiT("Naar dashboard")} </Link>
        </div>
      </div>
    </div>
  );
}
