/**
 * Landen voor een keuzelijst.
 *
 * Alleen de codes staan hier; de namen komen uit `Intl.DisplayNames`, dus een
 * Spanjaard ziet "Países Bajos" en een Nederlander "Nederland" zonder dat wij
 * tweehonderd landnamen in drie talen bijhouden. Wat we wél vastleggen is de
 * volgorde: de landen waar onze bezoekers vandaan komen staan bovenaan, want
 * op een beursvloer wil niemand door een lijst van tweehonderd scrollen.
 */

/** Bovenaan de lijst — waar onze klanten en beursbezoekers vandaan komen. */
export const LANDEN_BOVENAAN = ["ES", "NL", "BE", "DE", "FR", "GB", "IT", "PT"] as const;

/** ISO 3166-1 alpha-2, het formaat dat ook in `contacts.country` staat. */
export const LANDCODES = [
  "AD","AE","AF","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ",
  "BN","BO","BR","BS","BT","BW","BY","BZ","CA","CD","CF","CG","CH","CI","CL","CM","CN","CO","CR","CU",
  "CV","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","ER","ES","ET","FI","FJ","FR","GA","GB",
  "GD","GE","GH","GM","GN","GQ","GR","GT","GW","GY","HN","HR","HT","HU","ID","IE","IL","IN","IQ","IR",
  "IS","IT","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KZ","LA","LB","LC","LI","LK",
  "LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MG","MH","MK","ML","MM","MN","MR","MT","MU","MV",
  "MW","MX","MY","MZ","NA","NE","NG","NI","NL","NO","NP","NZ","OM","PA","PE","PG","PH","PK","PL","PT",
  "PY","QA","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SI","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SY","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","US",
  "UY","UZ","VA","VC","VE","VN","VU","WS","YE","ZA","ZM","ZW",
] as const;

export type Landcode = (typeof LANDCODES)[number];

const codes = new Set<string>(LANDCODES);

/** Is dit een landcode die we kennen? Invoer van buiten komt hier langs. */
export function isLandcode(waarde: string | null | undefined): boolean {
  return !!waarde && codes.has(waarde.toUpperCase());
}

/** De naam van het land in de gevraagde taal; onbekend → de code zelf. */
export function landNaam(code: string | null | undefined, taal = "nl"): string {
  const c = (code ?? "").toUpperCase();
  if (!c) return "";
  try {
    return new Intl.DisplayNames([taal], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

/**
 * De keuzelijst: eerst onze eigen landen in een vaste volgorde, daarna de rest
 * op alfabet — op naam in de taal van het scherm, niet op code, want "DE" hoort
 * bij een Nederlander onder de D van Duitsland te staan.
 */
export function landenVoorKeuze(taal = "nl"): { code: string; naam: string; vast: boolean }[] {
  const vast = LANDEN_BOVENAAN.map((code) => ({ code, naam: landNaam(code, taal), vast: true }));
  const rest = LANDCODES.filter((c) => !(LANDEN_BOVENAAN as readonly string[]).includes(c))
    .map((code) => ({ code, naam: landNaam(code, taal), vast: false }))
    .sort((a, b) => a.naam.localeCompare(b.naam, taal, { sensitivity: "base" }));
  return [...vast, ...rest];
}
