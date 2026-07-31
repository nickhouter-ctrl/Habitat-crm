/**
 * Voorschotverzoek aan de klant — de brief die de boekhouder voorschrijft.
 *
 * Dit is het VERZOEK om over te maken, niet het formele stuk. De volgorde is:
 * brief versturen → geld binnen → ontvangst boeken → provisión de fondos of een
 * voorschotfactuur met btw verlegd, afhankelijk van het soort klant.
 *
 * Nederlands en Spaans in één bericht, want de klant kan beide partijen zijn en
 * de boekhouder wil de Spaanse tekst er altijd bij.
 */
import { COMPANY } from "@/lib/company";
import { brandedEmail, escapeHtml } from "@/lib/email";

export type AdvanceRequestInput = {
  /** Werf zoals de klant hem kent, bv. "Villa George Gershwin 39C/Palijsje". */
  projectLabel: string;
  /** Aanduiding van de termijn(en), bv. "1e & 2e termijn". */
  termLabel: string;
  /** Bedrag in euro's. */
  amountEur: number;
  /** Datum van de aannemingsovereenkomst (YYYY-MM-DD), voor "conform overeenkomst …". */
  agreementDate: string | null;
  /** Aanhef, bv. "Elsey" of "FRONTERA PROPERTIES SL". */
  clientName: string | null;
  /** Ondertekening: naam en telefoonnummer van wie het verstuurt. */
  senderName: string | null;
  senderPhone: string | null;
  /** Plaats + datum bovenaan; standaard onze vestigingsplaats en vandaag. */
  place?: string;
  dateLabel: string;
};

