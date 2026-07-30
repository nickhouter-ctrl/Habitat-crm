/**
 * Controleert de regelset uit `lib/invoice-checks.ts`. Pure functie, dus geen
 * database en geen API-sleutel nodig: `npx tsx scripts/test-invoice-checks.ts`.
 *
 * Draai dit na élke wijziging aan de regels. Een fout hier betekent dat een
 * leverancier een onterecht verwijt krijgt, of dat een incomplete factuur
 * ongemerkt de administratie in glipt.
 */
import { evaluateInvoice, isPlausibleTaxId, isValidIban, type CheckKey } from "../lib/invoice-checks";
import type { AiInvoiceFields, AiInvoiceRead } from "../lib/ai-invoice-extract";

let ok = 0;
let fail = 0;
function assert(naam: string, voorwaarde: boolean, uitleg?: string) {
  if (voorwaarde) {
    ok++;
  } else {
    fail++;
    console.log(`  ✗ ${naam}${uitleg ? ` — ${uitleg}` : ""}`);
  }
}

/** Een complete, correcte Spaanse factuur als vertrekpunt. */
const compleet: AiInvoiceFields = {
  supplier: "Zerghini Abdelmjid",
  supplierLegalName: "Zerghini Abdelmjid",
  supplierTaxId: "Z0413505Q",
  supplierAddress: "La Marina Alta 196, Gata de Gorgos (Alicante)",
  supplierEmail: "abdel@example.es",
  supplierCountry: "ES",
  recipientName: "Habitat One & One SL",
  recipientTaxId: "B24855603",
  total: 7944.86,
  subtotal: 6566,
  currency: "EUR",
  invoiceNumber: "4",
  invoiceDate: "2026-07-24",
  vatRate: 21,
  vatAmount: 1378.86,
  vatExemptionNote: null,
  retentionPct: null,
  retentionAmount: null,
  iban: "ES0900492537602514049801",
  paymentMethod: "transferencia",
  descriptionText: "Mano de obra — Villa Gershwin, ref. 39C — 291 horas x 26,00 €/hora — periodo del 18/07 al 24/07",
  isLabor: true,
  hours: 291,
  hoursPeriodFrom: "2026-07-18",
  hoursPeriodTo: "2026-07-24",
  projectHint: "Villa Gershwin, ref. 39C",
  documentKind: "factura",
  language: "es",
  lines: [],
  legible: true,
  readNotes: null,
};

const lees = (f: AiInvoiceFields): AiInvoiceRead => ({
  ok: true,
  fields: f,
  model: "test",
  promptVersion: 0,
  readAt: "2026-07-30T00:00:00Z",
});
const ctx = { projectMatched: true };
const gefaald = (f: AiInvoiceFields, c = ctx) =>
  evaluateInvoice(lees(f), c).checks.filter((x) => !x.ok && !x.skipped).map((x) => x.key);

console.log("Regelset inkoopfacturen\n");

/* 1. De gelukkige route */
{
  const v = evaluateInvoice(lees(compleet), ctx);
  assert("complete factuur → ok", v.status === "ok", `kreeg ${v.status}: ${gefaald(compleet).join(", ")}`);
  assert("complete factuur → niets te melden", v.mailable.length === 0);
}

/* 2. Btw-verlegging: wettelijk GEEN btw op de factuur. Dit is de belangrijkste
      regel — hier zou een fout élke onderaannemersfactuur afkeuren. */
{
  const verlegd: AiInvoiceFields = {
    ...compleet,
    vatRate: null,
    vatAmount: null,
    vatExemptionNote: "inversión del sujeto pasivo (art. 84.Uno.2º f LIVA)",
    subtotal: 6566,
    total: 6566,
  };
  const v = evaluateInvoice(lees(verlegd), ctx);
  assert("btw-verlegd → ok, niet afkeuren", v.status === "ok", `kreeg ${v.status}: ${gefaald(verlegd).join(", ")}`);
}

/* 3. Onleesbaar mag nooit een afkeuring worden */
{
  const geenSleutel = evaluateInvoice({ ok: false, error: "no-api-key" }, ctx);
  assert("geen API-sleutel → onleesbaar", geenSleutel.status === "unreadable");
  assert("geen API-sleutel → geen mail", geenSleutel.mailable.length === 0);

  const leeg = evaluateInvoice(lees({ ...compleet, invoiceNumber: null, invoiceDate: null, total: null }), ctx);
  assert("niets uitgelezen → onleesbaar i.p.v. 15 verwijten", leeg.status === "unreadable");

  const slechteScan = evaluateInvoice(lees({ ...compleet, legible: false, readNotes: "foto onscherp" }), ctx);
  assert("slechte scan → onleesbaar", slechteScan.status === "unreadable");
}

