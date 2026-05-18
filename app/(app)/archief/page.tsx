import { and, asc, desc, eq, ilike, like, not, or, sql } from "drizzle-orm";
import { ArrowDown, ArrowUp, FileSpreadsheet, FileText, Image as ImageIcon, Search } from "lucide-react";
import Link from "next/link";

import { Card, EmptyState, Input, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/email-categories";
import { cn } from "@/lib/utils";

import { CategorySelect } from "./category-select";

export const metadata = { title: "Archief — bijlagen" };
export const dynamic = "force-dynamic";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "2-digit" });
}

const CATEGORY_ICONS: Record<string, string> = {
  "supplier-invoice": "🧾",
  "agent-fee-china": "🤝",
  "agent-fee-spain": "🇪🇸",
  "freight-invoice": "🚛",
  "customs-dua": "📋",
  "opex": "🏢",
  "bank-statement": "🏦",
  "quote-proforma": "📝",
  "certificate": "📜",
  "other": "📎",
};

function fileIcon(ct: string | null) {
  if (!ct) return <FileText className="h-4 w-4 text-muted" />;
  if (ct.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-accent" />;
  if (ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("csv"))
    return <FileSpreadsheet className="h-4 w-4 text-success" />;
  return <FileText className="h-4 w-4 text-muted" />;
}

type SortKey = "date" | "name" | "size" | "category" | "supplier";
const SORT_COL = {
  date: mailAttachments.receivedAt,
  name: mailAttachments.filename,
  size: mailAttachments.sizeBytes,
  category: mailAttachments.category,
  supplier: mailAttachments.supplierTag,
} as const;

export default async function ArchiefPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const supplier = typeof params.supplier === "string" ? params.supplier : "";
  const type = typeof params.type === "string" ? params.type : "";
  const sort: SortKey = (typeof params.sort === "string" && params.sort in SORT_COL ? params.sort : "date") as SortKey;
  const dir = params.dir === "asc" ? "asc" : "desc";

  const typeFilter =
    type === "image"
      ? like(mailAttachments.contentType, "image/%")
      : type === "doc"
        ? not(like(mailAttachments.contentType, "image/%"))
        : undefined;

  const where = and(
    q
      ? or(
          ilike(mailAttachments.filename, `%${q}%`),
          ilike(emailInbox.subject, `%${q}%`),
          ilike(emailInbox.fromName, `%${q}%`),
          ilike(emailInbox.fromEmail, `%${q}%`),
        )
      : undefined,
    category ? eq(mailAttachments.category, category) : undefined,
    supplier ? eq(mailAttachments.supplierTag, supplier) : undefined,
    typeFilter,
  );

  const orderCol = SORT_COL[sort];
  const orderBy = dir === "asc" ? asc(orderCol) : desc(orderCol);

  const [rows, categoryCounts, supplierList, typeCounts] = await Promise.all([
    db
      .select({
        id: mailAttachments.id,
        emailId: mailAttachments.emailId,
        filename: mailAttachments.filename,
        contentType: mailAttachments.contentType,
        sizeBytes: mailAttachments.sizeBytes,
        category: mailAttachments.category,
        supplierTag: mailAttachments.supplierTag,
        receivedAt: mailAttachments.receivedAt,
        emailSubject: emailInbox.subject,
        emailFrom: emailInbox.fromName,
        emailFromAddr: emailInbox.fromEmail,
      })
      .from(mailAttachments)
      .innerJoin(emailInbox, eq(emailInbox.id, mailAttachments.emailId))
      .where(where)
      .orderBy(orderBy)
      .limit(500),
    db
      .select({ category: mailAttachments.category, n: sql<number>`count(*)::int` })
      .from(mailAttachments)
      .groupBy(mailAttachments.category),
    db
      .select({ supplier: mailAttachments.supplierTag, n: sql<number>`count(*)::int` })
      .from(mailAttachments)
      .where(sql`${mailAttachments.supplierTag} IS NOT NULL`)
      .groupBy(mailAttachments.supplierTag)
      .orderBy(sql`count(*) desc`)
      .limit(50),
    db
      .select({
        images: sql<number>`count(case when ${mailAttachments.contentType} like 'image/%' then 1 end)::int`,
        docs: sql<number>`count(case when ${mailAttachments.contentType} not like 'image/%' then 1 end)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(mailAttachments),
  ]);

  const countByCat = Object.fromEntries(categoryCounts.map((c) => [c.category, c.n]));
  const counts = typeCounts[0] ?? { images: 0, docs: 0, total: 0 };

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    const current = { q, category, supplier, type, sort, dir, ...overrides };
    for (const [k, v] of Object.entries(current)) {
      if (v != null && v !== "" && !(k === "sort" && v === "date") && !(k === "dir" && v === "desc")) {
        sp.set(k, v as string);
      }
    }
    return sp.toString() ? `/archief?${sp.toString()}` : "/archief";
  }

  function sortHref(key: SortKey): string {
    if (sort === key) return buildUrl({ sort: key, dir: dir === "asc" ? "desc" : "asc" });
    return buildUrl({ sort: key, dir: key === "date" || key === "size" ? "desc" : "asc" });
  }

  const SortArrow = ({ k }: { k: SortKey }) =>
    sort !== k ? null : dir === "asc" ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />;

  // Categorie-pills met counts > 0, alfabetisch maar 'Alle' eerst
  const visibleCats = (Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>)
    .filter((k) => (countByCat[k] ?? 0) > 0);

  return (
    <>
      <PageHeader
        title="Archief"
        subtitle={`${counts.total} bijlagen · ${rows.length} weergegeven`}
      />

      <Card className="mb-4 space-y-2.5 p-3">
        {/* Rij 1: zoeken + leverancier-dropdown + type-toggle */}
        <form className="flex flex-wrap items-center gap-2" action="/archief">
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="type" value={type} />
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Zoek op bestand, afzender of onderwerp…"
              className="pl-8"
            />
          </div>
          <select
            name="supplier"
            defaultValue={supplier}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Alle leveranciers</option>
            {supplierList.map(
              (s) =>
                s.supplier && (
                  <option key={s.supplier} value={s.supplier}>
                    {s.supplier} ({s.n})
                  </option>
                ),
            )}
          </select>
          <div className="flex items-center overflow-hidden rounded-md border border-border text-xs">
            <Link
              href={buildUrl({ type: undefined })}
              className={cn("px-2.5 py-1.5", !type ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft")}
            >
              Alle
            </Link>
            <Link
              href={buildUrl({ type: "doc" })}
              className={cn("border-l border-border px-2.5 py-1.5", type === "doc" ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft")}
              title="Alleen documenten"
            >
              📄 {counts.docs}
            </Link>
            <Link
              href={buildUrl({ type: "image" })}
              className={cn("border-l border-border px-2.5 py-1.5", type === "image" ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft")}
              title="Alleen afbeeldingen"
            >
              🖼 {counts.images}
            </Link>
          </div>
          <button className="h-9 rounded-md border border-border bg-background px-3 text-sm hover:bg-background-soft">
            Zoeken
          </button>
        </form>

        {/* Rij 2: categorie-pills */}
        <div className="flex flex-wrap gap-1">
          <Link
            href={buildUrl({ category: undefined })}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              !category ? "bg-accent text-accent-foreground" : "bg-background-soft text-muted hover:text-foreground",
            )}
          >
            Alle ({counts.total})
          </Link>
          {visibleCats.map((k) => (
            <Link
              key={k}
              href={buildUrl({ category: k })}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                category === k
                  ? "bg-accent text-accent-foreground"
                  : "bg-background-soft text-muted hover:text-foreground",
              )}
            >
              {CATEGORY_ICONS[k]} {CATEGORIES[k]} <span className="opacity-60">({countByCat[k]})</span>
            </Link>
          ))}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Geen bijlagen gevonden"
          description="Nieuwe bijlagen worden automatisch opgeslagen + gecategoriseerd uit de mail-inbox."
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th className="w-[5rem]">
                  <Link href={sortHref("date")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Datum <SortArrow k="date" />
                  </Link>
                </Th>
                <Th className="w-10" />
                <Th>
                  <Link href={sortHref("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Bestand <SortArrow k="name" />
                  </Link>
                </Th>
                <Th className="w-[10rem]">
                  <Link href={sortHref("category")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Categorie <SortArrow k="category" />
                  </Link>
                </Th>
                <Th className="w-[9rem]">
                  <Link href={sortHref("supplier")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Leverancier <SortArrow k="supplier" />
                  </Link>
                </Th>
                <Th className="w-[5rem] text-right">
                  <Link href={sortHref("size")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Grootte <SortArrow k="size" />
                  </Link>
                </Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const isImage = r.contentType?.startsWith("image/");
                return (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap py-2 text-xs text-muted">{formatDate(r.receivedAt)}</Td>
                    <Td className="py-2">
                      {isImage ? (
                        <Link href={`/api/archief/${r.id}`} target="_blank">
                          <img
                            src={`/api/archief/${r.id}`}
                            alt=""
                            className="h-9 w-9 rounded border border-border object-cover"
                            loading="lazy"
                          />
                        </Link>
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded border border-border bg-background-soft">
                          {fileIcon(r.contentType)}
                        </span>
                      )}
                    </Td>
                    <Td className="max-w-[28rem] py-2">
                      <Link href={`/api/archief/${r.id}`} target="_blank" className="block truncate text-sm font-medium hover:underline" title={r.filename}>
                        {r.filename}
                      </Link>
                      <Link href={`/inbox/${r.emailId}`} className="block truncate text-xs text-muted hover:underline" title={r.emailSubject ?? ""}>
                        <span className="opacity-70">{r.emailFrom ?? r.emailFromAddr}</span>
                        {r.emailSubject && <span className="ml-1">· {r.emailSubject}</span>}
                      </Link>
                    </Td>
                    <Td className="py-2">
                      <CategorySelect attachmentId={r.id} current={r.category} />
                    </Td>
                    <Td className="py-2 text-xs text-muted">{r.supplierTag ?? "—"}</Td>
                    <Td className="whitespace-nowrap py-2 text-right text-xs text-muted tabular-nums">
                      {formatBytes(r.sizeBytes)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
