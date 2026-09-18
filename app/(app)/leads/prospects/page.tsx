/**
 * De prospectlijst, gemaakt voor duizenden rijen.
 *
 * De lijst op /leads laadde 300 rijen zonder paginering en zette dat getal ook
 * als totaal boven de tabel — bij 7.000 bedrijven loog die teller dus, en de
 * pagina werd loodzwaar. Hier: server-side zoeken, filteren en paginering, met
 * het echte totaal apart geteld.
 */
import { and, asc, desc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
import Link from "next/link";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, StatTile, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { prospectImports, prospects } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";

import { deleteProspect } from "../actions";
import { PromoteButtons } from "./promote-buttons";
import { promoteProspect } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospects" };

const PER_PAGINA = 50;

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "info" | "success" | "warning" | "danger" }> = {
  new: { label: "Nieuw", tone: "neutral" },
  emailed: { label: "Gemaild", tone: "info" },
  replied: { label: "Reageerde", tone: "success" },
  bounced: { label: "Bounce", tone: "danger" },
  unsubscribed: { label: "Afgemeld", tone: "warning" },
  converted: { label: "Klant", tone: "success" },
  skipped: { label: "Overgeslagen", tone: "neutral" },
};

const CATEGORIEEN = ["architect", "aannemer", "makelaar", "interieur", "projectontwikkelaar", "hovenier", "overig"];

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const st = sp.st ?? "alle";
  const cat = sp.cat ?? "alle";
  const ef = sp.ef ?? "alle";
  const imp = sp.imp ?? "alle";
  const prov = (sp.prov ?? "").trim();
  const pagina = Math.max(1, Number(sp.p ?? 1) || 1);

  const like = `%${q}%`;
  const where = and(
    q
      ? or(
          ilike(prospects.companyName, like),
          ilike(prospects.email, like),
          ilike(prospects.city, like),
          ilike(prospects.sector, like),
        )
      : undefined,
    st !== "alle" ? eq(prospects.status, st as never) : undefined,
    cat !== "alle" ? eq(prospects.category, cat as never) : undefined,
    ef === "met" ? isNotNull(prospects.email) : ef === "geen" ? isNull(prospects.email) : undefined,
    imp !== "alle" ? (imp === "geen" ? isNull(prospects.importId) : eq(prospects.importId, imp)) : undefined,
    prov ? ilike(prospects.province, `%${prov}%`) : undefined,
  );

  const [rows, totaal, metEmail, batches] = await Promise.all([
    db.query.prospects.findMany({
      where,
      // Tweede sorteersleutel: bij een import van 200 rijen per blok hebben
      // rijen dezelfde createdAt, en dan zouden ze tussen pagina's heen en weer
      // springen zonder een stabiele tiebreak.
      orderBy: [desc(prospects.createdAt), asc(prospects.id)],
      limit: PER_PAGINA + 1,
      offset: (pagina - 1) * PER_PAGINA,
    }),
    db.$count(prospects, where),
    db.$count(prospects, and(where, isNotNull(prospects.email))),
    db.query.prospectImports.findMany({ orderBy: desc(prospectImports.createdAt), limit: 30, columns: { id: true, label: true } }),
  ]);

  const heeftVolgende = rows.length > PER_PAGINA;
  const zichtbaar = rows.slice(0, PER_PAGINA);
  const van = totaal === 0 ? 0 : (pagina - 1) * PER_PAGINA + 1;
  const tot = (pagina - 1) * PER_PAGINA + zichtbaar.length;

  /** Link met de huidige filters, en één ding anders. */
  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, st, cat, ef, imp, prov, p: pagina, ...patch })) {
      if (v !== undefined && v !== "" && v !== "alle" && !(k === "p" && v === 1)) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/leads/prospects?${s}` : "/leads/prospects";
  };

  return (
    <>
      <PageHeader
        title="Prospects"
        subtitle="Bedrijven om te benaderen — apart van je contactenlijst"
        actions={
          <div className="flex items-center gap-3">
            <Link href="/leads/import" className="text-sm underline">
              Lijst importeren
            </Link>
            <Link href="/leads" className="text-sm underline">
              Campagnes
            </Link>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In deze selectie" value={String(totaal)} />
        <StatTile label="Met e-mail" value={String(metEmail)} hint="mailbaar" tone={metEmail > 0 ? "info" : "neutral"} />
        <StatTile label="Zonder e-mail" value={String(totaal - metEmail)} hint="alleen telefonisch" />
        <StatTile label="Pagina" value={`${pagina}`} hint={`${van}–${tot} van ${totaal}`} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Lijst</CardTitle>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder="Zoek op naam, e-mail, plaats of branche" className="h-8 w-64 text-sm" />
            <Input name="prov" defaultValue={prov} placeholder="Provincie" className="h-8 w-32 text-sm" />
            <Select name="st" defaultValue={st} className="h-8 text-sm">
              <option value="alle">Alle statussen</option>
              {Object.entries(STATUS).map(([v, s]) => (
                <option key={v} value={v}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select name="cat" defaultValue={cat} className="h-8 text-sm">
              <option value="alle">Alle categorieën</option>
              {CATEGORIEEN.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select name="ef" defaultValue={ef} className="h-8 text-sm">
              <option value="alle">Met en zonder e-mail</option>
              <option value="met">Met e-mail</option>
              <option value="geen">Zonder e-mail</option>
            </Select>
            <Select name="imp" defaultValue={imp} className="h-8 text-sm">
              <option value="alle">Alle herkomsten</option>
              <option value="geen">Niet geïmporteerd</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
          </form>
        </CardHeader>

        {zichtbaar.length === 0 ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-muted">
              Geen prospects in deze selectie.{" "}
              <Link href="/leads/import" className="underline">
                Importeer een lijst
              </Link>{" "}
              of pas de filters aan.
            </p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Bedrijf</Th>
                <Th>E-mail</Th>
                <Th>Plaats</Th>
                <Th>Branche</Th>
                <Th>Status</Th>
                <Th>Laatst gemaild</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {zichtbaar.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span className="font-medium">{r.companyName}</span>
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noreferrer" className="block text-xs text-accent hover:underline">
                        {r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <span className="block text-xs text-muted">{r.tags.join(" · ")}</span>
                    )}
                  </Td>
                  <Td>{r.email ?? <span className="text-xs text-muted">geen e-mail</span>}</Td>
                  <Td className="text-muted">{[r.postalCode, r.city].filter(Boolean).join(" ") || "—"}</Td>
                  <Td className="text-muted">{r.sector ?? r.category}</Td>
                  <Td>
                    <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                  </Td>
                  <Td className="text-muted">{r.lastEmailedAt ? formatDate(r.lastEmailedAt) : "—"}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {r.contactId ? (
                      <Link href={`/contacts/${r.contactId}`} className="text-xs text-accent hover:underline">
                        Contact openen
                      </Link>
                    ) : (
                      <PromoteButtons id={r.id} naam={r.companyName} action={promoteProspect} />
                    )}
                    <form action={deleteProspect.bind(null, r.id)} className="mt-1">
                      <button type="submit" className="text-xs text-muted hover:text-danger hover:underline">
                        Verwijderen
                      </button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}

        {(pagina > 1 || heeftVolgende) && (
          <CardContent className="flex items-center justify-between border-t bg-background/50">
            <span className="text-xs text-muted">
              {van}–{tot} van {totaal}
            </span>
            <div className="flex gap-2">
              {pagina > 1 && (
                <Link href={href({ p: pagina - 1 })} className="rounded-md border px-3 py-1.5 text-sm hover:border-accent">
                  ← Vorige
                </Link>
              )}
              {heeftVolgende && (
                <Link href={href({ p: pagina + 1 })} className="rounded-md border px-3 py-1.5 text-sm hover:border-accent">
                  Volgende →
                </Link>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </>
  );
}
