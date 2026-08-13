/**
 * Minimal typed Meta Marketing API client (Graph API), gespiegeld aan
 * lib/holded/client.ts.
 *
 * Auth: systeemgebruiker-token uit Business Manager, ALLEEN via de
 * omgevingsvariabele META_ACCESS_TOKEN (nooit in de database of een client
 * component — brief §7/§9). Meegestuurd als `Authorization: Bearer`-header
 * zodat het token nooit in URL's of logs belandt.
 *
 * Foutafhandeling (brief §7):
 *  - `X-Business-Use-Case-Usage` wordt bij elk antwoord gelezen; boven de 80%
 *    benutting remt de client zichzelf af vóór de volgende call.
 *  - Foutcode 17 (rate limit) wordt met exponentiële backoff opnieuw
 *    geprobeerd via {@link withMetaRetry}.
 *  - Elke andere fout wordt een {@link MetaError}; vertaal die voor de UI met
 *    {@link metaErrorMessage} — geen ruwe API-codes zonder uitleg.
 */
import type {
  AdCreativeResponse,
  AdImagesResponse,
  AdResponse,
  BucUsage,
  BucUsageEntry,
  MetaErrorBody,
  MetaStatusFields,
} from "./types";

const GRAPH_BASE = "https://graph.facebook.com";

function graphVersion(): string {
  return process.env.META_GRAPH_VERSION ?? "v23.0";
}

/**
 * Error voor elke non-2xx Graph-API-respons. Draagt HTTP-status, de geparste
 * body én Meta's eigen foutcode/subcode/gebruikersboodschap zodat aanroepers
 * kunnen branchen (code 17 = rate limit, 190 = token ongeldig, …).
 */
export class MetaError extends Error {
  constructor(
    /** HTTP-statuscode van de mislukte respons. */
    public status: number,
    /** Geparste JSON-body indien mogelijk, anders de ruwe tekst. */
    public body: unknown,
    message: string,
    /** Meta's foutcode (bv. 17 = rate limit, 190 = token). */
    public code?: number,
    /** Meta's error_subcode, voor fijnmaziger branchen. */
    public subcode?: number,
    /** Meta's eigen uitleg voor eindgebruikers, als die er is. */
    public userMessage?: string,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

function accessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("META_ACCESS_TOKEN is niet ingesteld (zie .env.example)");
  }
  return token;
}

/** Advertentieaccount-pad, altijd mét `act_`-prefix (env is zonder prefix). */
export function adAccountPath(): string {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) {
    throw new Error("META_AD_ACCOUNT_ID is niet ingesteld (zie .env.example)");
  }
  return `act_${id.replace(/^act_/, "")}`;
}

/* ----------------------------------------------------------- geld & centen */

/**
 * Converteer een euro-bedrag als decimale string (db-`numeric`, punt als
 * decimaalteken) exact naar centen. Stringrekenen — nooit `* 100` op een
 * float (19.90 * 100 === 1989.9999…). Meta verwacht budgetten in centen.
 */
export function eurToCents(eur: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(eur.trim());
  if (!m) {
    throw new Error(`Ongeldig euro-bedrag voor centconversie: "${eur}"`);
  }
  const whole = m[1];
  const frac = (m[2] ?? "").padEnd(2, "0");
  return Number(whole) * 100 + Number(frac);
}

/* ----------------------------------------------- BUC-usage & rate limiting */

/**
 * Parse de `X-Business-Use-Case-Usage`-header:
 * `{"<account>": [{type, call_count, total_cputime, total_time, …}]}`.
 * Geeft de hoogste benutting (%) over alle accounts en metrics terug.
 * Robuust: een kapotte of ontbrekende header telt als 0%.
 */
