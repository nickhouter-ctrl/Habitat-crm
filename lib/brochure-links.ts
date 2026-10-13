import type { CatalogFile } from "@/lib/storage";

/** Stable public brochure links that staff can include from the inbox composer. */
export const WEBSITE_BROCHURES: CatalogFile[] = [
  {
    path: "brochure:stone-motion-en",
    name: "Stone Motion Hardcover — English",
    size: 198_402_554,
    url: "https://www.habitat-one.com/brochure/en",
    uploadedAt: null,
  },
  {
    path: "brochure:stone-motion-es",
    name: "Stone Motion Hardcover — Español",
    size: 198_412_911,
    url: "https://www.habitat-one.com/brochure/es",
    uploadedAt: null,
  },
];

export function findWebsiteBrochure(path: string): CatalogFile | undefined {
  return WEBSITE_BROCHURES.find((brochure) => brochure.path === path);
}
