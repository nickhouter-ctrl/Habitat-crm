/**
 * Property photo storage — Supabase Storage (public bucket `property-images`).
 * Server-only: uses the service-role key. Public URLs are stored on `properties.images`.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "property-images";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 25 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function supabase() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY zijn niet ingesteld (zie .env.example).",
    );
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function extensionFor(file: File): string {
  const dot = file.name.lastIndexOf(".");
  if (dot !== -1 && dot < file.name.length - 1) {
    return file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  }
  return EXT_BY_MIME[file.type] ?? "bin";
}

/** Upload one image for a property; returns its public URL. */
export async function uploadPropertyImage(propertyId: string, file: File): Promise<string> {
  if (!file || file.size === 0) throw new Error("Leeg bestand.");
  if (!IMAGE_MIME.has(file.type)) {
    throw new Error(`Niet-ondersteund bestandstype (${file.type || "onbekend"}). Gebruik JPG, PNG, WebP of AVIF.`);
  }
  if (file.size > MAX_BYTES) throw new Error("Bestand te groot (max 25 MB).");

  const path = `${propertyId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload mislukt: ${error.message}`);

  const { data } = supabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Best-effort delete of an image we previously uploaded (no-op for foreign URLs). */
export async function deletePropertyImageByUrl(url: string): Promise<void> {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + marker.length));
  if (!path) return;
  await supabase().storage.from(BUCKET).remove([path]);
}

/* ------------------------------------------------------------- product photos */
/* Publieke bucket — productfoto's verschijnen op de website.                   */

const PRODUCT_BUCKET = process.env.SUPABASE_PRODUCT_BUCKET ?? "product-images";

async function ensureProductBucket() {
  const sb = supabase();
  const { data } = await sb.storage.getBucket(PRODUCT_BUCKET);
  if (data) return;
  await sb.storage.createBucket(PRODUCT_BUCKET, { public: true });
}

/** Upload één foto voor een product; geeft een publieke URL terug. */
export async function uploadProductImage(productId: string, file: File): Promise<string> {
  if (!file || file.size === 0) throw new Error("Leeg bestand.");
  if (!IMAGE_MIME.has(file.type)) {
    throw new Error(`Niet-ondersteund bestandstype (${file.type || "onbekend"}). Gebruik JPG, PNG, WebP of AVIF.`);
  }
  if (file.size > MAX_BYTES) throw new Error("Bestand te groot (max 25 MB).");

  await ensureProductBucket();
  const path = `${productId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase()
    .storage.from(PRODUCT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload mislukt: ${error.message}`);
  const { data } = supabase().storage.from(PRODUCT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteProductImageByUrl(url: string): Promise<void> {
  const marker = `/storage/v1/object/public/${PRODUCT_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + marker.length));
  if (!path) return;
  try {
    await supabase().storage.from(PRODUCT_BUCKET).remove([path]);
  } catch {
    /* best effort */
  }
}

/** Haal de bytes op die in deze publieke Supabase-URL staan (voor GitHub-push). */
export async function fetchProductImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, contentType };
  } catch {
    return null;
  }
}

/* ----------------------------------------- purchase-order source documents */
/* Private bucket — proforma invoices contain bank details, so never public.   */

const PO_BUCKET = process.env.SUPABASE_PO_BUCKET ?? "purchase-order-files";
const PO_DOC_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

async function ensurePoBucket() {
  const sb = supabase();
  const { data } = await sb.storage.getBucket(PO_BUCKET);
  if (data) return;
  await sb.storage.createBucket(PO_BUCKET, { public: false });
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "bestand";
}

/** Upload one source document for a purchase order; returns storage metadata. */
export async function uploadPurchaseOrderFile(
  file: File,
): Promise<{ name: string; path: string; size: number }> {
  if (!file || file.size === 0) throw new Error("Leeg bestand.");
  if (file.type && !PO_DOC_MIME.has(file.type)) {
    throw new Error(`Niet-ondersteund bestandstype (${file.type}). Gebruik PDF, een afbeelding of Excel.`);
  }
  if (file.size > MAX_BYTES) throw new Error("Bestand te groot (max 25 MB).");

  await ensurePoBucket();
  const path = `${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase()
    .storage.from(PO_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Upload mislukt: ${error.message}`);
  return { name: file.name, path, size: file.size };
}

/** Short-lived signed download URL for a stored purchase-order file. */
export async function purchaseOrderFileUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabase()
      .storage.from(PO_BUCKET)
      .createSignedUrl(path, expiresInSec);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function deletePurchaseOrderFile(path: string): Promise<void> {
  if (!path) return;
  try {
    await supabase().storage.from(PO_BUCKET).remove([path]);
  } catch {
    /* best effort */
  }
}