export function parseBucUsage(header: string | null): BucUsage {
  if (!header) return { pct: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return { pct: 0 };
  }
  let pct = 0;
  let regainMinutes: number | undefined;
  for (const entries of Object.values(parsed as Record<string, BucUsageEntry[]>)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      pct = Math.max(
        pct,
        entry.call_count ?? 0,
        entry.total_cputime ?? 0,
        entry.total_time ?? 0,
      );
      if (typeof entry.estimated_time_to_regain_access === "number") {
        regainMinutes = Math.max(regainMinutes ?? 0, entry.estimated_time_to_regain_access);
      }
    }
  }
  return regainMinutes === undefined ? { pct } : { pct, regainMinutes };
}

/**
 * Zelfrem boven de 80% BUC-benutting (brief §7): lineair oplopend van 0 ms
 * op 80% naar 60 s op 100%, daarboven afgekapt op 60 s.
 */
export function throttleDelayMs(pct: number): number {
  if (pct <= 80) return 0;
  return Math.min(60_000, Math.round(((pct - 80) / 20) * 60_000));
}

/** Exponentiële backoff voor foutcode 17: 1 s, 2 s, 4 s, 8 s, … */
export function backoffDelayMs(attempt: number): number {
  return 1000 * 2 ** attempt;
}

/** Laatst gerapporteerde BUC-benutting — module-state per serverless-instance. */
let lastUsage: BucUsage = { pct: 0 };

/** De meest recente BUC-benutting (voor logging/monitoring in de UI). */
export function currentBucUsage(): BucUsage {
  return lastUsage;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Voer `fn` uit en probeer bij Meta-foutcode 17 (rate limit) opnieuw met
 * exponentiële backoff. Andere fouten gaan direct door. Meldt Meta een
 * hersteltijd (`estimated_time_to_regain_access`), dan wacht de retry
 * minstens zo lang.
 *
 * @param opts.attempts - Maximum aantal pogingen (default 4).
 * @param opts.sleep - Injecteerbaar wachten, voor snelle tests.
 */
export async function withMetaRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof MetaError) || err.code !== 17) throw err;
      lastError = err;
      if (attempt < attempts - 1) {
        const regainMs = (lastUsage.regainMinutes ?? 0) * 60_000;
        await sleep(Math.max(backoffDelayMs(attempt), regainMs));
      }
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------ foutvertaling */

/**
 * Vertaal een (Meta-)fout naar een boodschap die zegt wat er misging en wat
 * de gebruiker nu moet doen (brief §9) — nooit alleen een kale code.
 */
export function metaErrorMessage(err: unknown): string {
  if (err instanceof MetaError) {
    if (err.userMessage) return err.userMessage;
    switch (err.code) {
      case 17:
      case 80004:
        return "Meta-limiet bereikt: te veel API-aanroepen. Wacht een paar minuten en probeer het opnieuw.";
      case 190:
        return "Het Meta-token is verlopen of ongeldig. Vernieuw META_ACCESS_TOKEN in de omgevingsvariabelen (Business Manager → systeemgebruiker → token genereren).";
      case 10:
      case 200:
        return "Het Meta-token mist rechten voor deze actie. Controleer de systeemgebruiker-rechten (ads_management) in Business Manager.";
      case 100:
        return `Meta wees de aanvraag af als ongeldig: ${err.message}. Controleer de ingevulde velden.`;
      default:
        return `Meta-fout: ${err.message}. Controleer de gegevens of probeer het later opnieuw.`;
    }
  }
  return err instanceof Error
    ? `Onverwachte fout: ${err.message}`
    : "Onverwachte fout bij het aanroepen van Meta.";
}

/* --------------------------------------------------------------- transport */

/** Querystring-parameters; `undefined`/`null` entries worden weggelaten. */
type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * Voer één Graph-API-call uit. JSON-body voor schrijfacties; `form` voor
 * endpoints die form-encoding eisen (adimages met base64-`bytes`). Leest bij
 * elk antwoord de BUC-header en remt de vólgende call af boven 80% benutting.
 * Gooit {@link MetaError} bij elke non-2xx status.
 */
