import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Mail, RefreshCw, Paperclip } from "lucide-react";
import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, emailSyncState } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

import { FetchMailsButton } from "./fetch-mails-button";

export const metadata = { title: "Mail-inbox" };
export const dynamic = "force-dynamic";
// De "Mails ophalen"-knop draait een IMAP-poll als server-action op deze route.
export const maxDuration = 60;

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
  return d.toLocaleString("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  });
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : "all";
  const mailboxFilter = typeof params.mailbox === "string" ? params.mailbox : "all";

  // Mailbox-filter:
  //  - 'purchase' = mails verzonden NAAR purchase@ (inkoop-gerelateerd)
  //  - 'hi' = mails NIET naar purchase@ (alle overige, primair hi@)
  //  - 'all' = beide
  const goesToPurchase = or(
    ilike(emailInbox.toEmail, "%purchase@habitat-one.com%"),
    ilike(emailInbox.ccEmail, "%purchase@habitat-one.com%"),
  );
  const mailboxClause =
    mailboxFilter === "purchase"
      ? goesToPurchase
      : mailboxFilter === "hi"
        ? sql`NOT (
            COALESCE(${emailInbox.toEmail}, '') ILIKE '%purchase@habitat-one.com%'
            OR COALESCE(${emailInbox.ccEmail}, '') ILIKE '%purchase@habitat-one.com%'
          )`
        : undefined;

  const [rows, state, counts, mailboxCounts] = await Promise.all([
    db
      .select()
      .from(emailInbox)
      .where(
        and(
          statusFilter === "all" ? undefined : eq(emailInbox.status, statusFilter),
          mailboxClause,
        ),
      )
      .orderBy(desc(emailInbox.receivedAt))
      .limit(200),
    db.select().from(emailSyncState),
    db
      .select({ status: emailInbox.status, n: sql<number>`count(*)::int` })
      .from(emailInbox)
      .where(mailboxClause)
      .groupBy(emailInbox.status),
    db.execute<{ mailbox: string; n: number }>(sql`
      SELECT
        CASE
          WHEN to_email ILIKE '%purchase@habitat-one.com%' OR cc_email ILIKE '%purchase@habitat-one.com%' THEN 'purchase'
          ELSE 'hi'
        END AS mailbox,
        count(*)::int AS n
      FROM email_inbox
      GROUP BY 1
    `),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  const mailboxByName = Object.fromEntries(
    (mailboxCounts as unknown as Array<{ mailbox: string; n: number }>).map((r) => [
      r.mailbox,
      Number(r.n),
    ]),
  );
  // Eén sync-rij per postvak (hi@ / purchase@) — toon de laatste poll + evt. fout.
  const lastPolled =
    state
      .map((s) => s.lastPolledAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const lastError = state.find((s) => s.errorMessage)?.errorMessage ?? null;

  return (
    <>
      <PageHeader
        title="Mail-inbox"
        subtitle={`${countByStatus.new ?? 0} nieuw · ${countByStatus.linked ?? 0} gelinkt · ${countByStatus.archived ?? 0} gearchiveerd`}
        actions={<FetchMailsButton />}
      />

      <Card className="mb-4 space-y-3 px-4 py-3 text-sm">
        {/* Mailbox-tabs: hi@ / purchase@ / alle */}
        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <div className="flex gap-1.5">
            {[
              { key: "all", label: "Beide mailboxen", count: undefined },
              { key: "hi", label: "hi@", count: mailboxByName.hi },
              { key: "purchase", label: "purchase@", count: mailboxByName.purchase },
            ].map((m) => {
              const sp = new URLSearchParams();
              if (m.key !== "all") sp.set("mailbox", m.key);
              if (statusFilter !== "all") sp.set("status", statusFilter);
              return (
                <Link
                  key={m.key}
                  href={sp.toString() ? `/inbox?${sp.toString()}` : "/inbox"}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs transition-colors",
                    mailboxFilter === m.key
                      ? "bg-accent/15 font-medium text-accent"
                      : "text-muted hover:bg-background-soft",
                  )}
                >
                  {m.label}
                  {m.count != null && (
                    <span className="ml-1.5 text-[10px] opacity-70">({m.count})</span>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <RefreshCw className="h-3 w-3" />
            <span>
              Poll: {lastPolled ? formatDate(lastPolled) : "—"}
            </span>
            {lastError && (
              <span className="ml-2 rounded bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                fout: {lastError.slice(0, 40)}
              </span>
            )}
          </div>
        </div>

        {/* Status-tabs */}
        <div className="flex gap-2">
          {[
            { key: "new", label: "Nieuw" },
            { key: "linked", label: "Gelinkt" },
            { key: "archived", label: "Archief" },
            { key: "all", label: "Alles" },
          ].map((tab) => {
            const sp = new URLSearchParams();
            sp.set("status", tab.key);
            if (mailboxFilter !== "all") sp.set("mailbox", mailboxFilter);
            return (
              <Link
                key={tab.key}
                href={`/inbox?${sp.toString()}`}
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
            );
          })}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Geen mails in deze categorie"
          description="Cron-job draait elk kwartier en haalt nieuwe mails op. Of klik rechtsboven op 'Mails ophalen'."
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
