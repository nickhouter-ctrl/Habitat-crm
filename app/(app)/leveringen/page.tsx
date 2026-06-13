import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { db } from "@/lib/db";
import { contacts, deliveries, documents, projects } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { cn, formatDate } from "@/lib/utils";
import { deleteDelivery, dismissDelivery, planDelivery, setDeliveryStatus } from "./actions";

export const metadata = { title: "Leveringen" };

const METHOD_LABEL: Record<string, string> = {
  leveren: "🚚 Leveren",
  ophalen: "🤝 Ophalen",
  plaatsen: "🔧 Plaatsen",
};
const STATUS_META: Record<string, { label: string; tone: "neutral" | "info" | "success" }> = {
  gepland: { label: "Gepland", tone: "neutral" },
  onderweg: { label: "Onderweg", tone: "info" },
  geleverd: { label: "Geleverd", tone: "success" },
};

const TABS = [
  { key: "open", label: "Open" },
  { key: "geleverd", label: "Geleverd" },
  { key: "alle", label: "Alle" },
] as const;

export default async function LeveringenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status === "geleverd" || status === "alle" ? status : "open";
  const statuses =
    filter === "open"
      ? ["gepland", "onderweg"]
      : filter === "geleverd"
        ? ["geleverd"]
        : ["gepland", "onderweg", "geleverd"];

  const rows = await db
    .select({
      id: deliveries.id,
      plannedDate: deliveries.plannedDate,
      method: deliveries.method,
      status: deliveries.status,
      notifiedAt: deliveries.notifiedAt,
      deliveredAt: deliveries.deliveredAt,
      deliveryNoteId: deliveries.deliveryNoteId,
      docId: documents.id,
      docNumber: documents.docNumber,
      contactName: contacts.name,
      projectName: projects.name,
    })
    .from(deliveries)
    .leftJoin(documents, eq(documents.id, deliveries.documentId))
    .leftJoin(contacts, eq(contacts.id, deliveries.contactId))
    .leftJoin(projects, eq(projects.id, deliveries.projectId))
    .where(inArray(deliveries.status, statuses))
    .orderBy(desc(deliveries.plannedDate));

  // Pakbon-nummers ophalen.
  const noteIds = rows.map((r) => r.deliveryNoteId).filter(Boolean) as string[];
  const noteRows = noteIds.length
    ? await db
        .select({ id: documents.id, docNumber: documents.docNumber })
        .from(documents)
        .where(inArray(documents.id, noteIds))
    : [];
  const noteById = new Map(noteRows.map((n) => [n.id, n.docNumber]));

  const counts = {
    gepland: rows.filter((r) => r.status === "gepland").length,
    onderweg: rows.filter((r) => r.status === "onderweg").length,
    geleverd: rows.filter((r) => r.status === "geleverd").length,
  };

  // Te plannen: verkochte facturen met productregels die nog geen levering hebben.
  const deliveredDocIds = new Set(
    (await db.select({ id: deliveries.documentId }).from(deliveries))
      .map((r) => r.id)
      .filter(Boolean) as string[],
  );
  const toPlan = (
    await db
      .select({
        id: documents.id,
        docNumber: documents.docNumber,
        title: documents.title,
        items: documents.items,
        contactName: contacts.name,
        projectName: projects.name,
      })
      .from(documents)
      .leftJoin(contacts, eq(contacts.id, documents.contactId))
      .leftJoin(projects, eq(projects.id, documents.projectId))
      .where(
        and(
          eq(documents.kind, "invoice"),
          inArray(documents.status, ["sent", "paid", "partially_paid", "overdue"]),
        ),
      )
      .orderBy(desc(documents.issueDate))
  ).filter(
    (d) =>
      !deliveredDocIds.has(d.id) &&
      normalizeDocItems(d.items).some((it) => it.productId && it.units),
  );

  return (
    <>
      <PageHeader title="Leveringen" subtitle="Geplande en uitgevoerde leveringen, ophalingen en montages" />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Gepland" value={String(counts.gepland)} tone="neutral" />
        <StatTile label="Onderweg" value={String(counts.onderweg)} tone="info" />
        <StatTile label="Geleverd" value={String(counts.geleverd)} tone="success" />
      </div>

      {toPlan.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <CardHeader>
            <CardTitle>Te plannen ({toPlan.length})</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {toPlan.map((d) => (
              <form key={d.id} action={planDelivery} className="px-5 py-3">
                <input type="hidden" name="documentId" value={d.id} />
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                    {d.docNumber ?? "(factuur)"}
                  </Link>
                  <span className="text-sm">{d.contactName ?? "—"}</span>
                  {(d.projectName || d.title) && (
                    <span className="text-xs text-muted">
                      · {[d.projectName, d.title].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <select
                    name="method"
                    defaultValue="leveren"
                    className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
                  >
                    <option value="leveren">🚚 Leveren</option>
                    <option value="ophalen">🤝 Ophalen</option>
                    <option value="plaatsen">🔧 Leveren &amp; plaatsen</option>
                  </select>
                  <input
                    type="date"
                    name="plannedDate"
                    required
                    className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input type="checkbox" name="notify" value="1" /> klant mailen
                  </label>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                    Plannen
                  </SubmitButton>
                  <button
                    type="submit"
                    formAction={dismissDelivery.bind(null, d.id)}
                    formNoValidate
                    className="rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-muted/50 hover:text-foreground"
                    title="Geen levering nodig (bv. werkzaamheden)"
                  >
                    Geen levering
                  </button>
                </div>
              </form>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Leveringen</CardTitle>
          <div className="flex items-center gap-1 text-xs">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "open" ? "/leveringen" : `/leveringen?status=${t.key}`}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  filter === t.key ? "bg-primary/10 text-primary" : "text-muted hover:bg-muted/50",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState title="Geen leveringen" description="Plan leveringen in vanaf het dashboard." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Datum</Th>
                <Th>Factuur</Th>
                <Th>Pakbon</Th>
                <Th>Klant / project</Th>
                <Th>Methode</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium tabular-nums">
                    {d.plannedDate ? formatDate(d.plannedDate) : "—"}
                  </Td>
                  <Td>
                    {d.docId ? (
                      <Link href={`/documents/${d.docId}`} className="hover:underline">
                        {d.docNumber ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {d.deliveryNoteId ? (
                      <Link href={`/documents/${d.deliveryNoteId}`} className="text-accent hover:underline">
                        {noteById.get(d.deliveryNoteId) ?? "pakbon"}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-muted">
                    {d.contactName ?? "—"}
                    {d.projectName ? <span className="block text-xs">{d.projectName}</span> : null}
                    {d.notifiedAt ? <span className="block text-xs text-success">✉ klant gemeld</span> : null}
                  </Td>
                  <Td className="text-muted">{METHOD_LABEL[d.method] ?? d.method}</Td>
                  <Td>
                    <Badge tone={STATUS_META[d.status]?.tone ?? "neutral"}>
                      {STATUS_META[d.status]?.label ?? d.status}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {d.status === "gepland" && (
                        <form action={setDeliveryStatus.bind(null, d.id, "onderweg")}>
                          <SubmitButton size="sm" variant="ghost" className="text-xs text-muted" pendingLabel="…">
                            Onderweg
                          </SubmitButton>
                        </form>
                      )}
                      {d.status !== "geleverd" && (
                        <form action={setDeliveryStatus.bind(null, d.id, "geleverd")}>
                          <SubmitButton size="sm" variant="secondary" className="text-xs" pendingLabel="…">
                            Geleverd
                          </SubmitButton>
                        </form>
                      )}
                      <form action={deleteDelivery.bind(null, d.id)}>
                        <ConfirmSubmit
                          message="Deze levering verwijderen?"
                          className="rounded p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          ✕
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
