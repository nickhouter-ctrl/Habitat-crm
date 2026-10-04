import type { DistributeurItem } from "@/lib/distributeur-catalogus";

/** Alleen onze productasset-hosts; geen redirects naar willekeurige netwerken.
 * Kleine JPEG's houden de printbare collectie leesbaar én downloadbaar. */
function assetUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const allowed = new Set(["habitat-one-ecru.vercel.app", "www.habitat-one.com", "habitat-one.com"]);
    const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (storage) allowed.add(new URL(storage).hostname);
    // De bestaande productbibliotheek, ook voor lokaal renderen zonder env.
    allowed.add("kcsqmsmferruwnhsibxk.supabase.co");
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && allowed.has(url.hostname) ? url : null;
  } catch { return null; }
}
async function thumbnail(raw: string): Promise<string | null> {
  const url = assetUrl(raw);
  if (!url) return null;
  try {
    // Load only while generating thumbnails: a missing image dependency must
    // never prevent opening the pricing page or reading its margin controls.
    const { default: sharp } = await import("sharp");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body || !/^image\/(jpeg|png|webp)/i.test(response.headers.get("content-type") ?? "")) return null;
    const maxBytes = 8_000_000;
    if (Number(response.headers.get("content-length")) > maxBytes) { await response.body.cancel(); return null; }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let count = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const jpg = await sharp(Buffer.concat(chunks), {limitInputPixels:40_000_000}).rotate().resize(200,200,{fit:"cover",withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch { return null; }
}
export async function dealerPdfImages(items: DistributeurItem[]): Promise<DistributeurItem[]> {
  const cache = new Map<string, Promise<string | null>>();
  const result = items.map(item => ({...item,imageUrl:null as string|null}));
  let next = 0;
  await Promise.all(Array.from({length:Math.min(6,items.length)}, async () => {
    while (next < items.length) {
      const index = next++, src = items[index].imageUrl;
      if (!src) continue;
      if (!cache.has(src)) cache.set(src,thumbnail(src));
      result[index].imageUrl = await cache.get(src)!;
    }
  }));
  return result;
}