async function request<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "DELETE";
    query?: Query;
    body?: unknown;
    /** Form-encoded velden (adimages-`bytes`); sluit `body` uit. */
    form?: Record<string, string>;
    /** Harde timeout in ms — de fetch wordt dan ECHT afgebroken (abort). */
    timeoutMs?: number;
  } = {},
): Promise<T> {
  // Zelfrem vóór de call, op basis van de laatst gemelde benutting (§7).
  const brake = throttleDelayMs(lastUsage.pct);
  if (brake > 0) await defaultSleep(brake);

  const url = new URL(`${GRAPH_BASE}/${graphVersion()}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const hasJsonBody = init.body !== undefined;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${accessToken()}`,
      accept: "application/json",
      ...(hasJsonBody ? { "content-type": "application/json" } : {}),
      ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form
      ? new URLSearchParams(init.form).toString()
      : hasJsonBody
        ? JSON.stringify(init.body)
        : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });

  lastUsage = parseBucUsage(res.headers.get("x-business-use-case-usage"));

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
    const metaErr = (data as MetaErrorBody | null)?.error;
    throw new MetaError(
      res.status,
      data,
      metaErr?.message ?? `Meta ${init.method ?? "GET"} ${path} → ${res.status}`,
      metaErr?.code,
      metaErr?.error_subcode,
      metaErr?.error_user_msg,
    );
  }
  return data as T;
}

/* ------------------------------------------------------------------ client */

/**
 * De Meta-client: dunne, getypte wrappers per resource. Elke methode gooit
 * {@link MetaError} bij een API-fout; retry beslist de aanroeper (via
 * {@link withMetaRetry}).
 */
export const meta = {
  /** Low-level escape hatch voor endpoints zonder wrapper hieronder. */
  request,

  adImages: {
    /**
     * Upload PNG-bytes naar het advertentieaccount; geeft de `image_hash`
     * terug waar de adcreative naar verwijst.
     */
    upload: async (png: Uint8Array): Promise<string> => {
      const res = await request<AdImagesResponse>(`/${adAccountPath()}/adimages`, {
        method: "POST",
        form: { bytes: Buffer.from(png).toString("base64") },
        timeoutMs: 60_000, // uploads mogen langer duren dan een gewone call
      });
      const hash = Object.values(res.images ?? {})[0]?.hash;
      if (!hash) {
        throw new MetaError(200, res, "Meta gaf geen image_hash terug bij adimages-upload");
      }
      return hash;
    },
  },

  adCreatives: {
    /** Maak een adcreative met `object_story_spec`; geeft het creative-id terug. */
    create: (body: Record<string, unknown>) =>
      request<AdCreativeResponse>(`/${adAccountPath()}/adcreatives`, {
        method: "POST",
        body,
      }),
  },

  ads: {
    /** Maak een advertentie — ALTIJD gepauzeerd (brief §3.4). */
    create: (body: Record<string, unknown>) =>
      request<AdResponse>(`/${adAccountPath()}/ads`, {
        method: "POST",
        body: { ...body, status: "PAUSED" },
      }),
  },

  adSets: {
    /** Maak een advertentieset; valideer dagdelen vóóraf (lib/meta/publish.ts). */
    create: (body: Record<string, unknown>) =>
      request<AdResponse>(`/${adAccountPath()}/adsets`, { method: "POST", body }),
  },

  campaigns: {
    /** Maak een campagne. */
    create: (body: Record<string, unknown>) =>
      request<AdResponse>(`/${adAccountPath()}/campaigns`, { method: "POST", body }),
  },

  /**
   * Haal statusvelden voor meerdere object-id's in één call op
   * (`/?ids=…&fields=…`). Max ±50 id's per call — chunken doet de aanroeper.
   */
  statusBatch: (ids: string[], fields: string) =>
    request<Record<string, MetaStatusFields>>(`/`, {
      query: { ids: ids.join(","), fields },
    }),
};

/** Het type van {@link meta}, voor wie de client wil injecteren of mocken. */
export type MetaClient = typeof meta;
