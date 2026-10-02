const LABELS: Record<string, string> = {
  website: 'Website',
  referral: 'Doorverwijzing',
  'walk-in': 'Showroom',
  holded: 'Holded',
  manual: 'Handmatig',
  crm: 'CRM',
  email: 'E-mail',
  phone: 'Telefoon',
  import: 'Import',
};

export function isFairSource(source: string | null | undefined): boolean {
  return /^beurs(?::|$)|^website:feria/i.test(source?.trim() ?? '');
}

export function isFairContact(contact: { source?: string | null; tags?: string[] | null }): boolean {
  return isFairSource(contact.source) || (contact.tags ?? []).some(isFairSource);
}

/** Show only the recorded origin; a registration date is not a meeting date. */
export function followupSource(source: string | null | undefined) {
  if (!source?.trim()) return { key: 'unknown', label: 'Niet vastgelegd' };
  const value = source.trim();
  if (isFairSource(value)) {
    return { key: 'beurs', label: value === 'beurs:360-cevisama-2026' ? 'Beurs · 360 by Cevisama' : 'Beurs' };
  }
  return { key: /^website(?::|$)/i.test(value) ? 'website' : 'other', label: LABELS[value] ?? (/^website(?::|$)/i.test(value) ? 'Website' : value) };
}

export function followupSources(source: string | null | undefined, requestSources: string[] = []) {
  const recorded = [source, ...requestSources].filter((s): s is string => !!s?.trim());
  const origins = recorded.map(followupSource);
  return origins.length ? [...new Map(origins.map(o => [o.label, o])).values()] : [followupSource(null)];
}
