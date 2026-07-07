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

/** Optionele nettere labels voor in de mail/UI. */
const LABEL_OVERRIDE: Record<string, string> = {
  Caracole: "Meubels — Caracole",
  "Cornelius Lifestyle": "Meubels — Cornelius",
  "XPS montageplaten": "Montageplaten",
};

export function groupUrl(collection: string): string {
  return WEBSITE + (GROUP_ROUTE[collection] ?? "/products/all");
}

export function groupLabel(collection: string): string {
  return LABEL_OVERRIDE[collection] ?? collection;
}

export interface CampaignGroup {
  collection: string;
  label: string;
  url: string;
  imageUrl: string | null;
}
