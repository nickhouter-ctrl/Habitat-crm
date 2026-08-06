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
    "Voorbehouden en uitgangspunten — LET OP: bij een verbouwing kunnen zich altijd onvoorziene kosten en meerwerk voordoen (verborgen gebreken, hardere ondergrond, gewijzigde keuzes). Meerwerk wordt uitsluitend uitgevoerd na schriftelijk akkoord van de opdrachtgever en wordt apart verrekend.",
    "Stelposten: waar een stelpost is opgenomen, is materiaal van gemiddelde kwaliteit inbegrepen (het genoemde bedrag of de genoemde klasse). Kiest de opdrachtgever een duurder materiaal of merk — tegels, sanitair, deuren, keuken, verlichting, airco, warmtepomp of enig ander onderdeel — dan wordt het verschil als meerprijs verrekend. Kiest de opdrachtgever juist een voordeliger materiaal, dan wordt het verschil als minderprijs in mindering gebracht — verrekening werkt dus twee kanten op.",
    "Verborgen gebreken: gebreken die pas tijdens de uitvoering zichtbaar worden — zoals verouderde of ondeugdelijke elektrische bekabeling, leidingwerk, riolering of een defecte septictank — vallen buiten deze offerte en worden na overleg op regiebasis verrekend.",
    "Grondwerk: bij graafwerk (kelder, zwembad, fundering) is uitgegaan van normale grondslag. Blijkt de ondergrond rotsachtig of harder dan verwacht, dan geldt voor het extra werk een meerprijs op regiebasis.",
    "Asbest en vocht: het verwijderen van asbesthoudende materialen en het verhelpen van verborgen vochtproblemen zijn niet inbegrepen.",
    "Meerwerk wordt uitsluitend uitgevoerd na schriftelijk akkoord van de opdrachtgever en wordt verrekend op de eindafrekening.",
    "Betaling: in termijnen volgens overeen te komen schema; leveringen en werkzaamheden volgen na ontvangst van het bijbehorende voorschot.",
    "Onvoorzien: het opgenomen percentage dekt kleine onvoorziene werkzaamheden; het wordt uitsluitend verrekend voor zover daadwerkelijk gebruikt.",
    "Deze offerte is 30 dagen geldig. Prijzen zijn exclusief btw, onder voorbehoud van beschikbaarheid van materialen en prijswijzigingen van leveranciers.",
  ],
  en: [
    "Reservations and assumptions — PLEASE NOTE: renovations can always give rise to unforeseen costs and additional work (hidden defects, harder ground, changed choices). Additional work is only carried out after the client's written approval and is charged separately.",
    "Provisional sums: where a provisional sum is included, mid-range materials are covered (the stated amount or class). Should the client choose more expensive materials or brands — tiles, sanitary ware, doors, kitchen, lighting, air conditioning, heat pump or any other item — the difference will be charged as an extra. Should the client choose a less expensive material, the difference will be deducted — the adjustment works both ways.",
    "Hidden defects: defects that only become visible during the works — such as outdated or faulty electrical wiring, plumbing, drainage or a defective septic tank — fall outside this quotation and will be charged on a time-and-materials basis after consultation.",
    "Groundwork: excavation (basement, pool, foundations) assumes normal ground conditions. If the ground proves rocky or harder than expected, the additional work will be charged on a time-and-materials basis.",
    "Asbestos and damp: removal of asbestos-containing materials and remedying hidden damp problems are not included.",
    "Additional work is carried out only after the client's written approval and is settled on the final invoice.",
    "Payment: in instalments as per the agreed schedule; deliveries and works follow receipt of the corresponding advance payment.",
    "Contingency: the stated percentage covers minor unforeseen works and is only charged to the extent actually used.",
    "This quotation is valid for 30 days. Prices exclude VAT and are subject to material availability and supplier price changes.",
  ],
  es: [
    "Reservas y condiciones — ATENCIÓN: en una reforma siempre pueden surgir costes imprevistos y trabajos adicionales (vicios ocultos, terreno más duro, cambios de elección). Los trabajos adicionales solo se ejecutan previa conformidad por escrito del cliente y se facturan por separado.",
    "Partidas alzadas: donde se incluye una partida alzada, se contempla material de calidad media (el importe o la clase indicados). Si el cliente elige materiales o marcas de mayor precio — azulejos, sanitarios, puertas, cocina, iluminación, aire acondicionado, bomba de calor o cualquier otro elemento — la diferencia se facturará como incremento. Si el cliente elige un material más económico, la diferencia se descontará — el ajuste funciona en ambos sentidos.",
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
/** Standaard 7 termijnen (keuze Nick 06-08-2026): klein slot bij oplevering
 * zoals gebruikelijk in de bouw, en vooraan genoeg om steeds vóór de kosten
 * uit te lopen — na de installatiefase is cumulatief 50% binnen, na levering
 * van kozijnen en producten 95%, terwijl de kosten daar dan nog onder liggen. */
export const SCHEMA_FASEN = [
  {
    standaard: 20,
    nl: "bij opdracht, vóór aanvang van het sloopwerk",
    en: "on commissioning, before demolition starts",
    es: "a la firma del encargo, antes del inicio de la demolición",
  },
  {
    standaard: 15,
    nl: "bij start van het ruwbouwwerk",
    en: "on start of the structural work",
    es: "al inicio de la obra gruesa",
  },
  {
    standaard: 15,
    nl: "bij start van de installaties (leidingwerk, elektra, airco)",
    en: "on start of the installations (plumbing, electrics, air conditioning)",
    es: "al inicio de las instalaciones (fontanería, electricidad, climatización)",
  },
  {
    standaard: 15,
    nl: "bij start van het stuc- en tegelwerk",
    en: "on start of plastering and tiling",
    es: "al inicio del enlucido y alicatado",
  },
  {
    standaard: 15,
    nl: "bij levering van kozijnen en buitendeuren",
    en: "on delivery of window frames and exterior doors",
    es: "a la entrega de carpinterías y puertas exteriores",
  },
  {
    standaard: 15,
    nl: "bij levering van sanitair, keuken en producten",
    en: "on delivery of sanitary ware, kitchen and products",
    es: "a la entrega de sanitarios, cocina y productos",
  },
  { standaard: 5, nl: "bij oplevering", en: "on completion", es: "a la entrega final" },
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

/* ─────────────────── fase-termijnen uit de offerte zelf ───────────────────
 * Elke bouwsteen wordt een eigen termijn zodra er werk in zit — een grote
 * klus krijgt zo vanzelf meer termijnen, en elke termijn past bij de
 * werkelijke waarde van die fase. Opdracht (15%) en oplevering (5%) vast. */

const TERMIJN_BOUWSTENEN: { hoofdstukken: string[]; nl: string; en: string; es: string }[] = [
  { hoofdstukken: ["Ruwbouw & wanden", "Aanbouw & kelder"], nl: "bij start van het ruwbouwwerk", en: "on start of the structural work", es: "al inicio de la obra gruesa" },
  { hoofdstukken: ["Dakwerk"], nl: "bij start van het dakwerk", en: "on start of the roofing works", es: "al inicio de la cubierta" },
  { hoofdstukken: ["Loodgieterwerk", "Elektra"], nl: "bij start van de installaties (leidingwerk, elektra)", en: "on start of the installations (plumbing, electrics)", es: "al inicio de las instalaciones (fontanería, electricidad)" },
  { hoofdstukken: ["Airco & klimaat"], nl: "bij start van de klimaatinstallatie (airco, warmtepomp, vloerverwarming)", en: "on start of the climate installation (air conditioning, heat pump, underfloor heating)", es: "al inicio de la climatización (aire acondicionado, bomba de calor, suelo radiante)" },
  { hoofdstukken: ["Stucwerk", "Schilderwerk"], nl: "bij start van het stuc- en schilderwerk", en: "on start of plastering and painting", es: "al inicio del enlucido y pintura" },
  { hoofdstukken: ["Tegelwerk", "Vloeren & plafonds"], nl: "bij start van het tegel- en vloerwerk", en: "on start of tiling and flooring", es: "al inicio del alicatado y los suelos" },
  { hoofdstukken: ["Kozijnen", "Binnendeuren"], nl: "bij levering van kozijnen en deuren", en: "on delivery of window frames and doors", es: "a la entrega de carpinterías y puertas" },
  { hoofdstukken: ["Badkamers & sanitair", "Keuken", "Eigen producten"], nl: "bij levering van sanitair, keuken en producten", en: "on delivery of sanitary ware, kitchen and products", es: "a la entrega de sanitarios, cocina y productos" },
  { hoofdstukken: ["Zwembad", "Buitenruimte", "Hekwerk & poort"], nl: "bij start van het buitenwerk (zwembad, terras, tuin)", en: "on start of the outdoor works (pool, terrace, garden)", es: "al inicio de los trabajos exteriores (piscina, terraza, jardín)" },
];

const TERMIJN_VAST: Record<QuoteLang, { opdracht: string; oplevering: string }> = {
  nl: { opdracht: "bij opdracht, vóór aanvang van het sloopwerk", oplevering: "bij oplevering" },
  en: { opdracht: "on commissioning, before demolition starts", oplevering: "on completion" },
  es: { opdracht: "a la firma del encargo, antes del inicio de la demolición", oplevering: "a la entrega final" },
};

/** Termijnen die de fase-waarden van de offerte zelf volgen: elke termijn is
 *  (op het 5%-opleveringsslot na) precies wat die fase waard is. De opdracht-
 *  termijn dekt het sloopwerk; fases zonder werk vallen weg. */
export function autoTermijnen(lang: QuoteLang, verkoopPerHoofdstuk: Record<string, number>): SchemaTermijn[] {
  const vast = TERMIJN_VAST[lang];
  const sloop = verkoopPerHoofdstuk["Sloopwerk"] ?? 0;
  const fasen = TERMIJN_BOUWSTENEN.map((b) => ({
    label: b[lang],
    waarde: b.hoofdstukken.reduce((s, h) => s + (verkoopPerHoofdstuk[h] ?? 0), 0),
  })).filter((b) => b.waarde > 0);
  const totaal = sloop + fasen.reduce((s, b) => s + b.waarde, 0);
  if (totaal <= 0) return [];

  // 95% naar rato van de fase-waarde; 5% blijft als opleveringsslot.
  const rijen = [
    ...(sloop > 0 ? [{ label: vast.opdracht, waarde: sloop }] : []),
    ...fasen,
  ].map((r) => ({ label: r.label, waarde: r.waarde, pct: Math.round((95 * r.waarde) / totaal) }));
  const zichtbaar = rijen.filter((r) => r.pct >= 1);
  const som = zichtbaar.reduce((s, r) => s + r.pct, 0);
  if (som !== 95 && zichtbaar.length > 0) {
    const grootste = zichtbaar.reduce((a, b) => (b.waarde > a.waarde ? b : a));
    grootste.pct += 95 - som;
  }
  return [...zichtbaar.map(({ label, pct }) => ({ label, pct })), { label: vast.oplevering, pct: 5 }];
}
