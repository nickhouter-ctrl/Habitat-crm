"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { akkoordAction, kiesAction, voorstelAction } from "./actions";

type Tekst = {
  anders: string; akkoordKnop: string; kiesDit: string; geenVanDeze: string; voorstelLabel: string; berichtLabel: string; berichtHint: string; verstuur: string; wijzig: string;
};
const FOUT: Record<string, Record<string, string>> = {
  ongeldig: { nl: "Kies een moment in de toekomst.", en: "Please choose a time in the future.", es: "Elige un momento futuro.", de: "Bitte wähle einen Zeitpunkt in der Zukunft." },
  voorbij: { nl: "Deze afspraak kan niet meer worden gewijzigd.", en: "This appointment can no longer be changed.", es: "Esta cita ya no se puede modificar.", de: "Dieser Termin kann nicht mehr geändert werden." },
  onbekend: { nl: "Deze link is niet geldig.", en: "This link is not valid.", es: "Este enlace no es válido.", de: "Dieser Link ist nicht gültig." },
};

/**
 * De keuzes van de klant. Een knop in de mail opent deze pagina met de keuze
 * al geselecteerd, maar vastleggen gebeurt pas hier met een klik.
 */
export function AfspraakReactie({ token, t, taal, soort, momenten, beantwoord, gekozen, startMetVoorstel }: {
  token: string; t: Tekst; taal: string; soort: "fixed" | "choice" | "open";
  momenten: { index: number; label: string }[]; beantwoord: boolean; gekozen: number | null; startMetVoorstel: boolean;
}) {
  const router = useRouter();
  const [bezig, start] = useTransition();
  const [voorstel, setVoorstel] = useState(startMetVoorstel || (soort === "open" && !beantwoord));
  const [moment, setMoment] = useState("");
  const [bericht, setBericht] = useState("");
  const [fout, setFout] = useState("");
  const klaar = (r: { ok: boolean; fout?: string }) => {
    if (!r.ok) return setFout(FOUT[r.fout ?? "onbekend"]?.[taal] ?? FOUT.onbekend.en);
    setFout(""); setVoorstel(false); router.refresh();
  };
  const hoofd = "w-full rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50";
  const tweede = "w-full rounded-xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-800 disabled:opacity-50";

  return (
    <div className="mt-6 space-y-3">
      {!beantwoord && !voorstel && soort === "fixed" && (
        <button disabled={bezig} className={hoofd} onClick={() => start(async () => klaar(await akkoordAction(token)))}>{t.akkoordKnop}</button>
      )}
      {!beantwoord && !voorstel && soort === "choice" && momenten.map((m) => (
        <button key={m.index} disabled={bezig} onClick={() => start(async () => klaar(await kiesAction(token, m.index)))}
          className={`${gekozen === m.index ? hoofd : tweede} text-left first-letter:uppercase`}>
          <span className="block">{m.label}</span>
          <span className="mt-0.5 block text-xs font-normal opacity-75">{t.kiesDit}</span>
        </button>
      ))}
      {!voorstel && (
        <button disabled={bezig} className={tweede} onClick={() => setVoorstel(true)}>
          {beantwoord ? t.wijzig : soort === "choice" ? t.geenVanDeze : t.anders}
        </button>
      )}
      {voorstel && (
        <form className="space-y-3 rounded-xl border border-stone-200 p-4" onSubmit={(e) => {
          e.preventDefault();
          // Het invoerveld is in de tijdzone van het apparaat van de klant.
          const op = new Date(moment);
          if (!moment || Number.isNaN(op.getTime())) return setFout(FOUT.ongeldig[taal] ?? FOUT.ongeldig.en);
          start(async () => klaar(await voorstelAction(token, op.toISOString(), bericht)));
        }}>
          <label className="grid gap-1 text-sm font-medium text-stone-800">{t.voorstelLabel}
            <input type="datetime-local" required value={moment} onChange={(e) => setMoment(e.target.value)} className="rounded-lg border border-stone-300 px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-800">{t.berichtLabel}
            <textarea rows={3} maxLength={1000} value={bericht} onChange={(e) => setBericht(e.target.value)} placeholder={t.berichtHint} className="rounded-lg border border-stone-300 px-3 py-2 font-normal" />
          </label>
          <button disabled={bezig} className={hoofd}>{t.verstuur}</button>
        </form>
      )}
      {fout && <p role="alert" className="text-center text-sm text-red-700">{fout}</p>}
    </div>
  );
}
