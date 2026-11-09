import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import type { WeekLang } from "@/lib/worker-week";
import { weekT } from "@/lib/worker-week-i18n";

// Handleiding voor de bouwers: één A4, in de taal van het portaal. De knopnamen
// komen uit dezelfde vertalingen als het portaal, zodat ze altijd kloppen.
Font.registerHyphenationCallback((word) => [word]);
const accent = "#1f3864", muted = "#5f6b7a", band = "#f2f5f9";
const s = StyleSheet.create({
  page: { padding: 44, fontFamily: "Helvetica", fontSize: 10.5, color: "#1b2333", lineHeight: 1.45 },
  brand: { fontSize: 8, letterSpacing: 2, color: muted },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", color: accent, marginTop: 6, marginBottom: 4, lineHeight: 1.15 },
  lead: { color: muted, marginBottom: 14 },
  step: { flexDirection: "row", marginBottom: 10 },
  num: { width: 22, height: 22, borderRadius: 11, backgroundColor: accent, color: "#fff", textAlign: "center", fontFamily: "Helvetica-Bold", paddingTop: 4, fontSize: 10, marginRight: 10 },
  body: { flex: 1 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginBottom: 2 },
  tip: { backgroundColor: band, borderLeftWidth: 3, borderLeftColor: accent, padding: 10, marginTop: 6 },
  foot: { position: "absolute", bottom: 26, left: 44, right: 44, fontSize: 8, color: muted, textAlign: "center" },
});
type Copy = { title: string; lead: string; steps: [string, string][]; tipTitle: string; tips: string[]; foot: string };

