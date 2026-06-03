/**
 * Gedeelde laad-skeleton voor de hele authenticated app. Next.js toont dit
 * direct als Suspense-fallback zodra je op een link klikt, terwijl de echte
 * (force-dynamic) pagina op de server rendert. Zonder dit bestand blijft het
 * scherm op de vorige pagina "hangen" tot de render klaar is — dat voelt traag.
 */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border/60 ${className}`} />;
}

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Laden…">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-4 w-72" />
        </div>
        <Bar className="h-9 w-32" />
      </div>

      {/* Stat-tegels */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <Bar className="h-3 w-20" />
            <Bar className="mt-3 h-6 w-24" />
          </div>
        ))}
      </div>

      {/* Inhoudsblokken */}
      <div className="mt-6 space-y-3">
        <div className="rounded-lg border border-border bg-surface p-5">
          <Bar className="h-4 w-40" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bar key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
