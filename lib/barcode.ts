/** EAN-13 / GTIN helpers + automatic product barcode generation. */

/** EAN-13 check digit for a 12-digit numeric string. */
export function ean13CheckDigit(d12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = d12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Build a full 13-digit EAN-13 from a (≤12-digit) base. */
export function ean13(base: string): string {
  const d = (base || "").replace(/\D/g, "").slice(0, 12).padStart(12, "0");
  return d + ean13CheckDigit(d);
}

export function isValidEan13(s: string): boolean {
  return /^\d{13}$/.test(s) && ean13CheckDigit(s.slice(0, 12)) === s[12];
}

/**
 * Next EAN-13 barcode for a product.
 *  - With a configured GS1 company prefix (`GS1_COMPANY_PREFIX`, 7–12 digits):
 *    prefix + zero-padded item reference + check digit  → a real GS1 GTIN.
 *  - Without one: a "2xx" restricted-distribution / in-store code — valid EAN-13
 *    format, not GS1-licensed (fine for internal use).
 */
export function nextProductBarcode(sequence: number): string {
  const seq = Math.max(1, Math.floor(sequence));
  const prefix = (process.env.GS1_COMPANY_PREFIX ?? "").replace(/\D/g, "");
  if (prefix.length >= 7 && prefix.length <= 11) {
    const refLen = 12 - prefix.length;
    const ref = String(seq % 10 ** refLen).padStart(refLen, "0");
    return ean13(prefix + ref);
  }
  // Internal "2" range (restricted distribution).
  return ean13("200" + String(seq % 1_000_000_000).padStart(9, "0"));
}

/** What symbology to render `code` in: EAN-13 if it's a valid 13-digit GTIN, else Code 128. */
export function barcodeFormat(code: string): "EAN13" | "CODE128" {
  return isValidEan13(code) ? "EAN13" : "CODE128";
}
