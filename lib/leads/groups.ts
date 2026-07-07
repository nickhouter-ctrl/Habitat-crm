/**
 * Productgroepen voor campagnes. Een "groep" = een `collection`-waarde uit de
 * productcatalogus (Badkamer, Bloempotten, Wandpanelen, Sfeerhaarden, Meubels…).
 * Elke groep linkt naar de bijbehorende groepspagina op de website en toont een
 * representatieve productfoto.
 */
import { COMPANY } from "@/lib/company";

const WEBSITE = `https://www.${COMPANY.website.replace(/^https?:\/\/(www\.)?/, "")}`;

/** collection → pad op de website (bestaande groepsroutes). Onbekend → /products/all. */
const GROUP_ROUTE: Record<string, string> = {
  Badkamer: "/products/bathroom",
  "Badkamer accessoires": "/products/bathroom",
  Bloempotten: "/products/bloempotten",
  Sfeerhaarden: "/products/sfeerhaarden",
  Verlichting: "/products/verlichting",
  "PVC Vloeren": "/products/pvc-vloeren",
  "Schakelaars & stopcontacten": "/products/schakelmateriaal",
  Acrylpanelen: "/products/acrylpanelen",
  Wandpanelen: "/products/acrylpanelen",
  "XPS montageplaten": "/products/backer-boards",
  "Binnen en buiten deuren": "/products/doors",
  Caracole: "/products/all",
  "Cornelius Lifestyle": "/products/all",
  Railingen: "/products/all",
};

/** Optionele nettere labels (NL) voor in de mail/UI. */
const LABEL_OVERRIDE: Record<string, string> = {
  Caracole: "Meubels — Caracole",
  "Cornelius Lifestyle": "Meubels — Cornelius",
  "XPS montageplaten": "Montageplaten",
};

/** Spaanse groepslabels (voor Spaanstalige mails). */
const LABEL_ES: Record<string, string> = {
  Badkamer: "Baños",
  "Badkamer accessoires": "Accesorios de baño",
  Bloempotten: "Macetas",
  Sfeerhaarden: "Chimeneas",
  Verlichting: "Iluminación",
  "PVC Vloeren": "Suelos PVC",
  Wandpanelen: "Paneles de pared",
  Acrylpanelen: "Paneles acrílicos",
  "Schakelaars & stopcontacten": "Interruptores y enchufes",
  "XPS montageplaten": "Paneles de montaje",
  "Binnen en buiten deuren": "Puertas",
  Caracole: "Muebles — Caracole",
  "Cornelius Lifestyle": "Muebles — Cornelius",
  Railingen: "Barandillas",
};

/** Website-locale-prefix (en = geen prefix, andere talen wél). */
function localePrefix(lang?: string): string {
  return !lang || lang === "en" ? "" : `/${lang}`;
}

/**
 * Handgekozen sfeer-/lifestylebeeld per groep (interieur/exterieur), gehost op de
 * website — veel mooier dan de ruwe materiaal-productfoto's. Fallback: productfoto.
 */
const GROUP_HERO: Record<string, string> = {
  Badkamer: "/scenery/bathroom-hero.jpg",
  "Badkamer accessoires": "/scenery/bathroom-hero.jpg",
  Bloempotten: "/spaces/garden/garden-planters-canyon.jpg",
  Sfeerhaarden: "/spaces/living-room/acryl-fireplace.jpg",
  Verlichting: "/spaces/living-room/acryl-green-tv.jpg",
  "PVC Vloeren": "/spaces/living-room/acryl-dining.jpg",
  Wandpanelen: "/scenery/flexibel-stone-hero.jpg",
  Acrylpanelen: "/spaces/kitchen/kitchen-acryl-cream.jpg",
  "Schakelaars & stopcontacten": "/spaces/kitchen/kitchen-01.jpg",
  "XPS montageplaten": "/scenery/flexibel-stone-hero.jpg",
  "Binnen en buiten deuren": "/scenery/doors-hero.jpg",
  Caracole: "/spaces/living-room/acryl-amber-sofa.jpg",
  "Cornelius Lifestyle": "/spaces/bedroom/bedroom-01.jpg",
  Railingen: "/scenery/pool-villa.jpg",
};

export function groupUrl(collection: string, lang?: string): string {
  return WEBSITE + localePrefix(lang) + (GROUP_ROUTE[collection] ?? "/products/all");
}

/** Sfeerbeeld-URL voor een groep, of null als er geen handgekozen beeld is. */
export function groupHeroUrl(collection: string): string | null {
  return GROUP_HERO[collection] ? WEBSITE + GROUP_HERO[collection] : null;
}

export function groupLabel(collection: string, lang?: string): string {
  if (lang === "es") return LABEL_ES[collection] ?? LABEL_OVERRIDE[collection] ?? collection;
  return LABEL_OVERRIDE[collection] ?? collection;
}

export interface CampaignGroup {
  collection: string;
  label: string;
  url: string;
  imageUrl: string | null;
}
