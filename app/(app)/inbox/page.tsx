import { and, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { Suspense } from "react";
import { Paperclip, Search } from "lucide-react";
import Link from "next/link";
import { Button, Input, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, emailSyncState, inboxSuggestions } from "@/lib/db/schema";
import { MAIL_GROUPS, type MailGroup } from "@/lib/assistant/mail-rules";
import { cn } from "@/lib/utils";
import { bulkArchiveMails, bulkDeleteMails } from "./actions";
import { BulkMailBar } from "./bulk-bar";
import { FetchMailsButton } from "./fetch-mails-button";
import { MailReader } from "./mail-reader";
export const metadata = { title: "Mail-inbox" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const status = ["unread", "new", "linked", "archived", "all"].includes(value("status")) ? value("status") : "active";
  const mailbox = value("mailbox"), q = value("q").trim(), group = value("group");
  const page = Math.max(1, Math.min(10000, Math.floor(Number(value("page")) || 1)));
  const purchase = (process.env.GMAIL_PURCHASE_USER || "purchase@habitat-one.com").toLowerCase();
  const goesToPurchase = sql`(coalesce(${emailInbox.toEmail}, '') ilike ${`%${purchase}%`} or coalesce(${emailInbox.ccEmail}, '') ilike ${`%${purchase}%`})`;
  const mailboxClause = mailbox === "purchase" ? goesToPurchase : mailbox === "hi" ? sql`not ${goesToPurchase}` : undefined;
  const [rows, states, counts, [pending]] = await Promise.all([
    db.select({ id: emailInbox.id, receivedAt: emailInbox.receivedAt, fromName: emailInbox.fromName,
      fromEmail: emailInbox.fromEmail, subject: emailInbox.subject, status: emailInbox.status, readAt: emailInbox.readAt,
      attachments: emailInbox.attachments, preview: sql<string | null>`left(${emailInbox.bodyText}, 180)`,
      summary: inboxSuggestions.summary, category: inboxSuggestions.category, needsReply: inboxSuggestions.needsReply,
      hasDraft: sql<boolean>`${inboxSuggestions.draft} is not null`,
    }).from(emailInbox).leftJoin(inboxSuggestions, eq(inboxSuggestions.emailId, emailInbox.id))
      .where(and(mailboxClause, status === "unread" ? and(ne(emailInbox.status, "archived"), isNull(emailInbox.readAt)) : status === "active" ? ne(emailInbox.status, "archived") : status === "all" ? undefined : eq(emailInbox.status, status),
        group === "reply" ? and(eq(inboxSuggestions.needsReply, true), eq(inboxSuggestions.status, "open")) : group in MAIL_GROUPS ? eq(inboxSuggestions.category, group) : undefined,
        q ? or(ilike(emailInbox.subject, `%${q}%`), ilike(emailInbox.fromName, `%${q}%`), ilike(emailInbox.fromEmail, `%${q}%`), ilike(emailInbox.bodyText, `%${q}%`)) : undefined))
      .orderBy(desc(emailInbox.receivedAt), desc(emailInbox.id)).limit(51).offset((page - 1) * 50),
    db.select().from(emailSyncState),
    db.select({ status: emailInbox.status, n: sql<number>`count(*)::int` }).from(emailInbox).where(mailboxClause).groupBy(emailInbox.status),
    db.select({ n: sql<number>`count(*)::int` }).from(emailInbox).where(and(ne(emailInbox.status, "archived"), isNull(emailInbox.readAt))),
  ]);
  const hasNext = rows.length > 50, visible = rows.slice(0, 50);
  const selected = z.string().uuid().safeParse(value("mail")).success ? { id: value("mail") } : visible[0];
  const explicitSelection = !!value("mail") && !!selected;
  const countMap = Object.fromEntries(counts.map(c => [c.status, c.n]));
  const filters = new URLSearchParams();
  for (const key of ["status", "mailbox", "q", "group", "page"]) if (value(key)) filters.set(key, value(key));
  function href(changes: Record<string, string>) {
    const next = new URLSearchParams(filters);
    for (const [key, val] of Object.entries(changes)) { if (val) next.set(key, val); else next.delete(key); }
    return `/inbox?${next.toString()}`;
  }
  const syncError = states.find(s => s.errorMessage)?.errorMessage;
  const lastPoll = states.flatMap(s => s.lastPolledAt ? [s.lastPolledAt] : []).sort((a, b) => b.getTime() - a.getTime())[0];
  return <>
    <PageHeader title="Mail-inbox" subtitle="Lezen, voorbereiden en afhandelen op één plek" actions={<FetchMailsButton />} />
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1">{[["active", "Inbox"], ["unread", "Ongelezen"], ["new", "Nog te verwerken"], ["archived", "Archief"], ["all", "Alles"]].map(([key, label]) => <Link key={key} href={key === "unread" ? "/inbox?status=unread" : href({ status: key, page: "" })} className={cn("rounded-md px-3 py-2 text-sm", status === key ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-background-soft")}>{label}{key === "unread" ? ` (${pending.n})` : key === "active" ? ` (${(countMap.new ?? 0) + (countMap.linked ?? 0)})` : key === "archived" ? ` (${countMap.archived ?? 0})` : ""}</Link>)}</div>
      <Link className="text-sm text-accent" href="/assistent">Assistent en automatisch opgeborgen mail →</Link>
    </div>
    <form method="get" className="mb-3 flex flex-wrap gap-2">
      <input type="hidden" name="status" value={status} />
      <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted" /><Input name="q" defaultValue={q} placeholder="Zoek afzender, onderwerp of inhoud…" className="pl-9" aria-label="Zoek mail" /></div>
      <select aria-label="Mailbox" name="mailbox" defaultValue={mailbox} className="rounded-md border border-border bg-surface px-3 py-2 text-sm"><option value="">Beide mailboxen</option><option value="hi">hi@</option><option value="purchase">purchase@</option></select>
      <select aria-label="Soort mail" name="group" defaultValue={group} className="rounded-md border border-border bg-surface px-3 py-2 text-sm"><option value="">Alle categorieën</option><option value="reply">Te beantwoorden</option>{Object.entries(MAIL_GROUPS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
      <Button type="submit" variant="secondary">Zoeken</Button>
    </form>
    {status === "unread" && <p className="mb-3 text-xs text-muted">Deze berichten tellen mee in de melding bij Mail-inbox.{(mailbox || q || group) ? " Je huidige filters kunnen een deel verbergen." : ""}</p>}
    {syncError && <p className="mb-3 rounded-md bg-warning/10 p-3 text-sm text-warning">Ophalen van mail is niet volledig gelukt. Probeer Mails ophalen opnieuw.</p>}
    <div className="overflow-hidden rounded-xl border border-border bg-surface lg:grid lg:h-dvh lg:min-h-[48rem] lg:grid-cols-[minmax(17rem,32%)_minmax(0,1fr)]">
      <section aria-label="Berichtenlijst" className={cn("min-w-0 border-border lg:flex lg:min-h-0 lg:flex-col lg:border-r", explicitSelection ? "hidden" : "flex flex-col")}>
        <form className="min-h-0 flex-1 overflow-y-auto" key={filters.toString()}>
          <details className="border-b border-border p-3 text-xs text-muted"><summary className="cursor-pointer">Meerdere mails selecteren</summary><BulkMailBar archiveAction={bulkArchiveMails} deleteAction={bulkDeleteMails} /></details>
          {!visible.length && <p className="p-6 text-sm text-muted">Geen berichten in deze selectie. Nieuwe mail wordt elke 5 minuten opgehaald.</p>}
          {visible.map(m => <div key={m.id} className={cn("relative flex border-b border-border", selected?.id === m.id ? "bg-accent/5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-accent" : "hover:bg-background-soft")}>
            <div className="pl-3 pt-5"><input type="checkbox" name="ids" value={m.id} aria-label={`Selecteer ${m.subject ?? "mail"}`} className="size-3.5 accent-[var(--accent)]" /></div>
            <Link href={href({ mail: m.id })} scroll={false} prefetch={false} aria-current={selected?.id === m.id ? "true" : undefined} className="block min-w-0 flex-1 p-4" data-mail-link={m.id}>
              <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{m.fromName || m.fromEmail || "Onbekende afzender"}</span><time className="shrink-0 text-[11px] text-muted">{m.receivedAt?.toLocaleDateString("nl-NL", { timeZone: "Europe/Madrid" }) === new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Madrid" }) ? m.receivedAt?.toLocaleTimeString("nl-NL", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) : m.receivedAt?.toLocaleDateString("nl-NL", { timeZone: "Europe/Madrid", day: "numeric", month: "short" })}</time></div>
              <p className="mt-1 truncate text-sm">{m.subject || "Zonder onderwerp"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase text-muted">{!m.readAt && <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">Ongelezen</span>}<span className={cn("rounded bg-background-soft px-1.5 py-0.5", m.category === "urgent" && "text-warning")}>{MAIL_GROUPS[m.category as MailGroup] || (m.status === "archived" ? "Archief" : "Nog niet ingedeeld")}</span>{m.hasDraft && <span className="text-accent">Concept klaar</span>}{Array.isArray(m.attachments) && m.attachments.length > 0 && <span className="flex items-center gap-1"><Paperclip className="size-3" />{m.attachments.length}</span>}</div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{m.summary || m.preview || "Open om het bericht te lezen"}</p>
            </Link>
          </div>)}
        </form>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">{page > 1 ? <Link href={href({ page: String(page - 1) })}>← Vorige</Link> : <span /> }<span>Pagina {page}</span>{hasNext ? <Link href={href({ page: String(page + 1) })}>Volgende →</Link> : <span />}</div>
      </section>
      <section aria-label="Geopende mail" className={cn("min-w-0 overflow-y-auto lg:block", explicitSelection ? "block" : "hidden")}>
        <Link href={href({})} className="block border-b border-border p-4 text-sm text-accent lg:hidden">← Terug naar berichten</Link>
        {selected ? <Suspense key={`${selected.id}-${value("reply")}`} fallback={<p className="p-6 text-sm text-muted" role="status">Mail laden…</p>}>
          <MailReader opened={explicitSelection} id={selected.id} reply={value("reply") === "1"} replyResult={value("beantwoord")} backHref={href({})} mailHref={href({ mail: selected.id })} />
        </Suspense> : <p className="p-8 text-sm text-muted">Selecteer een bericht om het hier te lezen.</p>}
      </section>
    </div>
    <p className="mt-2 text-xs text-muted">Laatst opgehaald: {lastPoll?.toLocaleString("nl-NL", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }) || "nog niet"} · Alleen de mailbox in het CRM wordt aangepast.</p>
  </>;
}
