import { sql, type AnyColumn } from "drizzle-orm";
/** Postgres defaults include microseconds; JS Dates and form tokens keep only
 * milliseconds. Compare with the same precision without weakening the status claim. */
export const draftVersionMatches=(column:AnyColumn,seen:string)=>sql`date_trunc('milliseconds',${column}) = ${seen}::timestamptz`;
