import { randomUUID } from "node:crypto";
import { Check, ListChecks, Plus } from "lucide-react";

import { actielijstLeden, actielijstLinkVoorToken, noteerActielijstBezoek } from "@/lib/actielijst-link";
import { laadActielijst, type Weergave } from "@/lib/actielijst-db";
import { ACTIE_STATUSSEN, actieKleur, bestaandeIndeling, groepeer, isAchterstallig } from "@/lib/actielijst";
import { agendaDay, AGENDA_TIME_ZONE } from "@/lib/agenda-dates";
import { archiefViaLink, klaarViaLink, opmerkingViaLink, puntBewarenViaLink } from "./actions";

/**
 * De actielijst op de telefoon, via een persoonlijke link — zonder inloggen.
 *
 * Opzet: één kolom, grote raakvlakken, geen modals en geen JavaScript dat iets
 * moet laden. Afvinken is een gewone knop in een formulier, een punt openen is
 * een `<details>`. Daardoor werkt de lijst ook op een slechte verbinding en
 * blijft de pagina klein.
 *
 * Nederlands, want deze lijst is van vier Nederlandstalige collega's. Komt er
 * iemand bij die Spaans leest, dan gaan deze teksten naar het woordenboek
 * (`lib/i18n`) zoals de rest van het CRM.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata() {
  // Nooit indexeren en geen referrer meegeven: de link ís de sleutel.
  return { title: "Actielijst", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

const MELDING: Record<string, string> = {
  deadline: "Die deadline kon niet worden gelezen. Kies een datum uit de kalender.",
  wie: "Die collega kan niet bij de actielijst. Kies iemand anders.",
  weg: "Dat punt staat niet meer in de lijst.",
  invoer: "Niet opgeslagen — vul in elk geval een groep en een actiepunt in.",
  opmerking: "De opmerking is niet geplaatst. Probeer het opnieuw.",
};

const veld = "w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base";
const knop = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-base font-semibold text-white";
const knopLicht = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-base";

export default async function ActielijstViaLink({ params, searchParams }: Props) {
  const { token } = await params, sp = await searchParams;
  const lid = await actielijstLinkVoorToken(token);
  if (!lid) return <main className="mx-auto max-w-md p-6">
    <h1 className="text-xl font-semibold">Deze link werkt niet meer</h1>
    <p className="mt-2 text-stone-600">Vraag Nick om een nieuwe link naar de actielijst.</p>
  </main>;
  await noteerActielijstBezoek(lid.linkId);

  const weergave: Weergave = sp.toon === "alles" ? "alles" : sp.toon === "weg" ? "archief" : "open";
  const alleenIk = sp.wie === "mij", nieuwOpen = sp.nieuw === "1";
  const vandaag = agendaDay(new Date());
  const [{ rijen, alles, opmerkingen }, leden] = await Promise.all([
    laadActielijst({ weergave, alleenVoor: alleenIk ? lid.userId : null }),
    actielijstLeden(),
  ]);
  const indeling = bestaandeIndeling(alles);
  const open = alles.filter(r => r.status !== "done"), teLaat = open.filter(r => isAchterstallig(r, vandaag));
  const voornaam = (naam: string | null) => (naam ?? "").split(" ")[0];
  const kort = (dag: string) => new Date(`${dag}T12:00:00Z`).toLocaleDateString("nl-NL", { timeZone: "UTC", day: "numeric", month: "short" });
  const tijd = (at: Date) => at.toLocaleString("nl-NL", { timeZone: AGENDA_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const query = new URLSearchParams([...(weergave === "alles" ? [["toon", "alles"]] : []), ...(alleenIk ? [["wie", "mij"]] : [])] as [string, string][]).toString();
  const terugQuery = query ? `?${query}` : "";
  const href = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) { if (v === null) p.delete(k); else p.set(k, v); }
    const s = p.toString();
    return `/lijst/${token}${s ? `?${s}` : ""}`;
  };
  const tab = (naam: string, actief: boolean, doel: string) => <a key={naam} href={doel} className={`rounded-full px-4 py-2 text-sm font-medium ${actief ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-700"}`}>{naam}</a>;
  const verborgenVelden = <><input type="hidden" name="token" value={token}/><input type="hidden" name="terug" value={terugQuery}/></>;
  const melding = typeof sp.melding === "string" ? MELDING[sp.melding] : undefined;

  const puntVelden = (rij?: typeof rijen[number]) => <>
    <label className="block text-sm font-medium text-stone-700">Groep
      <input name="groupName" required minLength={2} maxLength={60} defaultValue={rij?.groupName ?? ""} list="groepen" className={`mt-1 ${veld}`} placeholder="Showroom"/>
    </label>
    <label className="block text-sm font-medium text-stone-700">Actiepunt
      <input name="title" required minLength={3} maxLength={200} defaultValue={rij?.title ?? ""} className={`mt-1 ${veld}`} placeholder="Stalenkast opruimen"/>
    </label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-medium text-stone-700">Wie
        <select name="assigneeId" defaultValue={rij?.assigneeId ?? ""} className={`mt-1 ${veld}`}>
          <option value="">Nog niemand</option>
          {leden.map(l => <option key={l.id} value={l.id}>{voornaam(l.name) || l.email}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-stone-700">Deadline
        <input type="date" name="dueDate" min="2000-01-01" max="2100-12-31" defaultValue={rij?.dueDate ?? ""} className={`mt-1 ${veld}`}/>
      </label>
    </div>
    <details className="rounded-xl bg-stone-50 px-3 py-2">
      <summary className="cursor-pointer py-1 text-sm text-stone-600">Meer invullen</summary>
      <div className="space-y-3 py-2">
        <label className="block text-sm font-medium text-stone-700">Subgroep
          <input name="subgroup" maxLength={60} defaultValue={rij?.subgroup ?? ""} list="subgroepen" className={`mt-1 ${veld}`} placeholder="Stalen"/>
        </label>
        <label className="block text-sm font-medium text-stone-700">Toelichting
          <textarea name="description" rows={3} maxLength={4000} defaultValue={rij?.description ?? ""} className={`mt-1 ${veld}`}/>
        </label>
        <label className="block text-sm font-medium text-stone-700">Samen met
          <input name="helpers" maxLength={200} defaultValue={rij?.helpers ?? ""} className={`mt-1 ${veld}`} placeholder="Wie je er verder bij nodig hebt"/>
        </label>
        <label className="block text-sm font-medium text-stone-700">Status
          <select name="status" defaultValue={rij?.status ?? "open"} className={`mt-1 ${veld}`}>
            {ACTIE_STATUSSEN.map(s => <option key={s} value={s}>{s === "open" ? "Open" : s === "in_progress" ? "Bezig" : "Klaar"}</option>)}
          </select>
        </label>
      </div>
    </details>
  </>;

  return <main className="mx-auto max-w-xl px-4 pt-5 pb-28">
    <datalist id="groepen">{indeling.groepen.map(g => <option key={g} value={g}/>)}</datalist>
    <datalist id="subgroepen">{indeling.subgroepen.map(g => <option key={g} value={g}/>)}</datalist>

    <header className="mb-4">
      <p className="text-sm text-stone-500">Hoi {voornaam(lid.name) || "collega"}</p>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ListChecks size={22}/>Actielijst</h1>
      <p className="mt-1 text-sm text-stone-600">{open.length} te doen{teLaat.length ? <> · <span className="font-semibold text-red-700">{teLaat.length} te laat</span></> : null}</p>
    </header>

    {melding && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{melding}</p>}

    <div className="mb-5 flex flex-wrap gap-2">
      {tab("Te doen", weergave === "open", href({ toon: null }))}
      {tab("Alles", weergave === "alles", href({ toon: "alles" }))}
      {tab("Weggehaald", weergave === "archief", href({ toon: "weg" }))}
      {tab(alleenIk ? "Alleen van mij" : "Van iedereen", alleenIk, alleenIk ? href({ wie: null }) : href({ wie: "mij" }))}
    </div>

    {rijen.length ? groepeer(rijen).map(groep => <section key={groep.groep} className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{groep.groep}</h2>
      {groep.subgroepen.map(sub => <div key={sub.naam ?? "-"} className="mb-3 space-y-2">
        {sub.naam && <p className="pt-1 text-sm font-medium text-stone-600">{sub.naam}</p>}
        {sub.regels.map(rij => {
          const kleur = actieKleur(rij, vandaag), eigen = opmerkingen.filter(o => o.itemId === rij.id);
          return <div key={rij.id} id={`punt-${rij.id}`} className={`flex items-start gap-2 rounded-2xl border p-2 ${kleur === "achterstallig" ? "border-red-300 bg-red-50" : kleur === "klaar" ? "border-green-200 bg-green-50/70" : kleur === "bezig" ? "border-amber-200 bg-amber-50/60" : "border-stone-200 bg-white"}`}>
            <form action={klaarViaLink}>
              {verborgenVelden}<input type="hidden" name="id" value={rij.id}/>
              <button name="klaar" value={rij.status === "done" ? "0" : "1"} aria-label={`${rij.status === "done" ? "Terugzetten" : "Afvinken"}: ${rij.title}`}
                className={`grid size-12 place-items-center rounded-xl border-2 ${rij.status === "done" ? "border-green-600 bg-green-600 text-white" : "border-stone-300 bg-white"}`}>
                {rij.status === "done" ? <Check size={22}/> : null}
              </button>
            </form>
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer list-none px-1 py-2">
                <p className={`font-medium leading-snug ${rij.status === "done" ? "text-stone-500 line-through" : ""}`}>{rij.title}</p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {rij.assigneeName ? voornaam(rij.assigneeName) : "nog niemand"}
                  {rij.dueDate && <> · <span className={kleur === "achterstallig" ? "font-semibold text-red-700" : ""}>{kort(rij.dueDate)}</span></>}
                  {rij.status === "in_progress" && " · bezig"}
                  {eigen.length ? ` · ${eigen.length} opmerking${eigen.length === 1 ? "" : "en"}` : ""}
                </p>
              </summary>
              <div className="space-y-4 px-1 pb-2">
                {rij.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{rij.description}</p>}
                {rij.helpers && <p className="text-sm text-stone-600">Samen met: {rij.helpers}</p>}

                <div className="space-y-2">
                  {eigen.map(o => <div key={o.id} className="rounded-xl bg-stone-50 px-3 py-2">
                    <p className="text-xs text-stone-500">{voornaam(o.authorName) || "collega"} · {tijd(o.createdAt)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{o.body}</p>
                  </div>)}
                  <form action={opmerkingViaLink} className="space-y-2">
                    {verborgenVelden}<input type="hidden" name="itemId" value={rij.id}/>
                    <textarea name="body" rows={2} minLength={2} maxLength={2000} required placeholder="Opmerking voor het team…" aria-label="Opmerking" className={veld}/>
                    <button className={knopLicht}>Opmerking plaatsen</button>
                  </form>
                </div>

                <details className="border-t border-stone-200 pt-3">
                  <summary className="cursor-pointer py-1 text-sm font-medium text-stone-600">Punt aanpassen</summary>
                  <form action={puntBewarenViaLink} className="space-y-3 pt-3">
                    {verborgenVelden}<input type="hidden" name="id" value={rij.id}/><input type="hidden" name="nieuw" value="0"/>
                    {puntVelden(rij)}
                    <button className={knop}>Opslaan</button>
                  </form>
                  <form action={archiefViaLink} className="pt-3">
                    {verborgenVelden}<input type="hidden" name="id" value={rij.id}/>
                    <button name="archief" value={rij.archivedAt ? "0" : "1"} className="min-h-12 text-sm text-stone-500 underline">{rij.archivedAt ? "Terugzetten in de lijst" : "Uit de lijst halen"}</button>
                  </form>
                </details>
              </div>
            </details>
          </div>;
        })}
      </div>)}
    </section>) : <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center">
      <p className="font-semibold">{weergave === "archief" ? "Niets uit de lijst gehaald." : alleenIk ? "Niets voor jou op de lijst." : "Nog geen actiepunten."}</p>
      <p className="mt-1 text-sm text-stone-600">Zet erin wat er moet gebeuren — showroom, magazijn, logistiek, social media.</p>
    </div>}

    <details id="nieuw" open={nieuwOpen} className="mt-6 rounded-2xl border border-stone-200 bg-white p-3">
      <summary className="cursor-pointer list-none py-2 text-base font-semibold"><span className="flex items-center gap-2"><Plus size={18}/>Nieuw actiepunt</span></summary>
      <form action={puntBewarenViaLink} className="space-y-3 pt-3">
        {verborgenVelden}<input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="nieuw" value="1"/>
        {puntVelden()}
        <button className={`${knop} w-full`}>Toevoegen</button>
      </form>
    </details>

    <p className="mt-6 text-center text-xs text-stone-400">Deze link is persoonlijk. Deel hem niet; vraag Nick om een nieuwe als je hem kwijt bent.</p>

    <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
      <a href={`${href({ nieuw: "1" })}#nieuw`} className={`${knop} w-full`}><Plus size={18}/>Nieuw actiepunt</a>
    </div>
  </main>;
}
