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

/* Documentbijlagen (bv. kozijn-tekeningen) — zelfde private bucket, eigen prefix. */

/** Upload een bijlage voor een offerte/factuur; returnt storage-metadata. */
export async function uploadDocumentFile(
  documentId: string,
  file: File,
): Promise<{ name: string; path: string; size: number; contentType: string; uploadedAt: string }> {
  if (!file || file.size === 0) throw new Error("Leeg bestand.");
  if (file.type && !PO_DOC_MIME.has(file.type)) {
    throw new Error(`Niet-ondersteund bestandstype (${file.type}). Gebruik PDF of een afbeelding.`);
  }
  if (file.size > MAX_BYTES) throw new Error("Bestand te groot (max 25 MB).");
  await ensurePoBucket();
  const path = `documents/${documentId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase()
    .storage.from(PO_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Upload mislukt: ${error.message}`);
  return {
    name: file.name,
    path,
    size: file.size,
    contentType: file.type || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
  };
}

/** Short-lived signed download URL voor een documentbijlage. */
export async function documentFileUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  return purchaseOrderFileUrl(path, expiresInSec);
}

export async function deleteDocumentFile(path: string): Promise<void> {
  await deletePurchaseOrderFile(path);
}

/**
 * Signed upload-URL zodat de browser het bestand RECHTSTREEKS naar Supabase
 * uploadt (omzeilt de ~4,5 MB body-limiet van Vercel server-actions). De server
 * genereert de URL met de service-role; de client PUT't het bestand ernaartoe.
 */
export async function signDocumentUpload(
  documentId: string,
  filename: string,
  contentType?: string,
): Promise<{ path: string; token: string; signedUrl: string; contentType: string }> {
  await ensurePoBucket();
  const path = `documents/${documentId}/${crypto.randomUUID()}-${safeName(filename)}`;
  const { data, error } = await supabase().storage.from(PO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Kon upload-URL niet aanmaken: ${error?.message ?? "onbekend"}`);
  return { path, token: data.token, signedUrl: data.signedUrl, contentType: contentType || "application/octet-stream" };
}

/** Download de bytes van een documentbijlage (voor de mail-bijlage). */
export async function fetchDocumentFileBytes(
  path: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const { data, error } = await supabase().storage.from(PO_BUCKET).download(path);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    return { bytes: buf, contentType: data.type || "application/octet-stream" };
  } catch {
    return null;
  }
}

/**
 * Kopieer een mail-bijlage (uit bucket 'email-attachments') naar de
 * purchase-order-files bucket. Returns metadata voor opslag in
 * purchase_orders.attachments JSON.
 */
const MAIL_BUCKET = "email-attachments";
export async function copyMailAttachmentToPoBucket(args: {
  mailStoragePath: string;
  filename: string;
}): Promise<{ name: string; path: string; size: number } | null> {
  const sb = supabase();
  await ensurePoBucket();

  const { data, error } = await sb.storage.from(MAIL_BUCKET).download(args.mailStoragePath);
  if (error || !data) {
    console.error("Mail-attachment download fail:", error?.message);
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const path = `${crypto.randomUUID()}-${safeName(args.filename)}`;
  const up = await sb.storage
    .from(PO_BUCKET)
    .upload(path, buf, { contentType: data.type || "application/octet-stream", upsert: false });
  if (up.error) {
    console.error("PO-bucket upload fail:", up.error.message);
    return null;
  }
  return { name: args.filename, path, size: buf.length };
}

/** Download een mail-bijlage (bucket 'email-attachments') als buffer. */
export async function downloadMailAttachmentBuffer(storagePath: string): Promise<Buffer | null> {
  const { data, error } = await supabase().storage.from(MAIL_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Download een bestand uit de purchase-order-files bucket als buffer. */
export async function downloadPurchaseOrderBuffer(path: string): Promise<Buffer | null> {
  const { data, error } = await supabase().storage.from(PO_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Upload ruwe bytes (bv. een gegenereerde PDF) naar de PO-bucket. */
export async function uploadPurchaseOrderBytes(
  name: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<{ name: string; path: string; size: number } | null> {
  await ensurePoBucket();
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const path = `${crypto.randomUUID()}-${safeName(name)}`;
  const { error } = await supabase()
    .storage.from(PO_BUCKET)
    .upload(path, buf, { contentType, upsert: false });
  if (error) {
    console.error("PO-bucket bytes upload fail:", error.message);
    return null;
  }
  return { name, path, size: buf.length };
}

/* --------------------------------------------------------------- catalogi */
/* Publieke bucket — catalogus/brochure-PDF's, downloadbaar op /catalogi.       */

const CATALOG_BUCKET = process.env.SUPABASE_CATALOG_BUCKET ?? "catalogs";

async function ensureCatalogBucket() {
  const sb = supabase();
  const { data } = await sb.storage.getBucket(CATALOG_BUCKET);
  if (data) return;
  await sb.storage.createBucket(CATALOG_BUCKET, { public: true });
}

export type CatalogFile = {
  name: string;
  path: string;
  url: string;
  size: number;
  uploadedAt: string | null;
};

/** Alle geüploade catalogus-PDF's, nieuwste eerst. */
export async function listCatalogFiles(): Promise<CatalogFile[]> {
  const sb = supabase();
  await ensureCatalogBucket();
  const { data, error } = await sb.storage
    .from(CATALOG_BUCKET)
    .list("", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return [];
  return data
    .filter((f) => f.id) // mappen overslaan
    .map((f) => {
      const base = sb.storage.from(CATALOG_BUCKET).getPublicUrl(f.name).data.publicUrl;
      // Cache-buster: verandert zodra het bestand opnieuw geüpload wordt, zodat
      // browser/CDN nooit een oude versie blijft serveren.
      const ver = (f.updated_at ?? f.created_at) as string | undefined;
      return {
        name: f.name,
        path: f.name,
        url: ver ? `${base}?v=${Date.parse(ver) || 0}` : base,
        size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
        uploadedAt: (f.created_at as string | undefined) ?? null,
      };
    });
}

/** Upload één catalogus-PDF. */
export async function uploadCatalogFile(file: File): Promise<void> {
  if (!file || file.size === 0) throw new Error("Leeg bestand.");
  if (file.type && file.type !== "application/pdf") throw new Error("Alleen PDF-bestanden.");
  if (file.size > MAX_BYTES) throw new Error("Bestand te groot (max 25 MB).");
  await ensureCatalogBucket();
  const path = safeName(file.name).replace(/\.pdf$/i, "") + ".pdf";
  const { error } = await supabase()
    .storage.from(CATALOG_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Upload mislukt: ${error.message}`);
}

export async function deleteCatalogFile(path: string): Promise<void> {
  if (!path) return;
  try {
    await supabase().storage.from(CATALOG_BUCKET).remove([path]);
  } catch {
    /* best effort */
  }
}
