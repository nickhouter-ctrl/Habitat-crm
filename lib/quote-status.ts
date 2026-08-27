import { sql } from "drizzle-orm";

import { documents } from "@/lib/db/schema";

/**
 * Is er uit deze offerte al een factuur gemaakt?
 *
 * Het dashboard telde iedere geaccepteerde offerte als "klaar om te factureren",
 * ook als de factuur er allang was — vier stuks, waarvan er twee al gefactureerd
 * waren. Een taak die niet verdwijnt als je hem doet, leer je negeren.
 *
 * De koppeling loopt via `source_document_id`, die bij het factureren wordt
 * gezet. Bewust NIET op "er staat een factuur op hetzelfde project": op een werf
 * lopen meer facturen dan die ene offerte, en dan zou de taak verdwijnen zonder
 * dat er iets gefactureerd is.
 *
 * Een voorschot telt niet mee: daarna moet de eindfactuur nog komen. Een
 * vervallen (`void`) factuur ook niet — die is ingetrokken.
 */
export const OFFERTE_AL_GEFACTUREERD = sql`exists (
  select 1 from ${documents} f
  where f.source_document_id = ${documents.id}
    and f.kind = 'invoice'
    and f.status <> 'void'
    and coalesce(f.is_advance, false) = false
)`;

/** Geaccepteerd én nog niet gefactureerd — dít is de taak die overblijft. */
export const OFFERTE_TE_FACTUREREN = sql`${documents.kind} = 'estimate'
  and ${documents.status} = 'accepted'
  and not ${OFFERTE_AL_GEFACTUREERD}`;
