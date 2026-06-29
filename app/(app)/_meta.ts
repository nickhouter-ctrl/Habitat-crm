/** Display metadata (Dutch labels + badge tones) for the CRM enums. */
import type { BadgeTone } from "@/components/ui";

type Meta = { label: string; tone: BadgeTone };

export const leadStageMeta: Record<
  "new" | "contacted" | "qualified" | "proposal" | "won" | "lost",
  Meta
> = {
  new: { label: "Nieuw", tone: "info" },
  contacted: { label: "Contact gelegd", tone: "info" },
  qualified: { label: "Gekwalificeerd", tone: "accent" },
  proposal: { label: "Offerte uit", tone: "warning" },
  won: { label: "Gewonnen", tone: "success" },
  lost: { label: "Verloren", tone: "danger" },
};

export const contactTypeMeta: Record<
  "lead" | "customer" | "owner" | "partner" | "reseller" | "supplier" | "other",
  Meta
> = {
  lead: { label: "Lead", tone: "info" },
  customer: { label: "Klant", tone: "success" },
  owner: { label: "Eigenaar", tone: "accent" },
  partner: { label: "Partner", tone: "neutral" },
  reseller: { label: "Wederverkoper", tone: "info" },
  supplier: { label: "Leverancier", tone: "neutral" },
  other: { label: "Overig", tone: "neutral" },
};

export const dealStageMeta: Record<
  "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost" | "on_hold",
  Meta
> = {
  lead: { label: "Lead", tone: "info" },
  qualified: { label: "Gekwalificeerd", tone: "info" },
  proposal: { label: "Offerte", tone: "warning" },
  negotiation: { label: "Onderhandeling", tone: "warning" },
  won: { label: "Gewonnen", tone: "success" },
  lost: { label: "Verloren", tone: "danger" },
  on_hold: { label: "On hold", tone: "neutral" },
};

export const dealTypeMeta: Record<
  | "renovation"
  | "new_build"
  | "material_supply"
  | "property_sale"
  | "design"
  | "legal"
  | "other",
  string
> = {
  renovation: "Renovatie",
  new_build: "Nieuwbouw",
  material_supply: "Materiaallevering",
  property_sale: "Verkoop pand",
  design: "Ontwerp",
  legal: "Juridisch",
  other: "Overig",
};

export const propertyStatusMeta: Record<
  "available" | "reserved" | "under_offer" | "sold" | "withdrawn",
  Meta
> = {
  available: { label: "Beschikbaar", tone: "success" },
  reserved: { label: "Gereserveerd", tone: "warning" },
  under_offer: { label: "Onder bod", tone: "warning" },
  sold: { label: "Verkocht", tone: "neutral" },
  withdrawn: { label: "Teruggetrokken", tone: "danger" },
};

export const propertyTypeMeta: Record<
  | "villa"
  | "apartment"
  | "townhouse"
  | "plot"
  | "renovation_project"
  | "commercial"
  | "other",
  string
> = {
  villa: "Villa",
  apartment: "Appartement",
  townhouse: "Rijwoning",
  plot: "Bouwgrond",
  renovation_project: "Renovatieproject",
  commercial: "Commercieel",
  other: "Overig",
};

export const documentKindMeta: Record<
  "estimate" | "proforma" | "invoice" | "creditnote" | "salesreceipt" | "deliverynote",
  string
> = {
  estimate: "Offerte",
  proforma: "Pro-forma",
  invoice: "Factuur",
  creditnote: "Creditnota",
  salesreceipt: "Bon",
  deliverynote: "Pakbon",
};

export const documentStatusMeta: Record<
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "void",
  Meta
> = {
  draft: { label: "Concept", tone: "neutral" },
  sent: { label: "Verstuurd", tone: "info" },
  accepted: { label: "Geaccepteerd", tone: "accent" },
  rejected: { label: "Afgewezen", tone: "danger" },
  paid: { label: "Betaald", tone: "success" },
  partially_paid: { label: "Deels betaald", tone: "warning" },
  overdue: { label: "Achterstallig", tone: "danger" },
  void: { label: "Geannuleerd", tone: "neutral" },
};

export const languageMeta: Record<"en" | "nl" | "es" | "de", string> = {
  en: "Engels",
  nl: "Nederlands",
  es: "Spaans",
  de: "Duits",
};
