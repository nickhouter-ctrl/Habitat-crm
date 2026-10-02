import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { activities } from '@/lib/db/schema';
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from '@/lib/followup-checklist';

export const followupCompletionFilter = and(eq(activities.type, 'note'), inArray(activities.subject, [FOLLOWUP_DONE, FOLLOWUP_REOPENED]));
export async function latestFollowupCompletions(contactIds: string[]) {
  if (!contactIds.length) return [];
  return db.selectDistinctOn([activities.contactId], {
    contactId: activities.contactId, id: activities.id, subject: activities.subject, createdAt: activities.createdAt,
  }).from(activities).where(and(inArray(activities.contactId, contactIds), followupCompletionFilter))
    .orderBy(activities.contactId, desc(activities.createdAt), desc(activities.id));
}
