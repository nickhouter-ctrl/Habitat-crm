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
