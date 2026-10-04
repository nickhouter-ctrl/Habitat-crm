import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { partnerMessages } from '../db/schema';
import { draftVersionMatches } from '../draft-version';
it('compares legacy microsecond timestamps with the millisecond form token using bound parameters',()=>{
 const at='2026-10-04T15:49:06.252Z',query=new PgDialect({casing:'snake_case'}).sqlToQuery(draftVersionMatches(partnerMessages.updatedAt,at));
 expect(query.sql).toContain("date_trunc('milliseconds'");expect(query.params).toEqual([at]);expect(query.sql).not.toContain(at);
});
