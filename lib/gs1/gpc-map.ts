/**
 * Mapping van Habitat-collectie/categorie naar GS1 Global Product Classification.
 * GPC-codes komen uit de "Ayuda GPC" tab van het MijnGS1 import-template.
 * Per categorie ook de default Unidad-de-Medida (UOM) voor 'contenido_neto'.
 */
export interface GpcMapping {
  gpc: string;
  uom: string;
  netContent: number;
}

const DEFAULT: GpcMapping = { gpc: "10001352", uom: "Unidad", netContent: 1 };

const BY_COLLECTION_CATEGORY: Record<string, GpcMapping> = {
  // Wandpanelen — wandtegels per m²
  "Wandpanelen|XPS montageplaten": { gpc: "10007958", uom: "Unidad", netContent: 1 },
  "Wandpanelen|*":                  { gpc: "10002431", uom: "Metro cuadrado", netContent: 1 },

  // Deuren
  "Binnen en buiten deuren|Binnendeuren": { gpc: "10002567", uom: "Unidad", netContent: 1 },
  "Binnen en buiten deuren|Buitendeuren": { gpc: "10002570", uom: "Unidad", netContent: 1 },
  "Binnen en buiten deuren|Beslag":       { gpc: "10002573", uom: "Unidad", netContent: 1 },

  // Badkamer
  "Badkamer|Wastafels":            { gpc: "10002592", uom: "Unidad",          netContent: 1 },
  "Badkamer|Toiletten":            { gpc: "10007016", uom: "Unidad",          netContent: 1 },
  "Badkamer|Baden":                { gpc: "10002595", uom: "Unidad",          netContent: 1 },
  "Badkamer|Douchebakken":         { gpc: "10002599", uom: "Unidad",          netContent: 1 },
  "Badkamer|Douchesets":           { gpc: "10007726", uom: "Unidad",          netContent: 1 },
  "Badkamer|Douchewanden":         { gpc: "10002600", uom: "Unidad",          netContent: 1 },
  "Badkamer|Afvoeren":             { gpc: "10007013", uom: "Unidad",          netContent: 1 },
  "Badkamer|Solid surface platen": { gpc: "10006720", uom: "Metro cuadrado", netContent: 1 },

  // Badkamer accessoires
  "Badkamer accessoires|Kranen":            { gpc: "10002602", uom: "Unidad", netContent: 1 },
  "Badkamer accessoires|Spiegels":          { gpc: "10002245", uom: "Unidad", netContent: 1 },
  "Badkamer accessoires|Handdoekrekken":    { gpc: "10004033", uom: "Unidad", netContent: 1 },
  "Badkamer accessoires|Handdoekstangen":   { gpc: "10004033", uom: "Unidad", netContent: 1 },
  "Badkamer accessoires|Badrekken":         { gpc: "10006961", uom: "Unidad", netContent: 1 },
  "Badkamer accessoires|Toiletaccessoires": { gpc: "10006961", uom: "Unidad", netContent: 1 },
};

export function resolveGpc(collection: string | null, category: string | null): GpcMapping {
  if (!collection) return DEFAULT;
  const exact = BY_COLLECTION_CATEGORY[`${collection}|${category ?? ""}`];
  if (exact) return exact;
  const wildcard = BY_COLLECTION_CATEGORY[`${collection}|*`];
  if (wildcard) return wildcard;
  return DEFAULT;
}
