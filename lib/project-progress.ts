/** Recorded phase progress; budget values weight phases when available. */
export function projectProgress(
  phases: { name: string; progressPct: number }[],
  budget: { phase: string | null; amountEur: string | number | null }[],
) {
  const byName = new Map(phases.map(p => [p.name, Math.min(100, Math.max(0, p.progressPct))]));
  for (const line of budget) {
    const name = line.phase?.trim();
    if (name && !byName.has(name)) byName.set(name, 0);
  }
  const items = [...byName].map(([name, percent]) => ({ name, percent,
    weight: budget.filter(b => b.phase?.trim() === name).reduce((s, b) => s + Math.max(0, Number(b.amountEur) || 0), 0),
  }));
  const totalWeight = items.reduce((s, p) => s + p.weight, 0);
  return {
    percent: items.length ? Math.round(totalWeight > 0
      ? items.reduce((s, p) => s + p.percent * p.weight, 0) / totalWeight
      : items.reduce((s, p) => s + p.percent, 0) / items.length) : null,
    completed: items.filter(p => p.percent === 100).length,
    total: items.length,
    weighted: totalWeight > 0,
    current: items.find(p => p.percent > 0 && p.percent < 100)?.name ?? items.find(p => p.percent < 100)?.name ?? null,
  };
}
