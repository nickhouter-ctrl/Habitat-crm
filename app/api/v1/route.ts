import { apiAuth, apiJson } from "@/lib/api-keys";
export const dynamic = "force-dynamic";

/** Overzicht van de content-API: wat er is en hoe je het aanroept. */
export async function GET(req: Request) {
  const caller = await apiAuth(req, "content:read");
  if (caller instanceof Response) return caller;
  return apiJson({
    name: "Habitat One content API", version: "v1", key: caller.name, scopes: caller.scopes,
    auth: "Authorization: Bearer <your key>",
    limits: "120 requests per minute; list endpoints take ?limit= (max 100) and ?offset=",
    endpoints: {
      "GET /api/v1/products": "Active products: name, brand, collection, description, dimensions, retail price, image. Filters: ?q= ?brand= (slug) ?category= ?collection=",
      "GET /api/v1/brands": "Brands with logo and website",
      "GET /api/v1/assets": "Image/video library with public URLs. Filters: ?productId= ?tag= ?mediaType=image|video ?source=",
      "POST /api/v1/assets": "Upload images/videos (multipart/form-data: file, optional productId, tags=comma,separated). Duplicates are detected.",
      "GET /api/v1/creatives": "Creative drafts/approved posts. Filters: ?status= ?productId=",
      "POST /api/v1/creatives": "Create a draft creative: {assetId, productId?, template, palette, format: 1080x1080|1080x1350|1080x1920, locale: en|nl|es|de, copy: {headline, eyebrow?, subline?, cta?, badge?}, copyAngle?, suggestedMessage?}",
      "GET /api/v1/copy-blocks": "Reusable texts. Filters: ?locale= ?role= ?productId=",
      "POST /api/v1/copy-blocks": "Add a text: {angle: material|price|showroom|project|seasonal, locale, role: eyebrow|headline|subline|cta, text, productId?}",
    },
    notes: "No customer, financial or project data is available through this API. Creatives are created as drafts; publishing is done in the CRM.",
  });
}
