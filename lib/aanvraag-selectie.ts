import 'server-only';
import { sql } from 'drizzle-orm';
import { quoteRequests } from '@/lib/db/schema';

/** Een beursregistratie is een contact, geen open offerte-aanvraag. */
export function isBeursRegistratie(request: { kind: string; source: string | null }): boolean {
  return request.kind === 'contact' && /^beurs(?::|$)/i.test(request.source?.trim() ?? '');
}

/** Zelfde afbakening voor lijst, tellers en dagelijkse aanvraagtaken. */
export const gewoneAanvragen = sql`not (${quoteRequests.kind} = 'contact' and lower(btrim(coalesce(${quoteRequests.source}, ''))) ~ '^beurs(:|$)')`;
