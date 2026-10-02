import { z } from 'zod';

export const FOLLOWUP_DONE = 'Opvolging afgehandeld';
export const FOLLOWUP_REOPENED = 'Opvolging heropend';
export const followupCheckInput = z.object({
  contactId: z.string().uuid(),
  expectedEventId: z.union([z.string().uuid(), z.literal('')]),
  completed: z.enum(['on', 'off']),
});

export type FollowupCompletion = { id: string; subject: string | null; createdAt: Date };
export function followupCompleted(event: FollowupCompletion | undefined, incoming: Date | null, nextActionOn: string | null | undefined, today: string) {
  if (event?.subject !== FOLLOWUP_DONE) return false;
  if (incoming && incoming > event.createdAt) return false;
  const completedOn = event.createdAt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  return !(nextActionOn && nextActionOn > completedOn && nextActionOn <= today);
}

export const FOLLOWUP_SORTS = {
  priority: 'Prioriteit', name: 'Naam', company: 'Bedrijf', next: 'Opvolgdatum', last: 'Laatste persoonlijke mail',
} as const;
export type FollowupSort = keyof typeof FOLLOWUP_SORTS;
export type FollowupWorkRow = {
  contact: { id: string; name: string }; company: string | null; completed: boolean;
  state: string; due: boolean; out?: Date | string | null; profile: { nextActionOn: string | null } | null;
};
export function sortFollowup<T extends FollowupWorkRow>(rows: T[], sort: FollowupSort, descending: boolean) {
  const priority = (r: T) => r.completed ? 4 : r.state === 'Antwoord nodig' ? 0 : r.due ? 1 : !r.out ? 2 : 3;
  const dates = (a: string | Date | null | undefined, b: string | Date | null | undefined) => {
    if (!a || !b) return !a && !b ? 0 : !a ? 1 : -1; // Onbekende datums blijven onderaan.
    return (+new Date(a) - +new Date(b)) * (descending ? -1 : 1);
  };
  return [...rows].sort((a, b) => {
    let compared = 0;
    if (sort === 'next') compared = dates(a.profile?.nextActionOn, b.profile?.nextActionOn);
    else if (sort === 'last') compared = dates(a.out, b.out);
    else {
      compared = sort === 'priority' ? priority(a) - priority(b) :
        (sort === 'company' ? a.company ?? a.contact.name : a.contact.name).localeCompare(sort === 'company' ? b.company ?? b.contact.name : b.contact.name, 'nl', { sensitivity: 'base' });
      if (descending) compared *= -1;
    }
    return compared || a.contact.name.localeCompare(b.contact.name, 'nl', { sensitivity: 'base' }) || a.contact.id.localeCompare(b.contact.id);
  });
}
