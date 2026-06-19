"use client";

import { useState } from "react";
import { confirmProposedSlot } from "@/app/book/actions";

type Slot = { date: string; time: string };

const T: Record<string, { title: string; intro: string; confirm: string; confirming: string; doneTitle: string; doneBody: string; alreadyTitle: string; alreadyBody: string; error: string }> = {
  nl: { title: "Kies een moment", intro: "Kies hieronder het moment dat jou het beste uitkomt voor je showroombezoek.", confirm: "Bevestig dit moment", confirming: "Bezig met bevestigen…", doneTitle: "Afspraak bevestigd!", doneBody: "We hebben je een bevestiging gestuurd. Tot snel in onze showroom.", alreadyTitle: "Al bevestigd", alreadyBody: "Deze afspraak is al ingepland. Heb je een vraag? Mail ons gerust.", error: "Er ging iets mis. Probeer het opnieuw of mail ons." },
  en: { title: "Pick a time", intro: "Choose the time below that works best for your showroom visit.", confirm: "Confirm this time", confirming: "Confirming…", doneTitle: "Appointment confirmed!", doneBody: "We've sent you a confirmation. See you soon at our showroom.", alreadyTitle: "Already confirmed", alreadyBody: "This appointment has already been scheduled. Any questions? Just email us.", error: "Something went wrong. Please try again or email us." },
  es: { title: "Elige un momento", intro: "Elige a continuación el momento que mejor te convenga para tu visita al showroom.", confirm: "Confirmar este momento", confirming: "Confirmando…", doneTitle: "¡Cita confirmada!", doneBody: "Te hemos enviado una confirmación. Nos vemos pronto en el showroom.", alreadyTitle: "Ya confirmada", alreadyBody: "Esta cita ya está programada. ¿Alguna pregunta? Escríbenos.", error: "Algo salió mal. Inténtalo de nuevo o escríbenos." },
  de: { title: "Wähle einen Termin", intro: "Wähle unten den Moment, der dir für deinen Showroom-Besuch am besten passt.", confirm: "Diesen Termin bestätigen", confirming: "Wird bestätigt…", doneTitle: "Termin bestätigt!", doneBody: "Wir haben dir eine Bestätigung geschickt. Bis bald in unserem Showroom.", alreadyTitle: "Bereits bestätigt", alreadyBody: "Dieser Termin ist bereits geplant. Fragen? Schreib uns einfach.", error: "Etwas ist schiefgelaufen. Bitte erneut versuchen oder uns schreiben." },
};

export function BookSlotPicker({ token, slots, locale }: { token: string; slots: Slot[]; locale: string }) {
  const t = T[locale] ?? T.nl;
  const lc = locale === "en" ? "en-GB" : locale;
  const [selected, setSelected] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "already" | "error">("idle");
  const [when, setWhen] = useState<string | null>(null);

  function fmt(s: Slot) {
    const d = new Date(`${s.date}T${s.time}`);
    const day = d.toLocaleDateString(lc, { weekday: "long", day: "numeric", month: "long" });
    return { day: day.charAt(0).toUpperCase() + day.slice(1), time: s.time };
  }

  async function submit() {
    if (selected === null) return;
    setState("sending");
    try {
      const res = await confirmProposedSlot(token, selected);
      if (res.ok) {
        setWhen(res.when ?? null);
        setState("done");
      } else if (res.error === "already") {
        setState("already");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
        <h1 className="mt-5 text-2xl font-semibold text-stone-800">{t.doneTitle}</h1>
        {when && <p className="mt-2 text-lg font-medium text-stone-700">{when.charAt(0).toUpperCase() + when.slice(1)}</p>}
        <p className="mt-3 text-stone-500">{t.doneBody}</p>
      </div>
    );
  }
  if (state === "already") {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-stone-800">{t.alreadyTitle}</h1>
        <p className="mt-3 text-stone-500">{t.alreadyBody}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-800">{t.title}</h1>
      <p className="mt-2 text-stone-500">{t.intro}</p>
      <div className="mt-7 space-y-2.5">
        {slots.map((s, i) => {
          const f = fmt(s);
          const active = selected === i;
          return (
            <button
              key={`${s.date}-${s.time}-${i}`}
              type="button"
              onClick={() => setSelected(i)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors ${active ? "border-stone-800 bg-stone-800/[0.04]" : "border-stone-200 hover:border-stone-400"}`}
            >
              <span className="font-medium text-stone-800">{f.day}</span>
              <span className={`text-sm font-semibold ${active ? "text-stone-800" : "text-stone-500"}`}>{f.time}</span>
            </button>
          );
        })}
      </div>
      {state === "error" && <p className="mt-4 text-sm text-red-600">{t.error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={selected === null || state === "sending"}
        className="mt-7 w-full rounded-xl bg-stone-900 px-5 py-3.5 font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {state === "sending" ? t.confirming : t.confirm}
      </button>
    </div>
  );
}
