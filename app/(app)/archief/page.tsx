import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { FileText, Search, Archive } from "lucide-react";
import Link from "next/link";

import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments } from "@/lib/db/schema";
import { CATEGORIES, type AttachmentCategory } from "@/lib/email-attachments";
import { cn } from "@/lib/utils";

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
  return d.toLocaleDateString("nl-NL");
}

const CATEGORY_ICONS: Record<string, string> = {
  "supplier-invoice": "🧾",
  "freight-invoice": "🚛",
  "customs-dua": "📋",
  "commission": "💰",
  "bank-statement": "🏦",
  "quote-proforma": "📝",
  "certificate": "📜",
  "other": "📎",
};

export default async function ArchiefPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const supplier = typeof params.supplier === "string" ? params.supplier : "";

  // Build filter
  const where = and(
    q ? or(
      ilike(mailAttachments.filename, `%${q}%`),
      ilike(emailInbox.subject, `%${q}%`),
      ilike(emailInbox.fromName, `%${q}%`),
      ilike(emailInbox.fromEmail, `%${q}%`),
    ) : undefined,
    category ? eq(mailAttachments.category, category) : undefined,
    supplier ? eq(mailAttachments.supplierTag, supplier) : undefined,
  );

  const [rows, categoryCounts, supplierList] = await Promise.all([
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
        storagePath: mailAttachments.storagePath,
        emailSubject: emailInbox.subject,
        emailFrom: emailInbox.fromName,
        emailFromAddr: emailInbox.fromEmail,
      })
      .from(mailAttachments)
      .innerJoin(emailInbox, eq(emailInbox.id, mailAttachments.emailId))
      .where(where)
      .orderBy(desc(mailAttachments.receivedAt))
      .limit(500),
    db
      .select({ category: mailAttachments.category, n: sql<number>`count(*)::int` })
      .from(mailAttachments)
      .groupBy(mailAttachments.category),
    db
      .selectDistinct({ supplier: mailAttachments.supplierTag })
      .from(mailAttachments)
      .where(sql`${mailAttachments.supplierTag} IS NOT NULL`)
      .limit(50),
  ]);

  const countByCat = Object.fromEntries(categoryCounts.map((c) => [c.category, c.n]));
  const totalCount = Object.values(countByCat).reduce((a, b) => Number(a) + Number(b), 0);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("category", category);
    if (supplier) sp.set("supplier", supplier);
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    return sp.toString() ? `/archief?${sp.toString()}` : "/archief";
  }

  return (
    <>
      <PageHeader
        title="Archief — bijlagen"
        subtitle={`${totalCount} bijlagen totaal · gefilterd: ${rows.length}`}
      />

      {/* Filters: search + categorieën */}
      <Card className="mb-4 space-y-3 p-4">
        <form className="flex gap-2" action="/archief">
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="supplier" value={supplier} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Zoek op bestandsnaam, afzender, onderwerp…"
              className="pl-8"
            />
          </div>
          <button className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-background-soft">
            Zoeken
          </button>
        </form>

        {/* Categorie-tabs */}
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildUrl({ category: undefined })}
            className={cn(
              "rounded-md px-3 py-1 text-xs",
              !category ? "bg-accent/15 font-medium text-accent" : "text-muted hover:bg-background-soft",
            )}
          >
            Alle ({totalCount})
          </Link>
          {Object.entries(CATEGORIES).map(([k, label]) => (
            <Link
              key={k}
              href={buildUrl({ category: k })}
              className={cn(
                "rounded-md px-3 py-1 text-xs",
                category === k ? "bg-accent/15 font-medium text-accent" : "text-muted hover:bg-background-soft",
              )}
            >
              {CATEGORY_ICONS[k]} {label}
              {countByCat[k] != null && (
                <span className="ml-1 text-[10px] opacity-70">({countByCat[k]})</span>
              )}
            </Link>
          ))}
        </div>

        {/* Supplier filter */}
        {supplierList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-xs">
            <span className="text-muted">Leverancier:</span>
            <Link
              href={buildUrl({ supplier: undefined })}
              className={cn(
                "rounded-md px-2 py-0.5",
                !supplier ? "bg-accent/15 text-accent" : "text-muted hover:bg-background-soft",
              )}
            >
              Alle
            </Link>
            {supplierList.map((s) => s.supplier && (
              <Link
                key={s.supplier}
                href={buildUrl({ supplier: s.supplier })}
                className={cn(
                  "rounded-md px-2 py-0.5",
                  supplier === s.supplier ? "bg-accent/15 text-accent" : "text-muted hover:bg-background-soft",
                )}
              >
                {s.supplier}
              </Link>
            ))}
          </div>
        )}
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
                <Th>Datum</Th>
                <Th>Bestand</Th>
                <Th>Categorie</Th>
                <Th>Leverancier</Th>
                <Th>Afzender / onderwerp</Th>
                <Th className="text-right">Grootte</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDate(r.receivedAt)}</Td>
                  <Td className="max-w-[24rem]">
                    <Link href={`/api/archief/${r.id}`} target="_blank" className="block text-sm font-medium hover:underline">
                      {r.filename}
                    </Link>
                    <span className="text-xs text-muted">{r.contentType}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    <Badge tone="neutral">
                      {CATEGORY_ICONS[r.category]} {CATEGORIES[r.category as AttachmentCategory] ?? r.category}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-muted">{r.supplierTag ?? "—"}</Td>
                  <Td className="max-w-[24rem] text-xs">
                    <Link href={`/inbox/${r.emailId}`} className="hover:underline">
                      <span className="block truncate text-muted">{r.emailFrom ?? r.emailFromAddr}</span>
                      <span className="block truncate">{r.emailSubject ?? "(geen onderwerp)"}</span>
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs text-muted">{formatBytes(r.sizeBytes)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