function copy(lang: WeekLang): Copy {
  const b = (key: Parameters<typeof weekT>[1]) => weekT(lang, key);
  const q = lang === "en" ? (x: string) => `“${x}”` : lang === "es" ? (x: string) => `«${x}»` : (x: string) => `‘${x}’`;
  if (lang === "es") return {
    title: "Tu portal de horas y facturas",
    lead: "Con tu enlace personal registras las horas de la obra y envías tu factura. Sin papeles ni WhatsApp.",
    steps: [
      ["Abre tu enlace", "Pulsa el enlace que te enviamos. Se abre directamente el día de hoy. Guárdalo en la pantalla de inicio del móvil para tenerlo siempre a mano."],
      ["Tu equipo", `En ${q(b("team"))} añades una sola vez los nombres de tu equipo. La próxima semana ya aparecen.`],
      ["Rellena las horas", `Abre el día y pon las horas de cada persona y qué habéis hecho (mín. 10 letras, p. ej. «baño planta alta: 8 m² alicatados»). ¿Un día sin trabajo? Pulsa ${q(b("off"))}. Puedes hacerlo cada día o todo al final de la semana.`],
      ["Guarda", `Pulsa ${q(b("save"))}. Puedes cerrar y seguir otro día; nada se pierde.`],
      ["Envía las horas con tu factura", `Al final de la semana pulsa ${q(b("submit"))}. Si facturas tú mismo, la factura aparece debajo: tus datos, IVA, IRPF y el número siguiente ya están rellenados. Revisa, marca las casillas y envía. Los días vacíos cuentan como no trabajados.`],
      ["Materiales comprados", `¿Has comprado material? En la factura pulsa ${q(b("extraAdd"))}, escribe qué es, el importe sin IVA y el IVA de esa línea (normalmente 21 %).`],
      ["Factura sin horas", `Para un trabajo a precio cerrado usa ${q(b("lumpOpen"))}: describe el trabajo y pon el importe sin IVA.`],
      ["Revisión por la oficina", "La oficina revisa horas y factura juntas. Aprobado: listo, no tienes que volver. Devuelto: verás el motivo, corriges y vuelves a enviar."],
    ],
    tipTitle: "Bueno saber",
    tips: ["Tus datos de facturación se guardan; no los tienes que volver a escribir.", "En «Facturas» puedes descargar siempre tus facturas en PDF.", "¿Dudas o el enlace no funciona? Llama o escribe a la oficina."],
    foot: "Habitat One · portal de horas",
  };
  if (lang === "nl") return {
    title: "Jouw uren- en factuurportaal",
    lead: "Met je persoonlijke link vul je de uren op de klus in en stuur je je factuur. Geen papier, geen WhatsApp.",
    steps: [
      ["Open je link", "Tik op de link die we je stuurden. Hij opent meteen op vandaag. Zet hem op het beginscherm van je telefoon, dan heb je hem altijd bij de hand."],
      ["Je ploeg", `Bij ${q(b("team"))} zet je één keer de namen van je ploeg. Volgende week staan ze er al.`],
      ["Uren invullen", `Open de dag en vul per persoon de uren in en wat jullie gedaan hebben (minimaal 10 letters, bijv. ‘badkamer boven: 8 m² betegeld’). Niet gewerkt? Tik op ${q(b("off"))}. Elke dag of alles aan het eind van de week, allebei goed.`],
      ["Opslaan", `Tik op ${q(b("save"))}. Je kunt stoppen en een andere dag verder; er gaat niets verloren.`],
      ["Uren met je factuur versturen", `Aan het eind van de week tik je op ${q(b("submit"))}. Factureer je zelf, dan staat je factuur eronder: je gegevens, btw, IRPF en het volgende nummer zijn al ingevuld. Controleer, vink aan en verstuur. Lege dagen tellen als niet gewerkt.`],
      ["Gekochte materialen", `Materiaal gekocht? Tik op de factuur op ${q(b("extraAdd"))}, vul in wat het is, het bedrag zonder btw en de btw van die regel (meestal 21%).`],
      ["Factuur zonder uren", `Voor werk tegen een vaste prijs gebruik je ${q(b("lumpOpen"))}: beschrijf het werk en vul het bedrag zonder btw in.`],
      ["Controle door kantoor", "Kantoor controleert uren en factuur samen. Goedgekeurd: klaar, je hoeft niet terug te komen. Teruggestuurd: je ziet de reden, past aan en verstuurt opnieuw."],
    ],
    tipTitle: "Goed om te weten",
    tips: ["Je factuurgegevens worden bewaard; je hoeft ze niet opnieuw te typen.", "Bij ‘Facturen’ download je je facturen altijd opnieuw als PDF.", "Vragen, of werkt de link niet? Bel of app kantoor."],
    foot: "Habitat One · urenportaal",
  };
  return {
    title: "Your hours & invoice portal",
    lead: "With your personal link you record your hours on site and send your invoice. No paper, no WhatsApp.",
    steps: [
      ["Open your link", "Tap the link we sent you. It opens straight on today. Add it to your phone's home screen so it is always at hand."],
      ["Your team", `Under ${q(b("team"))} add your team's names once. Next week they are already there.`],
      ["Fill in the hours", `Open the day and enter the hours per person and what you did (at least 10 letters, e.g. “upstairs bathroom: 8 m² tiled”). No work that day? Tap ${q(b("off"))}. Do it every day or all at the end of the week.`],
      ["Save", `Tap ${q(b("save"))}. You can close and continue another day; nothing gets lost.`],
      ["Send your hours with your invoice", `At the end of the week tap ${q(b("submit"))}. If you invoice yourself, the invoice appears below: your details, VAT, IRPF and the next number are already filled in. Check, tick the boxes and send. Empty days count as no work.`],
      ["Purchased materials", `Bought materials? On the invoice tap ${q(b("extraAdd"))}, enter what it is, the amount excluding VAT and the VAT for that line (usually 21%).`],
      ["Invoice without hours", `For fixed-price work use ${q(b("lumpOpen"))}: describe the work and enter the amount excluding VAT.`],
      ["Office review", "The office reviews hours and invoice together. Approved: done, no need to come back. Returned: you see the reason, correct it and send again."],
    ],
    tipTitle: "Good to know",
    tips: ["Your invoice details are saved; you don't have to type them again.", "Under “Invoices” you can always download your invoices as PDF.", "Questions, or the link doesn't work? Call or message the office."],
    foot: "Habitat One · hours portal",
  };
}

export async function renderWorkerGuide(lang: WeekLang) {
  const c = copy(lang);
  return renderToBuffer(<Document title={c.title} author="Habitat One" language={lang}><Page size="A4" style={s.page}>
    <Text style={s.brand}>HABITAT ONE</Text><Text style={s.h1}>{c.title}</Text><Text style={s.lead}>{c.lead}</Text>
    {c.steps.map(([t, body], n) => <View key={n} style={s.step} wrap={false}><Text style={s.num}>{n + 1}</Text><View style={s.body}><Text style={s.title}>{t}</Text><Text>{body}</Text></View></View>)}
    <View style={s.tip} wrap={false}><Text style={s.title}>{c.tipTitle}</Text>{c.tips.map((t, n) => <Text key={n}>• {t}</Text>)}</View>
    <Text style={s.foot} fixed>{c.foot}</Text>
  </Page></Document>);
}
