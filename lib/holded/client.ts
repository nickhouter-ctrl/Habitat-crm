/**
 * Minimal typed Holded API client.
 *
 * Auth: every request carries a `key: <HOLDED_API_KEY>` header.
 * Base: https://api.holded.com/api  (override with HOLDED_API_BASE)
 *
 * Docs: https://developers.holded.com/
 */
import type {
  HoldedContact,
  HoldedDocType,
  HoldedDocument,
  HoldedProduct,
} from "./types";

const BASE = (process.env.HOLDED_API_BASE ?? "https://api.holded.com/api").replace(
  /\/$/,
  "",
);

export class HoldedError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "HoldedError";
  }
}

function apiKey(): string {
  const key = process.env.HOLDED_API_KEY;
  if (!key) {
    throw new Error("HOLDED_API_KEY is not set (see .env.example)");
  }
  return key;
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Query;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const hasBody = init.body !== undefined;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      key: apiKey(),
      accept: "application/json",
      ...(hasBody ? { "content-type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
    // Holded data is mutable — never serve a cached response.
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new HoldedError(
      res.status,
      data,
      `Holded ${init.method ?? "GET"} ${path} → ${res.status}`,
    );
  }
  return data as T;
}

/** A Holded "write" response: `{ status: 1, info: "...", id: "..." }`. */
export interface HoldedWriteResult {
  status?: number;
  info?: string;
  id?: string;
  [key: string]: unknown;
}

export const holded = {
  /** Low-level escape hatch for endpoints not wrapped below. */
  request,

  contacts: {
    list: (query?: Query) =>
      request<HoldedContact[]>("/invoicing/v1/contacts", { query }),
    get: (id: string) =>
      request<HoldedContact>(`/invoicing/v1/contacts/${id}`),
    create: (body: Partial<HoldedContact>) =>
      request<HoldedWriteResult>("/invoicing/v1/contacts", {
        method: "POST",
        body,
      }),
    update: (id: string, body: Partial<HoldedContact>) =>
      request<HoldedWriteResult>(`/invoicing/v1/contacts/${id}`, {
        method: "PUT",
        body,
      }),
  },

  documents: {
    list: (docType: HoldedDocType, query?: Query) =>
      request<HoldedDocument[]>(`/invoicing/v1/documents/${docType}`, { query }),
    get: (docType: HoldedDocType, id: string) =>
      request<HoldedDocument>(`/invoicing/v1/documents/${docType}/${id}`),
    create: (docType: HoldedDocType, body: Record<string, unknown>) =>
      request<HoldedWriteResult>(`/invoicing/v1/documents/${docType}`, {
        method: "POST",
        body,
      }),
  },

  products: {
    list: (query?: Query) =>
      request<HoldedProduct[]>("/invoicing/v1/products", { query }),
    get: (id: string) =>
      request<HoldedProduct>(`/invoicing/v1/products/${id}`),
  },
};

/** Fetch all pages of a paginated list endpoint (Holded uses `?page=N`). */
export async function holdedListAll<T>(
  fetchPage: (page: number) => Promise<T[]>,
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchPage(page);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break; // last (partial) page — heuristic
  }
  return all;
}

export type HoldedClient = typeof holded;
