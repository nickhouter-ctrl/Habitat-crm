"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

/**
 * Invoerscherm op de stand — bedoeld voor een iPad die de hele dag aan staat.
 *
 * Twee dingen bepalen het ontwerp:
 *
 * 1. **Niemand mag verloren gaan.** Het wifi op een beursvloer valt weg. Elke
 *    invoer gaat daarom eerst in de localStorage van dit apparaat en pas daarna
 *    naar de server; lukt dat niet, dan blijft hij in de wachtrij staan, zichtbaar
 *    in beeld, en probeert het scherm het vanzelf opnieuw zodra er weer
 *    verbinding is. Pas na een bevestiging van de server gaat hij uit de wachtrij.
 * 2. **Snel achter elkaar.** Na het opslaan staat de cursor weer in het naamveld
 *    en is het formulier leeg; de vorige naam blijft een seconde of vijf in beeld
 *    als bevestiging.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale, useT } from "@/components/taal-provider";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { INTERESSES, ROLLEN } from "@/lib/beurs";
import { landenVoorKeuze } from "@/lib/landen";
import type { BeursResultaat } from "./actions";

type Invoer = {
  /** Eigen id zodat een wachtende invoer herkenbaar blijft. */
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  bedrijf: string;
  plaats: string;
  land: string;
  rol: string;
  rolAnders: string;
  interesses: string[];
  taal: string;
  wens: string;
};

const WACHTRIJ_SLEUTEL = "habitat-beurs-wachtrij";

function leesWachtrij(): Invoer[] {
  try {
    const rauw = localStorage.getItem(WACHTRIJ_SLEUTEL);
    return rauw ? (JSON.parse(rauw) as Invoer[]) : [];
  } catch {
    return [];
  }
}

function schrijfWachtrij(rijen: Invoer[]) {
  try {
    localStorage.setItem(WACHTRIJ_SLEUTEL, JSON.stringify(rijen));
  } catch {
    /* privémodus of vol geheugen: dan valt alleen de extra zekerheid weg */
  }
}

const leeg = (): Invoer => ({
  id: crypto.randomUUID(),
  naam: "",
  email: "",
  telefoon: "",
  bedrijf: "",
  plaats: "",
  land: "ES",
  rol: "architect",
  rolAnders: "",
  interesses: [],
  taal: "es",
  wens: "",
});