const euro = (n: number) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** 2026-07-12 → 12-07-2026 (zoals in de brief van de boekhouder). */
function dmy(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** De referentie die bij de overboeking vermeld moet worden. */
export function advanceReference(i: Pick<AdvanceRequestInput, "projectLabel" | "termLabel">): string {
  return `${i.projectLabel} ${i.termLabel}`.replace(/\s+/g, " ").trim();
}

function onderwerp(i: AdvanceRequestInput): string {
  const datum = dmy(i.agreementDate);
  return `Voorschot: ${i.projectLabel}${datum ? ` conform overeenkomst ${datum}` : ""} ${i.termLabel}`
    .replace(/\s+/g, " ")
    .trim();
}

/** Bouwt het voorschotverzoek. Pure functie, zodat het scherm live meeloopt. */
export function buildAdvanceRequestEmail(i: AdvanceRequestInput): {
  subject: string;
  html: string;
  text: string;
  reference: string;
} {
  const bedrag = euro(i.amountEur);
  const datum = dmy(i.agreementDate);
  const referentie = advanceReference(i);
  // Vestigingsplaats staat niet los in COMPANY; de brief noemt altijd Jávea.
  const plaats = i.place ?? "Jávea";
  const ondertekening = [
    COMPANY.legalName,
    COMPANY.vatNumber.replace(/^ES/, ""),
    i.senderName ?? "",
    i.senderPhone ?? COMPANY.phone,
  ].filter(Boolean);

  const bank: [string, string][] = [
    ["Rekeninghouder", COMPANY.legalName],
    ["IBAN", COMPANY.iban],
    ["BIC", COMPANY.bic],
  ];

  const nl = [
    `${plaats}, ${i.dateLabel}`,
    "",
    `Beste ${i.clientName ?? "relatie"},`,
    "",
    `In het kader van ons bouwproject in ${i.projectLabel} willen wij u informeren over de volgende betalingsfase:`,
    "",
    `Conform onze afspraken verzoeken wij u vriendelijk om een voorschot te voldoen ter hoogte van € ${bedrag}.`,
    "Dit voorschot heeft betrekking op de voortgang van de werkzaamheden zoals gepland.",
    "",
    "Wij verzoeken u het bedrag over te maken op onderstaande gegevens:",
    ...bank.map(([k, v]) => `${k}: ${v}`),
    `Onder vermelding van: ${referentie}`,
    "",
    "Na ontvangst van het voorschot zullen wij de werkzaamheden volgens planning voortzetten. Bij de uiteindelijke afrekening wordt dit voorschot uiteraard verrekend in de definitieve factuur.",
    "",
    "Mocht u vragen hebben, dan horen wij dat graag.",
    "",
    "Met vriendelijke groet,",
    ...ondertekening,
  ].join("\n");

  const es = [
    `${plaats}, ${i.dateLabel}`,
    "",
    `Estimada/o ${i.clientName ?? "cliente"},`,
    "",
    `En el marco de nuestro proyecto de construcción en ${i.projectLabel}, queremos informarle sobre la siguiente fase de pago:`,
    "",
    `Conforme a lo acordado, le solicitamos amablemente que abone un anticipo por importe de ${bedrag} €.`,
    "Este anticipo corresponde al avance de los trabajos según lo previsto.",
    "",
    "Le rogamos que transfiera el importe a los siguientes datos:",
    `Titular de la cuenta: ${COMPANY.legalName}`,
    `IBAN: ${COMPANY.iban}`,
    `BIC: ${COMPANY.bic}`,
    `Concepto: ${referentie}`,
    "",
    "Una vez recibido el anticipo, continuaremos los trabajos según lo planificado. En la liquidación final, este anticipo se descontará, por supuesto, de la factura definitiva.",
    "",
    "Si tiene alguna pregunta, quedamos a su disposición.",
    "",
    "Un cordial saludo,",
    ...ondertekening,
  ].join("\n");

  const kop = onderwerp(i);
  const kopEs = `Anticipo: ${i.projectLabel}${datum ? ` según acuerdo del ${datum}` : ""} ${i.termLabel}`
    .replace(/\s+/g, " ")
    .trim();

  const bankHtml = (labels: [string, string][]) =>
    `<table style="font-size:14px;margin:8px 0">${labels
      .map(([k, v]) => `<tr><td style="padding:1px 8px 1px 0"><strong>${escapeHtml(k)}:</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`;

  const alinea = (t: string) => `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;

  const html = brandedEmail(`
    <p style="margin:0 0 4px"><strong>${escapeHtml(kop)}</strong></p>
    <p style="margin:0 0 18px;color:#7a6f63;font-size:13px">${escapeHtml(plaats)}, ${escapeHtml(i.dateLabel)}</p>
    ${alinea(`Beste ${i.clientName ?? "relatie"},`)}
    ${alinea(`In het kader van ons bouwproject in ${i.projectLabel} willen wij u informeren over de volgende betalingsfase:`)}
    ${alinea(`Conform onze afspraken verzoeken wij u vriendelijk om een voorschot te voldoen ter hoogte van € ${bedrag}. Dit voorschot heeft betrekking op de voortgang van de werkzaamheden zoals gepland.`)}
    ${alinea("Wij verzoeken u het bedrag over te maken op onderstaande gegevens:")}
    ${bankHtml([...bank, ["Onder vermelding van", referentie]])}
    ${alinea("Na ontvangst van het voorschot zullen wij de werkzaamheden volgens planning voortzetten. Bij de uiteindelijke afrekening wordt dit voorschot uiteraard verrekend in de definitieve factuur.")}
    ${alinea("Mocht u vragen hebben, dan horen wij dat graag.")}
    ${alinea("Met vriendelijke groet,")}
    <p style="margin:0 0 24px;font-size:14px">${ondertekening.map(escapeHtml).join("<br>")}</p>

    <hr style="border:none;border-top:1px solid #e8dfd0;margin:24px 0">

    <p style="margin:0 0 4px"><strong>${escapeHtml(kopEs)}</strong></p>
    <p style="margin:0 0 18px;color:#7a6f63;font-size:13px">${escapeHtml(plaats)}, ${escapeHtml(i.dateLabel)}</p>
    ${alinea(`Estimada/o ${i.clientName ?? "cliente"},`)}
    ${alinea(`En el marco de nuestro proyecto de construcción en ${i.projectLabel}, queremos informarle sobre la siguiente fase de pago:`)}
    ${alinea(`Conforme a lo acordado, le solicitamos amablemente que abone un anticipo por importe de ${bedrag} €. Este anticipo corresponde al avance de los trabajos según lo previsto.`)}
    ${alinea("Le rogamos que transfiera el importe a los siguientes datos:")}
    ${bankHtml([["Titular de la cuenta", COMPANY.legalName], ["IBAN", COMPANY.iban], ["BIC", COMPANY.bic], ["Concepto", referentie]])}
    ${alinea("Una vez recibido el anticipo, continuaremos los trabajos según lo planificado. En la liquidación final, este anticipo se descontará, por supuesto, de la factura definitiva.")}
    ${alinea("Si tiene alguna pregunta, quedamos a su disposición.")}
    ${alinea("Un cordial saludo,")}
    <p style="margin:0;font-size:14px">${ondertekening.map(escapeHtml).join("<br>")}</p>
  `);

  return {
    subject: kop,
    html,
    text: `${nl}\n\n${"—".repeat(40)}\n\n${kopEs}\n\n${es}`,
    reference: referentie,
  };
}

/**
 * BEVESTIGING na een deelbetaling: melden wat er binnen is, en wat er van het
 * afgesproken voorschot nog openstaat.
 *
 * Bewust géén verzoek om het restant over te maken en geen bankgegevens — dat
 * leest als een aanmaning terwijl de klant net betaald heeft (keuze van Nick,
 * 31-07-2026). Wil je er wél om vragen, dan is dat een aparte stap:
 * {@link buildAdvanceReminderEmail}.
 */
export function buildAdvanceStatusEmail(
  i: AdvanceRequestInput & { receivedEur: number; openEur: number },
): { subject: string; html: string; text: string; reference: string } {
  const gevraagd = euro(i.amountEur);
  const ontvangen = euro(i.receivedEur);
  const open = euro(i.openEur);
  const referentie = advanceReference(i);
  const plaats = i.place ?? "Jávea";
  const ondertekening = [
    COMPANY.legalName,
    COMPANY.vatNumber.replace(/^ES/, ""),
    i.senderName ?? "",
    i.senderPhone ?? COMPANY.phone,
  ].filter(Boolean);

  const kop = `Voorschotstand: ${i.projectLabel} ${i.termLabel}`.replace(/\s+/g, " ").trim();
  const kopEs = `Estado del anticipo: ${i.projectLabel} ${i.termLabel}`.replace(/\s+/g, " ").trim();

  const nl = [
    `${plaats}, ${i.dateLabel}`,
    "",
    `Beste ${i.clientName ?? "relatie"},`,
    "",
    `Hartelijk dank voor uw betaling. Wij hebben € ${ontvangen} in goede orde ontvangen voor ons bouwproject in ${i.projectLabel}.`,
    "",
    `Van het afgesproken voorschot van € ${gevraagd} staat daarmee nog € ${open} open.`,
    "",
    "Bij de uiteindelijke afrekening wordt het volledige voorschot verrekend in de definitieve factuur.",
    "",
    "Mocht u vragen hebben, dan horen wij dat graag.",
    "",
    "Met vriendelijke groet,",
    ...ondertekening,
  ].join("\n");

  const es = [
    `${plaats}, ${i.dateLabel}`,
    "",
    `Estimada/o ${i.clientName ?? "cliente"},`,
    "",
    `Muchas gracias por su pago. Hemos recibido correctamente ${ontvangen} € para nuestro proyecto de construcción en ${i.projectLabel}.`,
    "",
    `Del anticipo acordado de ${gevraagd} € queda pendiente ${open} €.`,
    "",
    "En la liquidación final, el anticipo completo se descontará de la factura definitiva.",
    "",
    "Si tiene alguna pregunta, quedamos a su disposición.",
    "",
    "Un cordial saludo,",
    ...ondertekening,
  ].join("\n");

  const alinea = (t: string) => `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;
  const bankHtml = (labels: [string, string][]) =>
    `<table style="font-size:14px;margin:8px 0">${labels
      .map(([k, v]) => `<tr><td style="padding:1px 8px 1px 0"><strong>${escapeHtml(k)}:</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`;
  const standHtml = (labels: [string, string][]) =>
    `<table style="font-size:14px;margin:8px 0;border-collapse:collapse">${labels
      .map(
        ([k, v], n) =>
          `<tr><td style="padding:3px 16px 3px 0;${n === labels.length - 1 ? "font-weight:600;" : ""}">${escapeHtml(k)}</td>` +
          `<td style="padding:3px 0;text-align:right;${n === labels.length - 1 ? "font-weight:600;" : ""}">€ ${escapeHtml(v)}</td></tr>`,
      )
      .join("")}</table>`;

  const html = brandedEmail(`
    <p style="margin:0 0 4px"><strong>${escapeHtml(kop)}</strong></p>
    <p style="margin:0 0 18px;color:#7a6f63;font-size:13px">${escapeHtml(plaats)}, ${escapeHtml(i.dateLabel)}</p>
    ${alinea(`Beste ${i.clientName ?? "relatie"},`)}
    ${alinea(`Hartelijk dank voor uw betaling. Wij hebben € ${ontvangen} in goede orde ontvangen voor ons bouwproject in ${i.projectLabel}.`)}
    ${standHtml([
      ["Afgesproken voorschot", gevraagd],
      ["Ontvangen", ontvangen],
      ["Nog openstaand", open],
    ])}
    ${alinea("Bij de uiteindelijke afrekening wordt het volledige voorschot verrekend in de definitieve factuur.")}
    ${alinea("Mocht u vragen hebben, dan horen wij dat graag.")}
    ${alinea("Met vriendelijke groet,")}
    <p style="margin:0 0 24px;font-size:14px">${ondertekening.map(escapeHtml).join("<br>")}</p>

    <hr style="border:none;border-top:1px solid #e8dfd0;margin:24px 0">

    <p style="margin:0 0 4px"><strong>${escapeHtml(kopEs)}</strong></p>
    <p style="margin:0 0 18px;color:#7a6f63;font-size:13px">${escapeHtml(plaats)}, ${escapeHtml(i.dateLabel)}</p>
    ${alinea(`Estimada/o ${i.clientName ?? "cliente"},`)}
    ${alinea(`Muchas gracias por su pago. Hemos recibido correctamente ${ontvangen} € para nuestro proyecto de construcción en ${i.projectLabel}.`)}
    ${standHtml([
      ["Anticipo acordado", gevraagd],
      ["Recibido", ontvangen],
      ["Pendiente", open],
    ])}
    ${alinea("En la liquidación final, el anticipo completo se descontará de la factura definitiva.")}
    ${alinea("Si tiene alguna pregunta, quedamos a su disposición.")}
    ${alinea("Un cordial saludo,")}
    <p style="margin:0;font-size:14px">${ondertekening.map(escapeHtml).join("<br>")}</p>
  `);

  return {
    subject: kop,
    html,
    text: `${nl}\n\n${"—".repeat(40)}\n\n${kopEs}\n\n${es}`,
    reference: referentie,
  };
}

/**
 * HERINNERING aan het openstaande deel van een voorschot — een aparte stap,
 * bewust los van de bevestiging: die mag niet als aanmaning lezen terwijl de
 * klant net heeft betaald. Deze brief vraagt er wél om, met de bankgegevens en
 * dezelfde referentie erbij zodat er niets opgezocht hoeft te worden.
 */
export function buildAdvanceReminderEmail(
  i: AdvanceRequestInput & { receivedEur: number; openEur: number },
): { subject: string; html: string; text: string; reference: string } {
  const gevraagd = euro(i.amountEur);
  const ontvangen = euro(i.receivedEur);
  const open = euro(i.openEur);
  const referentie = advanceReference(i);
  const plaats = i.place ?? "Jávea";
  const ondertekening = [
    COMPANY.legalName,
    COMPANY.vatNumber.replace(/^ES/, ""),
    i.senderName ?? "",
    i.senderPhone ?? COMPANY.phone,
  ].filter(Boolean);

  const kop = `Voorschot restant: ${i.projectLabel} ${i.termLabel}`.replace(/\s+/g, " ").trim();
  const kopEs = `Anticipo pendiente: ${i.projectLabel} ${i.termLabel}`.replace(/\s+/g, " ").trim();

  const bank: [string, string][] = [
    ["Rekeninghouder", COMPANY.legalName],
    ["IBAN", COMPANY.iban],
    ["BIC", COMPANY.bic],
    ["Onder vermelding van", referentie],
  ];

  const nl = [
    `${plaats}, ${i.dateLabel}`,
    "",
    `Beste ${i.clientName ?? "relatie"},`,
    "",
    `Van het afgesproken voorschot van € ${gevraagd} voor ons bouwproject in ${i.projectLabel} hebben wij € ${ontvangen} ontvangen. Daarmee staat nog € ${open} open.`,
    "",
    "Wij verzoeken u vriendelijk dit resterende bedrag over te maken op:",
    ...bank.map(([k, v]) => `${k}: ${v}`),
    "",
    "Is de betaling inmiddels onderweg, dan kunt u dit bericht als afgehandeld beschouwen. Bij de uiteindelijke afrekening wordt het volledige voorschot verrekend in de definitieve factuur.",
    "",
    "Met vriendelijke groet,",
    ...ondertekening,
  ].join("\n");

  const es = [
    `${plaats}, ${i.dateLabel}`,
    "",
    `Estimada/o ${i.clientName ?? "cliente"},`,
    "",
    `Del anticipo acordado de ${gevraagd} € para nuestro proyecto de construcción en ${i.projectLabel} hemos recibido ${ontvangen} €. Queda pendiente ${open} €.`,
    "",
    "Le rogamos que transfiera el importe restante a:",
    `Titular de la cuenta: ${COMPANY.legalName}`,
    `IBAN: ${COMPANY.iban}`,
    `BIC: ${COMPANY.bic}`,
    `Concepto: ${referentie}`,
    "",
    "Si el pago ya está en camino, puede considerar este mensaje como atendido. En la liquidación final, el anticipo completo se descontará de la factura definitiva.",
    "",
    "Un cordial saludo,",
    ...ondertekening,
  ].join("\n");

  const alinea = (t: string) => `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;
  const bankHtml = (labels: [string, string][]) =>
    `<table style="font-size:14px;margin:8px 0">${labels
      .map(([k, v]) => `<tr><td style="padding:1px 8px 1px 0"><strong>${escapeHtml(k)}:</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`;

  const html = brandedEmail(`
    <p style="margin:0 0 4px"><strong>${escapeHtml(kop)}</strong></p>
    <p style="margin:0 0 18px;color:#7a6f63;font-size:13px">${escapeHtml(plaats)}, ${escapeHtml(i.dateLabel)}</p>
    ${alinea(`Beste ${i.clientName ?? "relatie"},`)}
    ${alinea(`Van het afgesproken voorschot van € ${gevraagd} voor ons bouwproject in ${i.projectLabel} hebben wij € ${ontvangen} ontvangen. Daarmee staat nog € ${open} open.`)}
    ${alinea("Wij verzoeken u vriendelijk dit resterende bedrag over te maken op:")}
    ${bankHtml(bank)}
    ${alinea("Is de betaling inmiddels onderweg, dan kunt u dit bericht als afgehandeld beschouwen. Bij de uiteindelijke afrekening wordt het volledige voorschot verrekend in de definitieve factuur.")}
    ${alinea("Met vriendelijke groet,")}
    <p style="margin:0 0 24px;font-size:14px">${ondertekening.map(escapeHtml).join("<br>")}</p>

    <hr style="border:none;border-top:1px solid #e8dfd0;margin:24px 0">

    <p style="margin:0 0 4px"><strong>${escapeHtml(kopEs)}</strong></p>
    <p style="margin:0 0 18px;color:#7a6f63;font-size:13px">${escapeHtml(plaats)}, ${escapeHtml(i.dateLabel)}</p>
    ${alinea(`Estimada/o ${i.clientName ?? "cliente"},`)}
    ${alinea(`Del anticipo acordado de ${gevraagd} € para nuestro proyecto de construcción en ${i.projectLabel} hemos recibido ${ontvangen} €. Queda pendiente ${open} €.`)}
    ${alinea("Le rogamos que transfiera el importe restante a:")}
    ${bankHtml([["Titular de la cuenta", COMPANY.legalName], ["IBAN", COMPANY.iban], ["BIC", COMPANY.bic], ["Concepto", referentie]])}
    ${alinea("Si el pago ya está en camino, puede considerar este mensaje como atendido. En la liquidación final, el anticipo completo se descontará de la factura definitiva.")}
    ${alinea("Un cordial saludo,")}
    <p style="margin:0;font-size:14px">${ondertekening.map(escapeHtml).join("<br>")}</p>
  `);

  return {
    subject: kop,
    html,
    text: `${nl}\n\n${"—".repeat(40)}\n\n${kopEs}\n\n${es}`,
    reference: referentie,
  };
}
