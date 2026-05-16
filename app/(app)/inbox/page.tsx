import { desc, eq, sql } from "drizzle-orm";
import { Mail, RefreshCw, Paperclip } from "lucide-react";
import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, emailSyncState } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mail-inbox" };
export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "new":
      return <Badge tone="info">nieuw</Badge>;
    case "linked":
      return <Badge tone="success">gelinkt</Badge>;
    case "archived":
      return <Badge tone="neutral">gearchiveerd</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : "new";

  const [rows, state, counts] = await Promise.all([
    db
      .select()
      .from(emailInbox)
      .where(statusFilter === "all" ? undefined : eq(emailInbox.status, statusFilter))
      .orderBy(desc(emailInbox.receivedAt))
      .limit(200),
    db.select().from(emailSyncState).limit(1),
    db
      .select({ status: emailInbox.status, n: sql<number>`count(*)::int` })
      .from(emailInbox)
      .groupBy(emailInbox.status),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  const lastPolled = state[0]?.lastPolledAt;
  const lastError = state[0]?.errorMessage;

  return (
    <>
      <PageHeader
        title="Mail-inbox"
        subtitle={`${countByStatus.new ?? 0} nieuw · ${countByStatus.linked ?? 0} gelinkt · ${countByStatus.archived ?? 0} gearchiveerd`}
      />

      <Card className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-muted">
          <RefreshCw className="h-4 w-4" />
          <span>
            Laatste poll:{" "}
            {lastPolled ? formatDate(lastPolled) : "nog niet gepolled"}
          </span>
          {lastError && (
            <span className="ml-3 rounded bg-danger/10 px-2 py-0.5 text-xs text-danger">
              fout: {lastError.slice(0, 80)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {[
            { key: "new", label: "Nieuw" },
            { key: "linked", label: "Gelinkt" },
            { key: "archived", label: "Archief" },
            { key: "all", label: "Alles" },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={`/inbox?status=${tab.key}`}
              className={cn(
                "rounded-md px-3 py-1 text-xs transition-colors",
                statusFilter === tab.key
                  ? "bg-accent/15 font-medium text-accent"
                  : "text-muted hover:bg-background-soft",
              )}
            >
              {tab.label}
              {tab.key !== "all" && countByStatus[tab.key] != null && (
                <span className="ml-1.5 text-[10px] opacity-70">
                  {countByStatus[tab.key]}
                </span>
              )}
            </Link>
          ))}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Geen mails in deze categorie"
          description="Cron-job draait elk kwartier en haalt nieuwe mails op. Of trigger manueel via /api/cron/imap-poll."
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Ontvangen</Th>
                <Th>Van</Th>
                <Th>Onderwerp</Th>
                <Th>Bijlagen</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const attCount = (r.attachments as Array<unknown> | null)?.length ?? 0;
                return (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap text-xs text-muted">
                      {formatDate(r.receivedAt)}
                    </Td>
                    <Td className="max-w-[20rem] text-sm">
                      <Link href={`/inbox/${r.id}`} className="hover:underline">
                        <div className="font-medium">{r.fromName ?? r.fromEmail ?? "?"}</div>
                        {r.fromName && r.fromEmail && (
                          <div className="truncate text-xs text-muted">{r.fromEmail}</div>
                        )}
                      </Link>
                    </Td>
                    <Td className="max-w-[28rem] text-sm">
                      <Link href={`/inbox/${r.id}`} className="hover:underline">
                        <span className="block truncate">{r.subject ?? "(geen onderwerp)"}</span>
                        {r.bodyText && (
                          <span className="block truncate text-xs text-muted">
                            {r.bodyText.slice(0, 120).replace(/\s+/g, " ")}
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td className="text-xs text-muted">
                      {attCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {attCount}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{statusBadge(r.status)}</Td>
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
