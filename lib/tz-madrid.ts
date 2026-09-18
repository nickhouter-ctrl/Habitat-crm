/**
 * Rekenen in Europe/Madrid terwijl JavaScript in UTC denkt.
 *
 * Het bedrijf zit in Xàbia, dus "negen uur 's ochtends" betekent Madrid-tijd —
 * en dat is 's winters UTC+1 en 's zomers UTC+2. Dat verschil zelf uitrekenen
 * gaat twee keer per jaar mis, dus het staat hier één keer.
 *
 * Puur en isomorf: geen Node-API's, bruikbaar in client én server.
 */

/** Minuten die Europe/Madrid op dat moment vóórloopt op UTC (60 of 120). */
export function madridUtcOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value])) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Datum en tijd zoals de klok in Madrid ze op dat moment laat zien. */
export function madridDelen(at: Date): {
  jaar: number;
  maand: number;
  dag: number;
  uur: number;
  minuut: number;
  /** 0 = zondag, 1 = maandag … 6 = zaterdag. */
  weekdag: number;
} {
  const verschoven = new Date(at.getTime() + madridUtcOffsetMinutes(at) * 60_000);
  return {
    jaar: verschoven.getUTCFullYear(),
    maand: verschoven.getUTCMonth() + 1,
    dag: verschoven.getUTCDate(),
    uur: verschoven.getUTCHours(),
    minuut: verschoven.getUTCMinutes(),
    weekdag: verschoven.getUTCDay(),
  };
}

/** Middernacht in Madrid van de dag waarin `at` valt, als UTC-moment. */
export function madridMiddernacht(at: Date): Date {
  const d = madridDelen(at);
  const ruw = Date.UTC(d.jaar, d.maand - 1, d.dag, 0, 0, 0);
  // Twee passen: de offset op middernacht kan anders zijn dan die op `at`
  // (de nacht van de omschakeling).
  const eerste = new Date(ruw - madridUtcOffsetMinutes(at) * 60_000);
  return new Date(ruw - madridUtcOffsetMinutes(eerste) * 60_000);
}

/** Hoeveel hele dagen zitten er tussen twee Madrid-kalenderdagen? */
export function madridDagenTussen(van: Date, tot: Date): number {
  const a = madridMiddernacht(van).getTime();
  const b = madridMiddernacht(tot).getTime();
  return Math.round((b - a) / 86_400_000);
}
