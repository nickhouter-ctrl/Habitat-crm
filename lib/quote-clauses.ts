/**
 * Voorbehouden onder elke gecalculeerde offerte.
 *
 * Dit is het juridische vangnet dat bij Silvestre ontbrak: verborgen gebreken
 * (elektra, leidingwerk, septictank), hardere grond dan verwacht, en de
 * stelpost-afspraak dat élke duurdere keuze — tegels, sanitair, deuren, airco,
 * warmtepomp, wat dan ook — als meerprijs wordt verrekend. Meerwerk alleen na
 * schriftelijk akkoord (dat sluit aan op de meerwerk-kaart met akkoord-vlag),
 * en betaling in termijnen vóór levering (het voorschotten-model).
 *
 * Eén taal per offerte; de teksten zijn per taal gelijkwaardig, geen vertaling
 * van een "hoofdtekst".
 */

export type QuoteLang = "nl" | "en" | "es";

const CLAUSES: Record<QuoteLang, string[]> = {
  nl: [
    "Voorbehouden en uitgangspunten",
    "Stelposten: waar een stelpost is opgenomen, is materiaal van gemiddelde kwaliteit inbegrepen (het genoemde bedrag of de genoemde klasse). Kiest de opdrachtgever een duurder materiaal of merk — tegels, sanitair, deuren, keuken, verlichting, airco, warmtepomp of enig ander onderdeel — dan wordt het verschil als meerprijs verrekend.",
    "Verborgen gebreken: gebreken die pas tijdens de uitvoering zichtbaar worden — zoals verouderde of ondeugdelijke elektrische bekabeling, leidingwerk, riolering of een defecte septictank — vallen buiten deze offerte en worden na overleg op regiebasis verrekend.",
    "Grondwerk: bij graafwerk (kelder, zwembad, fundering) is uitgegaan van normale grondslag. Blijkt de ondergrond rotsachtig of harder dan verwacht, dan geldt voor het extra werk een meerprijs op regiebasis.",
    "Asbest en vocht: het verwijderen van asbesthoudende materialen en het verhelpen van verborgen vochtproblemen zijn niet inbegrepen.",
    "Meerwerk wordt uitsluitend uitgevoerd na schriftelijk akkoord van de opdrachtgever en wordt verrekend op de eindafrekening.",
    "Betaling: in termijnen volgens overeen te komen schema; leveringen en werkzaamheden volgen na ontvangst van het bijbehorende voorschot.",
    "Onvoorzien: het opgenomen percentage dekt kleine onvoorziene werkzaamheden; het wordt uitsluitend verrekend voor zover daadwerkelijk gebruikt.",
    "Deze offerte is 30 dagen geldig. Prijzen zijn exclusief btw, onder voorbehoud van beschikbaarheid van materialen en prijswijzigingen van leveranciers.",
  ],
  en: [
    "Reservations and assumptions",
    "Provisional sums: where a provisional sum is included, mid-range materials are covered (the stated amount or class). Should the client choose more expensive materials or brands — tiles, sanitary ware, doors, kitchen, lighting, air conditioning, heat pump or any other item — the difference will be charged as an extra.",
    "Hidden defects: defects that only become visible during the works — such as outdated or faulty electrical wiring, plumbing, drainage or a defective septic tank — fall outside this quotation and will be charged on a time-and-materials basis after consultation.",
    "Groundwork: excavation (basement, pool, foundations) assumes normal ground conditions. If the ground proves rocky or harder than expected, the additional work will be charged on a time-and-materials basis.",
    "Asbestos and damp: removal of asbestos-containing materials and remedying hidden damp problems are not included.",
    "Additional work is carried out only after the client's written approval and is settled on the final invoice.",
    "Payment: in instalments as per the agreed schedule; deliveries and works follow receipt of the corresponding advance payment.",
    "Contingency: the stated percentage covers minor unforeseen works and is only charged to the extent actually used.",
    "This quotation is valid for 30 days. Prices exclude VAT and are subject to material availability and supplier price changes.",
  ],
  es: [
    "Reservas y condiciones",
    "Partidas alzadas: donde se incluye una partida alzada, se contempla material de calidad media (el importe o la clase indicados). Si el cliente elige materiales o marcas de mayor precio — azulejos, sanitarios, puertas, cocina, iluminación, aire acondicionado, bomba de calor o cualquier otro elemento — la diferencia se facturará como incremento.",
    "Vicios ocultos: los defectos que solo se hagan visibles durante la ejecución — como instalación eléctrica, fontanería o saneamiento en mal estado, o una fosa séptica defectuosa — quedan fuera de este presupuesto y se facturarán por administración previa consulta.",
    "Movimiento de tierras: en las excavaciones (sótano, piscina, cimentación) se presupone un terreno normal. Si el terreno resulta rocoso o más duro de lo previsto, el trabajo adicional se facturará por administración.",
    "Amianto y humedades: la retirada de materiales con amianto y la reparación de humedades ocultas no están incluidas.",
    "Los trabajos adicionales se ejecutan únicamente previa conformidad por escrito del cliente y se liquidan en la factura final.",
    "Pago: por certificaciones según el calendario acordado; las entregas y los trabajos se realizan tras la recepción del anticipo correspondiente.",
    "Imprevistos: el porcentaje indicado cubre pequeños trabajos imprevistos y solo se factura en la medida en que se utilice.",
    "Este presupuesto tiene una validez de 30 días. Los precios no incluyen IVA y quedan sujetos a la disponibilidad de materiales y a variaciones de precio de los proveedores.",
  ],
};

/** De voorbehouden als één tekst voor `documents.notes` (alinea's met witregel). */
export function quoteClauses(lang: QuoteLang): string {
  return CLAUSES[lang].join("\n\n");
}

const SCHEMA_TEKST: Record<QuoteLang, { kop: string; termijnen: [string, string, string]; slot: string }> = {
  nl: {
    kop: "Betalingsschema",
    termijnen: ["bij opdracht", "halverwege de werkzaamheden", "bij oplevering"],
    slot: "Bedragen excl. btw; elke termijn te voldoen vóór aanvang van de volgende fase.",
  },
  en: {
    kop: "Payment schedule",
    termijnen: ["on commissioning", "halfway through the works", "on completion"],
    slot: "Amounts exclude VAT; each instalment is due before the next phase starts.",
  },
  es: {
    kop: "Calendario de pagos",
    termijnen: ["a la firma del encargo", "a mitad de obra", "a la entrega"],
    slot: "Importes sin IVA; cada plazo se abona antes de iniciar la siguiente fase.",
  },
};

/**
 * Betalingsschema als alinea voor onder de offerte: percentages over het
 * offertetotaal (ex btw), met de bedragen erbij. Termijnen op 0% vervallen.
 */
export function betalingsschemaTekst(lang: QuoteLang, totaalEx: number, pcts: [number, number, number]): string | null {
  const t = SCHEMA_TEKST[lang];
  const eur = (n: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const delen = pcts
    .map((pct, i) => (pct > 0 ? `${pct}% ${t.termijnen[i]} (${eur(Math.round((totaalEx * pct) / 100))})` : null))
    .filter(Boolean);
  if (delen.length === 0) return null;
  return `${t.kop}: ${delen.join(" · ")}. ${t.slot}`;
}
