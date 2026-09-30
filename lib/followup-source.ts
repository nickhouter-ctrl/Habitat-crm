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

/** Show only the recorded origin; a registration date is not a meeting date. */
export function followupSource(source: string | null | undefined) {
  if (!source?.trim()) return { key: 'unknown', label: 'Niet vastgelegd' };
  const value = source.trim();
  if (/^beurs(?::|$)/i.test(value)) {
    return { key: 'beurs', label: value === 'beurs:360-cevisama-2026' ? 'Beurs · 360 by Cevisama' : 'Beurs' };
  }
  return { key: value === 'website' ? 'website' : 'other', label: LABELS[value] ?? value };
}

export function followupSources(source: string | null | undefined, requestSources: string[] = []) {
  const recorded = [source, ...requestSources].filter((s): s is string => !!s?.trim());
  const origins = recorded.map(followupSource);
  return origins.length ? [...new Map(origins.map(o => [o.label, o])).values()] : [followupSource(null)];
}