export function BeursForm({
  opslaan,
}: {
  opslaan: (formData: FormData) => Promise<BeursResultaat>;
}) {
  const uiT = useUiTranslation();
  const t = useT();
  const taal = useLocale();
  const landen = useMemo(() => landenVoorKeuze(taal), [taal]);
  const [waarden, setWaarden] = useState<Invoer>(leeg);
  const [bezig, setBezig] = useState(false);
  // Een tweede tik komt sneller dan React de knop uitschakelt; een ref is
  // meteen bijgewerkt en houdt hem wél tegen.
  const bezigRef = useRef(false);
  const inhaalRef = useRef(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout" | "wacht"; tekst: string } | null>(null);
  const [wachtrij, setWachtrij] = useState<Invoer[]>([]);
  const naamRef = useRef<HTMLInputElement>(null);

  useEffect(() => setWachtrij(leesWachtrij()), []);

  /** Eén invoer naar de server. Geeft terug of hij binnen is. */
  const verstuur = useCallback(
    async (inv: Invoer): Promise<BeursResultaat | null> => {
      const fd = new FormData();
      fd.set("naam", inv.naam);
      fd.set("email", inv.email);
      fd.set("telefoon", inv.telefoon);
      fd.set("bedrijf", inv.bedrijf);
      fd.set("plaats", inv.plaats);
      fd.set("land", inv.land);
      fd.set("rol", inv.rol);
      fd.set("rolAnders", inv.rolAnders);
      for (const k of inv.interesses) fd.append("interesses", k);
      fd.set("taal", inv.taal);
      fd.set("wens", inv.wens);
      try {
        return await opslaan(fd);
      } catch {
        return null; // verbinding weg — blijft in de wachtrij
      }
    },
    [opslaan],
  );

  /** Alles wat nog wacht opnieuw proberen. */
  const leegWachtrij = useCallback(async () => {
    if (inhaalRef.current) return; // al bezig; anders gaat de wachtrij dubbel
    const rijen = leesWachtrij();
    if (rijen.length === 0) return;
    inhaalRef.current = true;
    const over: Invoer[] = [];
    for (const inv of rijen) {
      const res = await verstuur(inv);
      // Geen verbinding → bewaren. Een inhoudelijke fout (bv. ongeldig adres)
      // ook bewaren, anders verdwijnt hij stilletjes; die zie je in beeld.
      if (!res || !res.ok) over.push(inv);
    }
    schrijfWachtrij(over);
    setWachtrij(over);
    inhaalRef.current = false;
    if (over.length === 0 && rijen.length > 0) {
      setMelding({ soort: "ok", tekst: t("{n} wachtende invoer(en) alsnog verstuurd.", { n: rijen.length }) });
    }
  }, [verstuur, t]);

  // Bij terugkerende verbinding automatisch opnieuw proberen.
  useEffect(() => {
    const opWeerOnline = () => void leegWachtrij();
    window.addEventListener("online", opWeerOnline);
    const timer = setInterval(() => {
      if (navigator.onLine && leesWachtrij().length > 0) void leegWachtrij();
    }, 30_000);
    return () => {
      window.removeEventListener("online", opWeerOnline);
      clearInterval(timer);
    };
  }, [leegWachtrij]);

  async function opsturen(e: React.FormEvent) {
    e.preventDefault();
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    setMelding(null);
    const inv = { ...waarden };

    // Eerst vastleggen op dit apparaat, dan pas versturen.
    const metWachtrij = [...leesWachtrij(), inv];
    schrijfWachtrij(metWachtrij);
    setWachtrij(metWachtrij);

    const res = await verstuur(inv);
    if (res?.ok) {
      const over = leesWachtrij().filter((r) => r.id !== inv.id);
      schrijfWachtrij(over);
      setWachtrij(over);
      setMelding({
        soort: "ok",
        tekst: res.dubbel
          ? t("{naam} stond er al — niets dubbel opgeslagen, geen tweede mail.", { naam: res.naam })
          : res.mail === "verstuurd"
            ? t("{naam} opgeslagen — bevestigingsmail verstuurd.", { naam: res.naam }) +
              (res.account === "aannemer" || res.account === "particulier"
                ? ` ${t("Website-account klaargezet.")}`
                : "")
            : t("{naam} opgeslagen. Let op: de bevestigingsmail is niet verstuurd.", { naam: res.naam }),
      });
      setWaarden(leeg());
      naamRef.current?.focus();
    } else if (res && !res.ok) {
      // Inhoudelijke fout: uit de wachtrij halen, de velden blijven staan.
      const over = leesWachtrij().filter((r) => r.id !== inv.id);
      schrijfWachtrij(over);
      setWachtrij(over);
      // De server geeft Nederlandse meldingen terug; vertalen gebeurt hier.
      setMelding({ soort: "fout", tekst: res.fout.split(" · ").map((f) => t(f)).join(" · ") });
    } else {
      setMelding({
        soort: "wacht",
        tekst: t("Geen verbinding — de invoer staat veilig op deze iPad en gaat automatisch weg zodra er weer wifi is."),
      });
      setWaarden(leeg());
      naamRef.current?.focus();
    }
    bezigRef.current = false;
    setBezig(false);
  }

  const zet = (veld: keyof Invoer) => (e: { target: { value: string } }) =>
    setWaarden((w) => ({ ...w, [veld]: e.target.value }));

  return (
    <form onSubmit={opsturen} className="space-y-4">
      {melding && (
        <p
          className={`rounded-lg px-4 py-3 text-base ${
            melding.soort === "ok"
              ? "bg-success/10 text-success"
              : melding.soort === "wacht"
                ? "bg-warning/10 text-warning"
                : "bg-danger/10 text-danger"
          }`}
        >
          {melding.tekst}
        </p>
      )}

      {wachtrij.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          <span>
            {wachtrij.length === 1
              ? t("1 invoer wacht op verbinding")
              : t("{n} invoeren wachten op verbinding", { n: wachtrij.length })}{" "}
            — {wachtrij.map((r) => r.naam).join(", ")}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void leegWachtrij()}>
            {t("Nu opnieuw proberen")}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Naam")}>
          <Input
            ref={naamRef}
            value={waarden.naam}
            onChange={zet("naam")}
            required
            autoFocus
            autoComplete="off"
            className="h-12 text-base"
            placeholder={t("Voor- en achternaam")}
          />
        </Field>
        <Field label={t("E-mail")}>
          <Input
            type="email"
            inputMode="email"
            value={waarden.email}
            onChange={zet("email")}
            required
            autoComplete="off"
            autoCapitalize="none"
            className="h-12 text-base"
            placeholder={uiT("naam@bedrijf.com")}
          />
        </Field>
        <Field label={t("Telefoon")}>
          <Input
            type="tel"
            inputMode="tel"
            value={waarden.telefoon}
            onChange={zet("telefoon")}
            autoComplete="off"
            className="h-12 text-base"
            placeholder="+34 …"
          />
        </Field>
        <Field label={t("Bedrijf")}>
          <Input
            value={waarden.bedrijf}
            onChange={zet("bedrijf")}
            autoComplete="off"
            className="h-12 text-base"
            placeholder={t("Bureau of winkel")}
          />
        </Field>
        <Field label={t("Stad")} hint={t("Zo zie je na de beurs op de kaart waar iedereen zit.")}>
          <Input
            value={waarden.plaats}
            onChange={zet("plaats")}
            autoComplete="off"
            className="h-12 text-base"
            placeholder={t("bijv. Valencia")}
          />
        </Field>
        <Field label={t("Land")}>
          <Select value={waarden.land} onChange={zet("land")} className="h-12 text-base">
            <option value="">{t("Niet gevraagd")}</option>
            {landen.map((l) => (
              <option key={l.code} value={l.code}>
                {l.naam}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Wat voor klant")}>
          <Select value={waarden.rol} onChange={zet("rol")} className="h-12 text-base">
            {ROLLEN.map((r) => (
              <option key={r.key} value={r.key}>
                {r[taal]}
              </option>
            ))}
          </Select>
        </Field>
        {waarden.rol === "anders" && (
          <Field label={t("Wat dan wel?")} hint={t("Zonder deze toelichting zegt “anders” bij het opvolgen niets.")}>
            <Input
              value={waarden.rolAnders}
              onChange={zet("rolAnders")}
              autoComplete="off"
              className="h-12 text-base"
              placeholder={t("bijv. fotograaf, projectontwikkelaar, pers")}
            />
          </Field>
        )}
        <Field label={t("Taal van de bevestigingsmail")}>
          <Select value={waarden.taal} onChange={zet("taal")} className="h-12 text-base">
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="nl">Nederlands</option>
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{t("Waar vraagt hij om?")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTERESSES.map((i) => (
            <label
              key={i.key}
              className="flex items-center gap-3 rounded-lg border px-4 py-3 text-base has-[:checked]:border-accent has-[:checked]:bg-accent/5"
            >
              <input
                type="checkbox"
                className="size-5"
                checked={waarden.interesses.includes(i.key)}
                onChange={(e) =>
                  setWaarden((w) => ({
                    ...w,
                    interesses: e.target.checked
                      ? [...w.interesses, i.key]
                      : w.interesses.filter((k) => k !== i.key),
                  }))
                }
              />
              {i[taal]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={t("Waar gaat het over")} hint={t("Wat wil deze bezoeker? Dit staat straks bij de opvolging.")}>
        <Textarea
          value={waarden.wens}
          onChange={zet("wens")}
          rows={3}
          className="text-base"
          placeholder={t("bijv. zoekt SPC-vloeren voor een villa in Moraira, wil prijzen en stalen")}
        />
      </Field>

      <Button type="submit" variant="primary" className="h-14 w-full text-base" disabled={bezig}>
        {bezig ? t("Bezig met opslaan…") : t("Opslaan en bevestigingsmail sturen")}
      </Button>
    </form>
  );
}