/* 4. Losse ontbrekende velden keuren precies één punt af */
{
  const zonderNif = gefaald({ ...compleet, supplierTaxId: null });
  assert("NIF weg → alleen supplier_tax_id", zonderNif.length === 1 && zonderNif[0] === "supplier_tax_id", zonderNif.join(", "));

  const foutNif = gefaald({ ...compleet, supplierTaxId: "12345678A" }); // verkeerde controleletter
  assert("NIF met verkeerde controleletter faalt", foutNif.includes("supplier_tax_id"));

  const zonderAdres = gefaald({ ...compleet, supplierAddress: "Javea" });
  assert("adres zonder huisnummer faalt", zonderAdres.includes("supplier_address"));

  const vaag = gefaald({ ...compleet, descriptionText: "Trabajos varios" });
  assert("vage omschrijving faalt", vaag.includes("work_description"));

  const geenUren = gefaald({ ...compleet, hours: null, hoursPeriodFrom: null, descriptionText: "Mano de obra en la obra de Gershwin" });
  assert("arbeid zonder uren faalt", geenUren.includes("hours_detail"));

  const materiaal = gefaald({ ...compleet, isLabor: false, hours: null, hoursPeriodFrom: null, hoursPeriodTo: null });
  assert("materiaalfactuur vraagt geen uren", !materiaal.includes("hours_detail"), materiaal.join(", "));
}

/* 5. Bedragen die niet optellen */
{
  const eenCent = gefaald({ ...compleet, total: 7944.87 });
  assert("1 cent afwijking → binnen tolerantie", !eenCent.includes("totals_consistent"));

  const tienEuro = gefaald({ ...compleet, total: 7954.86 });
  assert("10 euro afwijking → faalt", tienEuro.includes("totals_consistent"));

  const metInhouding = gefaald({ ...compleet, retentionPct: 15, retentionAmount: 984.9, total: 6959.96 });
  assert("IRPF-inhouding telt mee in de controle", !metInhouding.includes("totals_consistent"), metInhouding.join(", "));
}

/* 6. Documentsoorten */
{
  const offerte = gefaald({ ...compleet, documentKind: "presupuesto" });
  assert("presupuesto is geen factuur", offerte.includes("is_final_invoice"));

  const ticket = evaluateInvoice(lees({ ...compleet, documentKind: "simplificada", recipientName: null, recipientTaxId: null }), ctx);
  const ticketKeys = ticket.checks.filter((c) => !c.ok && !c.skipped).map((c) => c.key as CheckKey);
  assert("ticket eist geen ontvangergegevens", !ticketKeys.includes("recipient_name") && !ticketKeys.includes("recipient_tax_id"));
  assert("ticket geeft wel een waarschuwing", ticketKeys.includes("simplified_invoice"));
  assert("ticket blokkeert niet", ticket.status === "warn", `kreeg ${ticket.status}`);
}

/* 7. Waarschuwingen blokkeren niet */
{
  const geenProject = evaluateInvoice(lees(compleet), { projectMatched: false });
  assert("geen projectmatch → waarschuwing, geen afkeuring", geenProject.status === "warn");

  const anderIban = evaluateInvoice(lees(compleet), { projectMatched: true, knownIbans: ["ES9999999999999999999999"] });
  assert("gewijzigd IBAN → waarschuwing", anderIban.status === "warn");
  assert("gewijzigd IBAN blijft intern", anderIban.mailable.every((c) => c.key !== "iban_changed"));

  const contant = gefaald({ ...compleet, iban: null, paymentMethod: "efectivo" });
  assert("contant betaald vraagt geen IBAN", !contant.includes("payment_iban"), contant.join(", "));
}

/* 8. Losse hulpfuncties */
{
  assert("NIF Z0413505Q geldig", isPlausibleTaxId("Z0413505Q"));
  assert("NIF Z2331242J geldig", isPlausibleTaxId("Z2331242J"));
  assert("CIF B54888953 geldig", isPlausibleTaxId("B54888953"));
  assert("onzin-NIF ongeldig", !isPlausibleTaxId("ABC"));
  assert("IBAN met spaties/kleine letters geldig", isValidIban("es09 0049 2537 6025 1404 9801"));
  assert("IBAN met tikfout ongeldig", !isValidIban("ES0900492537602514049802"));
}

console.log(`\n${ok} geslaagd, ${fail} mislukt`);
process.exit(fail === 0 ? 0 : 1);
