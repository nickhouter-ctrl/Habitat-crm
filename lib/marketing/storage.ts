/**
 * Marketing-asset storage — abstractie over waar de bytes van advertentiebeelden
 * landen. De brief (§3.3) eist dat elk beeld bij ingest wordt GEKOPIEERD, nooit
 * gelinkt: Instagram-URL's verlopen binnen dagen. Deze module levert:
 *
 *  - `MarketingStorage` — de interface waar de ingest-pijplijn tegen praat
 *  - `SupabaseMarketingStorage` — productie-implementatie (Supabase Storage,
 *    zelfde conventies als lib/storage.ts: service-role, publieke bucket)
 *  - `MemoryMarketingStorage` — in-memory implementatie voor unit tests
 *
 * Paden zijn content-addressed (sha256 van de bytes, zie lib/marketing/ingest.ts),
 * dus hetzelfde pad betekent dezelfde inhoud. `put` is daarom idempotent: bestaat
 * het object al, dan is dat een geslaagde no-op in plaats van een fout.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MARKETING_BUCKET = process.env.SUPABASE_MARKETING_BUCKET ?? "marketing-assets";

/** Opslag-abstractie voor marketingbeelden (bestandssysteem/S3/Supabase-agnostisch). */
export interface MarketingStorage {
  /**
   * Sla `bytes` op onder `path` (kopieert altijd, linkt nooit).
   * Idempotent: een object dat al bestaat telt als succes.
   * @returns het (gesanitiseerde) opslagpad zoals het is vastgelegd.
   */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  /** Bestaat er al een object op dit pad? */
  exists(path: string): Promise<boolean>;
  /** Publieke URL voor een opgeslagen pad (voor weergave in de UI). */
  publicUrl(path: string): string;
}

/**
 * Valideer en normaliseer een opslagpad: geen path traversal, geen lege
 * segmenten, alleen veilige tekens per segment. Gooit bij een onbruikbaar pad.
 */
export function sanitizeStoragePath(path: string): string {
  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) throw new Error("Leeg opslagpad.");
  if (segments.some((s) => s === "." || s === "..")) {
    throw new Error(`Ongeldig opslagpad (path traversal): ${path}`);
  }
  return segments.map((s) => s.replace(/[^\w.\-]+/g, "_")).join("/");
}

/* ------------------------------------------------------------------ Supabase */

function supabase(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY zijn niet ingesteld (zie .env.example).",
    );
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/**
 * Productie-opslag in Supabase Storage (publieke bucket, standaard
 * `marketing-assets`, override via SUPABASE_MARKETING_BUCKET).
 * Server-only: gebruikt de service-role key.
 */
export class SupabaseMarketingStorage implements MarketingStorage {
  private bucketEnsured = false;

  constructor(private readonly bucket: string = MARKETING_BUCKET) {}

  private async ensureBucket(sb: SupabaseClient): Promise<void> {
    if (this.bucketEnsured) return;
    const { data } = await sb.storage.getBucket(this.bucket);
    if (!data) await sb.storage.createBucket(this.bucket, { public: true });
    this.bucketEnsured = true;
  }

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const safePath = sanitizeStoragePath(path);
    const sb = supabase();
    await this.ensureBucket(sb);
    const { error } = await sb.storage
      .from(this.bucket)
      .upload(safePath, Buffer.from(bytes), { contentType, upsert: false });
    // Content-addressed pad: "bestaat al" betekent dezelfde bytes → geslaagd.
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Opslaan van beeld mislukt: ${error.message}`);
    }
    return safePath;
  }

  async exists(path: string): Promise<boolean> {
    const safePath = sanitizeStoragePath(path);
    const dir = safePath.split("/").slice(0, -1).join("/");
    const name = safePath.split("/").at(-1)!;
    const { data, error } = await supabase()
      .storage.from(this.bucket)
      .list(dir, { limit: 1, search: name });
    if (error) return false;
    return (data ?? []).some((f) => f.name === name);
  }

  publicUrl(path: string): string {
    return supabase().storage.from(this.bucket).getPublicUrl(sanitizeStoragePath(path)).data
      .publicUrl;
  }
}

/* -------------------------------------------------------------------- memory */

/** In-memory opslag voor unit tests — zelfde semantiek als de Supabase-variant. */
export class MemoryMarketingStorage implements MarketingStorage {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const safePath = sanitizeStoragePath(path);
    // Idempotent, eerste schrijf wint (content-addressed paden).
    if (!this.objects.has(safePath)) {
      this.objects.set(safePath, { bytes: new Uint8Array(bytes), contentType });
    }
    return safePath;
  }

  async exists(path: string): Promise<boolean> {
    return this.objects.has(sanitizeStoragePath(path));
  }

  publicUrl(path: string): string {
    return `memory://marketing-assets/${sanitizeStoragePath(path)}`;
  }

  /** Testhulp: het opgeslagen object voor een pad. */
  get(path: string): { bytes: Uint8Array; contentType: string } | undefined {
    return this.objects.get(sanitizeStoragePath(path));
  }

  /** Testhulp: aantal opgeslagen objecten. */
  get size(): number {
    return this.objects.size;
  }
}

let defaultStorage: MarketingStorage | null = null;

/** Standaard productie-opslag (singleton), voor gebruik in routes en jobs. */
export function marketingStorage(): MarketingStorage {
  defaultStorage ??= new SupabaseMarketingStorage();
  return defaultStorage;
}
