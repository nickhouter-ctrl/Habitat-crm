import { Download, Search } from "lucide-react";
import Link from "next/link";

import {
  Badge,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { BEURS, ROLLEN, rolLabel } from "@/lib/beurs";
import { haalBeursGesprekken } from "@/lib/beurs-data";
import {
  type BeursRichting,
  type BeursSortering,
  filterBeursContacten,
  sorteerBeursContacten,
  verdichtTotContacten,
} from "@/lib/beurs-lijst";
import { cn } from "@/lib/utils";

export const metadata = { title: "Beurscontacten" };
export const dynamic = "force-dynamic";

const SORTEERBAAR: { key: BeursSortering; label: string }[] = [
  { key: "naam", label: "Naam" },
  { key: "bedrijf", label: "Bedrijf" },
  { key: "soort", label: "Soort" },
  { key: "wanneer", label: "Gesproken" },
];

const INVOER_TABS = [
  { key: "", label: "Alle" },
  { key: "wij", label: "Op de stand ingevoerd" },
  { key: "zelf", label: "Zelf via de QR-code" },
] as const;

export default async function BeursContactenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const rolParam = typeof params.rol === "string" ? params.rol : "";
  const rol = ROLLEN.some((r) => r.key === rolParam) ? rolParam : "";
  const invoerParam = typeof params.invoer === "string" ? params.invoer : "";
  const invoer = (INVOER_TABS.some((t) => t.key === invoerParam) ? invoerParam : "") as "" | "zelf" | "wij";
  const sortParam = typeof params.sort === "string" ? params.sort : "";
  const sort = (SORTEERBAAR.some((s) => s.key === sortParam) ? sortParam : "wanneer") as BeursSortering;
  const dir = (params.dir === "asc" ? "asc" : "desc") as BeursRichting;

  const alles = verdichtTotContacten(await haalBeursGesprekken());
  // Tellingen per soort horen bij wat je nu ziet, dus zonder het rolfilter maar
  // mét het zoekwoord: anders klik je op "Architect (4)" en zie je er twee.
  const zonderRol = filterBeursContacten(alles, { q, invoer });
  const rijen = sorteerBeursContacten(filterBeursContacten(alles, { q, invoer, rol }), sort, dir);

  const perRol = new Map<string, number>();
  for (const r of zonderRol) {
    const k = r.rol ?? "anders";
    perRol.set(k, (perRol.get(k) ?? 0) + 1);
  }

  const vandaag = new Date().toISOString().slice(0, 10);
  const kengetallen = {
    totaal: alles.length,
    vandaag: alles.filter((r) => r.wanneer?.toISOString().slice(0, 10) === vandaag).length,
    metBedrijf: alles.filter((r) => r.bedrijf).length,
    zelf: alles.filter((r) => r.zelfIngevuld).length,
  };

  const href = (next: Partial<{ rol: string; invoer: string; sort: string; dir: string; q: string }>) => {
    const sp = new URLSearchParams();
    const waarden = { q, rol, invoer, sort, dir, ...next };
    if (waarden.q) sp.set("q", waarden.q);
    if (waarden.rol) sp.set("rol", waarden.rol);
    if (waarden.invoer) sp.set("invoer", waarden.invoer);
    if (waarden.sort && waarden.sort !== "wanneer") sp.set("sort", waarden.sort);
    if (waarden.dir === "asc") sp.set("dir", "asc");
    const qs = sp.toString();
    return qs ? `/beurs/contacten?${qs}` : "/beurs/contacten";
  };

  /** Klikken op dezelfde kolom draait de richting om. */
  const sortHref = (key: BeursSortering) =>
    href({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" });

  const tabClass = (actief: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm transition-colors",
      actief ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground",
    );

  return (
    <>
      <PageHeader
        title="Beurscontacten"
        subtitle={`${BEURS.naam} · ${BEURS.plaats} · stand ${BEURS.stand}`}
        actions={
          <>
            <LinkButton href="/beurs" variant="secondary">
              Naar de stand
            </LinkButton>
            <LinkButton href={`/beurs/contacten/csv${href({}).replace("/beurs/contacten", "")}`}>
              <Download className="size-4" />
              Download lijst
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Gesproken" value={kengetallen.totaal} hint="hele beurs" />
        <StatTile label="Vandaag" value={kengetallen.vandaag} />
        <StatTile label="Met bedrijf" value={kengetallen.metBedrijf} hint="architect, winkel, aannemer" />
        <StatTile label="Zelf ingevuld" value={kengetallen.zelf} hint="via de QR-code" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            <Link href={href({ rol: "" })} className={tabClass(!rol)}>
              Alle soorten <span className="tabular-nums opacity-60">{zonderRol.length}</span>
            </Link>
            {ROLLEN.filter((r) => perRol.get(r.key)).map((r) => (
              <Link key={r.key} href={href({ rol: r.key })} className={tabClass(rol === r.key)}>
                {r.nl} <span className="tabular-nums opacity-60">{perRol.get(r.key)}</span>
              </Link>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <div className="flex flex-wrap gap-1">
            {INVOER_TABS.map((t) => (
              <Link key={t.key || "alle"} href={href({ invoer: t.key })} className={tabClass(invoer === t.key)}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
        <form className="relative" action="/beurs/contacten">
          {rol && <input type="hidden" name="rol" value={rol} />}
          {invoer && <input type="hidden" name="invoer" value={invoer} />}
          {sort !== "wanneer" && <input type="hidden" name="sort" value={sort} />}
          {dir === "asc" && <input type="hidden" name="dir" value="asc" />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Zoek op naam, bedrijf of wens…" className="w-72 pl-8" />
        </form>
      </div>

      {rijen.length === 0 ? (
        <EmptyState
          title={q || rol || invoer ? "Niemand gevonden" : "Nog niemand vastgelegd"}
          description={
            q || rol || invoer
              ? "Pas je zoekopdracht of filter aan."
              : "Zodra er iemand op de stand wordt ingevoerd of de QR-code invult, staat hij hier."
          }
        />
      ) : (
        <Table wrapperClassName="max-h-[70vh] overflow-y-auto rounded-lg border">
          <THead className="sticky top-0 z-10 bg-surface">
            <tr>
              {SORTEERBAAR.map((s) => (
                <Th key={s.key}>
                  <Link href={sortHref(s.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {s.label}
                    <span className={cn("text-[0.7em]", sort === s.key ? "opacity-100" : "opacity-0")} aria-hidden>
                      {dir === "asc" ? "▲" : "▼"}
                    </span>
                  </Link>
                </Th>
              ))}
              <Th>Contact</Th>
              <Th>Waar het over ging</Th>
            </tr>
          </THead>
          <TBody>
            {rijen.map((r) => (
              <Tr key={r.aanvraagId}>
                <Td>
                  {r.contactId ? (
                    <Link href={`/contacts/${r.contactId}`} className="font-medium text-accent hover:underline">
                      {r.naam}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.naam}</span>
                  )}
                  {r.gesprekken > 1 && (
                    <span className="ml-2 text-xs text-muted">{r.gesprekken}× gesproken</span>
                  )}
                </Td>
                <Td className="text-muted">{r.bedrijf || "—"}</Td>
                <Td className="space-x-1 whitespace-nowrap">
                  <Badge tone="neutral">{rolLabel(r.rol ?? "anders")}</Badge>
                  {r.zelfIngevuld && <Badge tone="accent">QR</Badge>}
                </Td>
                <Td className="whitespace-nowrap text-muted">
                  {r.wanneer?.toLocaleString("nl-NL", {
                    timeZone: "Europe/Madrid",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Td>
                <Td className="text-muted">
                  <a href={`mailto:${r.email}`} className="block hover:text-foreground hover:underline">
                    {r.email}
                  </a>
                  {r.telefoon ? (
                    <a href={`tel:${r.telefoon.replace(/\s+/g, "")}`} className="block text-xs hover:text-foreground hover:underline">
                      {r.telefoon}
                    </a>
                  ) : null}
                </Td>
                <Td className="max-w-md text-muted">
                  <span className="line-clamp-2 whitespace-pre-line text-xs">{r.wens || "—"}</span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
