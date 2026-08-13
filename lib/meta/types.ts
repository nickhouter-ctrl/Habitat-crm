/**
 * Typen voor de Meta Marketing API (Graph API) — alleen de velden die de
 * publicatieketen en de statussync daadwerkelijk gebruiken (brief §7).
 */

/** Foutenvelop zoals Meta die teruggeeft: `{ "error": { ... } }`. */
export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    /** Titel voor eindgebruikers, door Meta zelf gelokaliseerd. */
    error_user_title?: string;
    /** Uitleg voor eindgebruikers — verkiezen boven de technische message. */
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/**
 * Eén metriekblok uit de `X-Business-Use-Case-Usage`-header. Waarden zijn
 * percentages (0–100+); boven de 100 weigert Meta calls tot het venster leegt.
 */
export interface BucUsageEntry {
  type?: string;
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
  /** Minuten tot Meta weer calls toelaat — alleen aanwezig bij een block. */
  estimated_time_to_regain_access?: number;
}

/** Samenvatting van de BUC-header: hoogste benutting + evt. hersteltijd. */
export interface BucUsage {
  /** Hoogste benutting (%) over alle accounts en metrics in de header. */
  pct: number;
  /** Minuten tot herstel, als Meta die meldt. */
  regainMinutes?: number;
}

/** Antwoord van POST /act_<id>/adimages met een `bytes`-upload. */
export interface AdImagesResponse {
  images?: Record<string, { hash?: string; url?: string }>;
}

/** Antwoord van POST /act_<id>/adcreatives. */
export interface AdCreativeResponse {
  id?: string;
}

/** Antwoord van POST /act_<id>/ads. */
export interface AdResponse {
  id?: string;
}

/**
 * De statusvelden die de sync per object ophaalt. `ad_review_feedback` bestaat
 * alleen op ads; afkeuringen tonen we prominent in de CRM-lijst.
 */
export interface MetaStatusFields {
  id?: string;
  effective_status?: string;
  ad_review_feedback?: {
    global?: Record<string, string>;
    placement_specific?: Record<string, unknown>;
  };
}

/** De `object_story_spec` voor een link-ad met beeld (brief §7). */
export interface ObjectStorySpec {
  page_id: string;
  instagram_user_id?: string;
  link_data: {
    image_hash: string;
    message: string;
    link: string;
    call_to_action: { type: string; value: { link: string } };
  };
}
