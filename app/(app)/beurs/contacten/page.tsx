import { Download, Search } from "lucide-react";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { BEURS, INTERESSES, ROLLEN, interesseLabel, rolOmschrijving } from "@/lib/beurs";
import { haalBeursGesprekken } from "@/lib/beurs-data";
import {
  type BeursRichting,
  type BeursSortering,
  filterBeursContacten,
  sorteerBeursContacten,
  verdichtTotContacten,
} from "@/lib/beurs-lijst";
import { datumTaal, huidigeTaal, tekst } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { bereikVoor, perPlaats, speldjes } from "@/lib/beurs-kaart";
import { plaatsLabel } from "@/lib/plaats";
import { verwijderBeursInvoer } from "./actions";
import { BeursKaart } from "./kaart";
import { VerwijderKnop } from "./verwijder-knop";

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
  const [params, t, taal, datumLocale] = await Promise.all([searchParams, tekst(), huidigeTaal(), datumTaal()]);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const rolParam = typeof params.rol === "string" ? params.rol : "";
  const rol = ROLLEN.some((r) => r.key === rolParam) ? rolParam : "";
  const invoerParam = typeof params.invoer === "string" ? params.invoer : "";
  const invoer = (INVOER_TABS.some((tab) => tab.key === invoerParam) ? invoerParam : "") as "" | "zelf" | "wij";
  const wilParam = typeof params.wil === "string" ? params.wil : "";
  const wil = INTERESSES.some((i) => i.key === wilParam) ? wilParam : "";
  const sortParam = typeof params.sort === "string" ? params.sort : "";
  const sort = (SORTEERBAAR.some((s) => s.key === sortParam) ? sortParam : "wanneer") as BeursSortering;
  const dir = (params.dir === "asc" ? "asc" : "desc") as BeursRichting;

  const alles = verdichtTotContacten(await haalBeursGesprekken());
  // Tellingen per soort horen bij wat je nu ziet, dus zonder het rolfilter maar
  // mét het zoekwoord: anders klik je op "Architect (4)" en zie je er twee.
  const zonderRol = filterBeursContacten(alles, { q, invoer, wil });
  const rijen = sorteerBeursContacten(filterBeursContacten(alles, { q, invoer, rol, wil }), sort, dir);

  // Hoeveel mensen vroegen om stalen, om prijzen…? Dat is ná de beurs de lijst
  // waar je mee aan de slag gaat.
  const perWens = new Map<string, number>();
  for (const r of filterBeursContacten(alles, { q, invoer, rol })) {
    for (const k of r.interesses) perWens.set(k, (perWens.get(k) ?? 0) + 1);
  }

  const perRol = new Map<string, number>();
  for (const r of zonderRol) {
    const k = r.rol ?? "anders";
    perRol.set(k, (perRol.get(k) ?? 0) + 1);
  }

  // De kaart hoort bij wat je op het scherm hebt staan: filter je op
  // architecten, dan zie je waar de architecten zitten.
  const spelden = speldjes(rijen, taal);
  const bereik = bereikVoor(spelden);
  const steden = perPlaats(rijen, taal).slice(0, 8);
  const zonderPlaats = rijen.filter((r) => !r.plaats?.trim()).length;

  const vandaag = new Date().toISOString().slice(0, 10);
  const kengetallen = {
    totaal: alles.length,
    vandaag: alles.filter((r) => r.wanneer?.toISOString().slice(0, 10) === vandaag).length,
    metBedrijf: alles.filter((r) => r.bedrijf).length,
    zelf: alles.filter((r) => r.zelfIngevuld).length,
  };

  const href = (next: Partial<{ rol: string; invoer: string; sort: string; dir: string; q: string; wil: string }>) => {
    const sp = new URLSearchParams();
    const waarden = { q, rol, invoer, sort, dir, wil, ...next };
    if (waarden.q) sp.set("q", waarden.q);
    if (waarden.rol) sp.set("rol", waarden.rol);
    if (waarden.invoer) sp.set("invoer", waarden.invoer);
    if (waarden.wil) sp.set("wil", waarden.wil);
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
        title={t("Beurscontacten")}
        subtitle={`${BEURS.naam} · ${BEURS.plaats} · ${t("stand {nr}|standnummer", { nr: BEURS.stand })}`}
        actions={
          <>
            <LinkButton href="/beurs" variant="secondary">
              {t("Naar de stand")}
            </LinkButton>
            <LinkButton href={`/beurs/contacten/csv${href({}).replace("/beurs/contacten", "")}`}>
              <Download className="size-4" />
              {t("Download lijst")}
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("Gesproken")} value={kengetallen.totaal} hint={t("hele beurs")} />
        <StatTile label={t("Vandaag")} value={kengetallen.vandaag} />
        <StatTile label={t("Met bedrijf")} value={kengetallen.metBedrijf} hint={t("architect, winkel, aannemer")} />
        <StatTile label={t("Zelf ingevuld")} value={kengetallen.zelf} hint={t("via de QR-code")} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            <Link href={href({ rol: "" })} className={tabClass(!rol)}>
              {t("Alle soorten")} <span className="tabular-nums opacity-60">{zonderRol.length}</span>
            </Link>
            {ROLLEN.filter((r) => perRol.get(r.key)).map((r) => (
              <Link key={r.key} href={href({ rol: r.key })} className={tabClass(rol === r.key)}>
                {r[taal]} <span className="tabular-nums opacity-60">{perRol.get(r.key)}</span>
              </Link>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <div className="flex flex-wrap gap-1">
            {INVOER_TABS.map((tab) => (
              <Link key={tab.key || "alle"} href={href({ invoer: tab.key })} className={tabClass(invoer === tab.key)}>
                {t(tab.label)}
              </Link>
            ))}
          </div>
        </div>
        <form className="relative" action="/beurs/contacten">
          {rol && <input type="hidden" name="rol" value={rol} />}
          {invoer && <input type="hidden" name="invoer" value={invoer} />}
          {wil && <input type="hidden" name="wil" value={wil} />}
          {sort !== "wanneer" && <input type="hidden" name="sort" value={sort} />}
          {dir === "asc" && <input type="hidden" name="dir" value="asc" />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder={t("Zoek op naam, bedrijf of wens…")} className="w-72 pl-8" />
        </form>
      </div>

      {/* Na de beurs werk je per wens: eerst iedereen die stalen wilde, dan de
          prijsaanvragen. Vandaar een eigen rij knoppen met de aantallen erbij. */}
      {perWens.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t("Vroeg om")}:</span>
          <Link href={href({ wil: "" })} className={tabClass(!wil)}>
            {t("Alles")}
          </Link>
          {INTERESSES.filter((i) => perWens.get(i.key)).map((i) => (
            <Link key={i.key} href={href({ wil: i.key })} className={tabClass(wil === i.key)}>
              {interesseLabel(i.key, taal)} <span className="tabular-nums opacity-60">{perWens.get(i.key)}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Waar ze zitten. Na de beurs bepaalt dat de route: drie architecten in
          Alicante is een middag, één in Hamburg een telefoontje. */}
      {bereik && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>{t("Waar ze zitten")}</CardTitle>
            <span className="text-xs text-muted">
              {t("{n} met een plaats", { n: rijen.length - zonderPlaats })}
              {zonderPlaats > 0 ? ` · ${t("{n} zonder", { n: zonderPlaats })}` : ""}
            </span>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <BeursKaart spelden={spelden} bereik={bereik} />
            <ul className="space-y-1 text-sm lg:border-l lg:pl-5">
              {steden.map((s) => (
                <li key={s.plaats} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-muted">{s.plaats}</span>
                  <span className="tabular-nums font-medium">{s.aantal}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {rijen.length === 0 ? (
        <EmptyState
          title={q || rol || invoer ? t("Niemand gevonden") : t("Nog niemand vastgelegd")}
          description={
            q || rol || invoer
              ? t("Pas je zoekopdracht of filter aan.")
              : t("Zodra er iemand op de stand wordt ingevoerd of de QR-code invult, staat hij hier.")
          }
        />
      ) : (
        <Table wrapperClassName="max-h-[70vh] overflow-y-auto rounded-lg border">
          <THead className="sticky top-0 z-10 bg-surface">
            <tr>
              {SORTEERBAAR.map((s) => (
                <Th key={s.key}>
                  <Link href={sortHref(s.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {t(s.label)}
                    <span className={cn("text-[0.7em]", sort === s.key ? "opacity-100" : "opacity-0")} aria-hidden>
                      {dir === "asc" ? "▲" : "▼"}
                    </span>
                  </Link>
                </Th>
              ))}
              <Th>{t("Contact")}</Th>
              <Th>{t("Waar")}</Th>
              <Th>{t("Vroeg om")}</Th>
              <Th>{t("Waar het over ging")}</Th>
              {/* De tabel is breder dan het scherm; deze kolom moet altijd in
                  beeld blijven, anders scroll je naar een knop die je niet ziet. */}
              <Th className="sticky right-0 z-20 w-px bg-surface" aria-label={t("Verwijderen")} />
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
                    <span className="ml-2 text-xs text-muted">{t("{n}× gesproken", { n: r.gesprekken })}</span>
                  )}
                </Td>
                <Td className="text-muted">{r.bedrijf || "—"}</Td>
                <Td className="space-x-1 whitespace-nowrap">
                  <Badge tone="neutral">{rolOmschrijving(r.rol ?? "anders", r.rolAnders, taal)}</Badge>
                  {r.zelfIngevuld && <Badge tone="accent">QR</Badge>}
                </Td>
                <Td className="whitespace-nowrap text-muted">
                  {r.wanneer?.toLocaleString(datumLocale, {
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
                <Td className="whitespace-nowrap text-muted">
                  {plaatsLabel(r.plaats, r.land, taal) || "—"}
                </Td>
                <Td className="space-y-1 whitespace-nowrap">
                  {r.interesses.length === 0
                    ? "—"
                    : r.interesses.map((k) => (
                        <Badge key={k} tone="neutral">
                          {interesseLabel(k, taal)}
                        </Badge>
                      ))}
                </Td>
                <Td className="max-w-md text-muted">
                  <span className="line-clamp-2 whitespace-pre-line text-xs">{r.wens || "—"}</span>
                </Td>
                <Td className="sticky right-0 z-10 bg-surface text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                  <VerwijderKnop
                    contactId={r.contactId}
                    email={r.email}
                    naam={r.naam}
                    verwijder={verwijderBeursInvoer}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
