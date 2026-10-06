import type { Metadata } from "next";

import { AFSPRAAK_TEKST, afspraakMoment, afspraakTaal, type AfspraakSoort } from "@/lib/afspraak-reactie";
import { kanReageren, openMomenten, vindAfspraakvoorstel } from "@/lib/afspraak-reactie-db";

import { AfspraakReactie } from "./reactie";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Habitat One", robots: { index: false, follow: false } };

/** Openbare pagina uit het afspraakvoorstel: akkoord, een moment kiezen, of zelf een moment voorstellen. */
export default async function AfspraakPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ actie?: string; kies?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const r = await vindAfspraakvoorstel(token);
  const taal = afspraakTaal(r?.inv.lang);
  const t = AFSPRAAK_TEKST[taal];

  let inhoud: React.ReactNode;
  if (!r) {
    inhoud = <p className="text-center text-stone-600">{t.pagina.onbekend}</p>;
  } else {
    const { inv, afspraak } = r;
    const soort = inv.mode as AfspraakSoort;
    const open = kanReageren(r);
    const beantwoord = ["accepted", "chosen", "proposed"].includes(inv.status);
    const vast = afspraak?.startsAt ?? null;
    const momenten = openMomenten(inv).map((m) => ({ index: m.index, label: afspraakMoment(m.op, taal) }));
    const gekozen = sp.kies != null && /^\d$/.test(sp.kies) ? Number(sp.kies) : null;
    inhoud = (
      <>
        <h1 className="text-center text-2xl font-semibold text-stone-900">{t.pagina.titel}</h1>
        {inv.status === "cancelled" ? (
          <p className="mt-6 text-center text-sm text-stone-600">{t.pagina.ingetrokken}</p>
        ) : (
          <>
            {vast && (
              <div className="mt-6 rounded-xl bg-stone-100 px-5 py-4 text-center">
                <p className="text-lg font-semibold first-letter:uppercase text-stone-900">{afspraakMoment(vast, taal)}</p>
                <p className="mt-0.5 text-xs text-stone-500">{t.tijdzone}</p>
                {inv.location && <p className="mt-2 text-sm text-stone-700">{inv.location}</p>}
              </div>
            )}
            {!vast && soort === "choice" && !beantwoord && <p className="mt-4 text-center text-sm text-stone-600">{t.intro.choice} <span className="text-stone-400">({t.tijdzone})</span></p>}
            {!vast && soort === "open" && !beantwoord && <p className="mt-4 text-center text-sm text-stone-600">{t.pagina.openIntro}</p>}
            {!vast && inv.location && <p className="mt-2 text-center text-sm text-stone-700">{inv.location}</p>}
            {!open && <p className="mt-6 text-center text-sm text-stone-600">{t.pagina.voorbij}</p>}
            {open && inv.status === "accepted" && <p className="mt-6 text-center text-sm text-emerald-800">{t.pagina.akkoordDank}</p>}
            {open && inv.status === "chosen" && vast && <p className="mt-6 text-center text-sm text-emerald-800">{t.pagina.keuzeDank(afspraakMoment(vast, taal))}</p>}
            {open && inv.status === "proposed" && inv.proposedStartsAt && (
              <p className="mt-6 text-center text-sm text-stone-700">{t.pagina.voorstelDank(afspraakMoment(inv.proposedStartsAt, taal))}</p>
            )}
            {open && (
              <AfspraakReactie token={token} taal={taal} t={{ ...t.pagina, anders: t.anders }} soort={soort} momenten={momenten} beantwoord={beantwoord}
                gekozen={gekozen} startMetVoorstel={sp.actie === "anders" && !beantwoord} />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="mb-7 text-center text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-stone-400">Habitat One</p>
        {inhoud}
      </div>
    </main>
  );
}
