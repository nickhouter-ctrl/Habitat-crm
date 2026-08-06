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

/**
 * De vaste fase-termijnen van het betalingsschema. Volgorde = bouwvolgorde;
 * de wizard laat per termijn het percentage instellen (0 = vervalt).
 * `key` is de veldnaam in de wizard (f1…f5), `nl` ook het label daar.
 */
export const SCHEMA_FASEN = [
  {
    standaard: 40,
    nl: "bij opdracht, vóór aanvang van het sloop- en ruwbouwwerk",
    en: "on commissioning, before demolition and structural work start",
    es: "a la firma del encargo, antes del inicio de la demolición y obra gruesa",
  },
  {
    standaard: 25,
    nl: "bij start van de afbouw (tegelwerk, stucwerk, installaties)",
    en: "on start of the finishing works (tiling, plastering, installations)",
    es: "al inicio de los acabados (alicatado, enlucido, instalaciones)",
  },
  {
    standaard: 25,
    nl: "bij levering van sanitair, kozijnen en producten",
    en: "on delivery of sanitary ware, window frames and products",
    es: "a la entrega de sanitarios, carpinterías y productos",
  },
  { standaard: 10, nl: "bij oplevering", en: "on completion", es: "a la entrega final" },
] as const;

const SCHEMA_TEKST: Record<QuoteLang, { kop: string; slot: string }> = {
  nl: { kop: "Betalingsschema", slot: "Bedragen excl. btw; elke termijn te voldoen vóór aanvang van de betreffende fase." },
  en: { kop: "Payment schedule", slot: "Amounts exclude VAT; each instalment is due before the corresponding phase starts." },
  es: { kop: "Calendario de pagos", slot: "Importes sin IVA; cada plazo se abona antes de iniciar la fase correspondiente." },
};

export type SchemaTermijn = { label: string; pct: number };

/**
 * Betalingsschema als alinea voor onder de offerte: één regel per termijn met
 * percentage en bedrag over het offertetotaal (ex btw). Termijnen op 0% of
 * zonder omschrijving vervallen. De labels komen uit de wizard (aanpasbaar,
 * aantal vrij); de standaardtermijnen staan in SCHEMA_FASEN.
 */
export function betalingsschemaTekst(lang: QuoteLang, totaalEx: number, termijnen: SchemaTermijn[]): string | null {
  const t = SCHEMA_TEKST[lang];
  const eur = (n: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const regels = termijnen
    .filter((r) => r.pct > 0 && r.label.trim())
    .map((r) => `• ${r.pct}% ${r.label.trim()} — ${eur(Math.round((totaalEx * r.pct) / 100))}`);
  if (regels.length === 0) return null;
  return `${t.kop}\n${regels.join("\n")}\n${t.slot}`;
}
