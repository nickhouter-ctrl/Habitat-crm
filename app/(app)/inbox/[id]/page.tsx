import { desc, eq, ilike, or } from "drizzle-orm";
import { ArrowLeft, Archive, Link2, Mail, Paperclip, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, purchaseOrders, quoteRequests } from "@/lib/db/schema";
import { cn, formatEUR } from "@/lib/utils";

import {
  archiveMail,
  linkMailToPurchaseOrder,
  linkMailToQuoteRequest,
  reopenMail,
  saveMailNotes,
} from "../actions";

export const metadata = { title: "Mail — detail" };
export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default async function MailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, id) });
  if (!mail) notFound();

  // Suggesties: PO's die mogelijk bij deze mail horen (zelfde supplier-naam in subject of from)
  const fromDomain = mail.fromEmail?.split("@")[1] ?? "";
  const supplierGuess = fromDomain.split(".")[0] || "";
  const subjectLower = (mail.subject ?? "").toLowerCase();

  const allPOs = await db
    .select({
      id: purchaseOrders.id,
      supplier: purchaseOrders.supplier,
      reference: purchaseOrders.reference,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      total: purchaseOrders.total,
      currency: purchaseOrders.currency,
    })
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderDate))
    .limit(30);

  const suggestedPOs = allPOs.filter((p) => {
    const supLower = (p.supplier ?? "").toLowerCase();
    const refLower = (p.reference ?? "").toLowerCase();
    if (supplierGuess && supLower.includes(supplierGuess)) return true;
    if (refLower && subjectLower.includes(refLower)) return true;
    return false;
  });

  const recentRequests = await db
    .select({
      id: quoteRequests.id,
      name: quoteRequests.name,
      email: quoteRequests.email,
      status: quoteRequests.status,
      createdAt: quoteRequests.createdAt,
    })
    .from(quoteRequests)
    .where(mail.fromEmail ? eq(quoteRequests.email, mail.fromEmail) : undefined)
    .orderBy(desc(quoteRequests.createdAt))
    .limit(5);

  const linkedPO = mail.linkedPurchaseOrderId
    ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, mail.linkedPurchaseOrderId) })
    : null;
  const linkedQR = mail.linkedQuoteRequestId
    ? await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, mail.linkedQuoteRequestId) })
    : null;

  const attachments = (mail.attachments as Array<{ filename: string; size: number; contentType: string }>) ?? [];

  return (
    <>
      <PageHeader
        title={mail.subject || "(geen onderwerp)"}
        subtitle={`${formatDate(mail.receivedAt)} · ${mail.fromName ?? mail.fromEmail ?? "?"}`}
        actions={
          <LinkButton href="/inbox" variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Terug
          </LinkButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* LEFT: mail content */}
        <Card className="space-y-4 p-5">
          <div className="space-y-1 border-b border-border pb-3 text-sm">
            <div>
              <span className="font-medium text-muted">Van:</span>{" "}
              <span>
                {mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : (mail.fromEmail ?? "?")}
              </span>
            </div>
            <div>
              <span className="font-medium text-muted">Aan:</span> <span>{mail.toEmail ?? "?"}</span>
            </div>
            {mail.ccEmail && (
              <div>
                <span className="font-medium text-muted">CC:</span> <span>{mail.ccEmail}</span>
              </div>
            )}
            <div className="text-xs text-muted">Message-ID: {mail.messageId}</div>
          </div>

          {/* Body */}
          {mail.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-sm"
              // Trusted gmail content — note this is rendered as-is
              dangerouslySetInnerHTML={{ __html: mail.bodyHtml }}
            />
          ) : mail.bodyText ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {mail.bodyText}
            </pre>
          ) : (
            <p className="text-sm text-muted">(geen body)</p>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Bijlagen ({attachments.length})
              </p>
              <ul className="space-y-1.5">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-muted" />
                    <span className="font-medium">{a.filename}</span>
                    <span className="text-xs text-muted">
                      {(a.size / 1024).toFixed(0)} kB · {a.contentType}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Bijlagen-inhoud nog niet opgeslagen — alleen metadata. Voor PDF/CI bekijken: open in Gmail.
              </p>
            </div>
          )}
        </Card>

        {/* RIGHT: actions sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Status</p>
            <div className="mt-2 flex items-center gap-2">
              {mail.status === "new" && <Badge tone="info">nieuw</Badge>}
              {mail.status === "linked" && <Badge tone="success">gelinkt</Badge>}
              {mail.status === "archived" && <Badge tone="neutral">gearchiveerd</Badge>}
            </div>
            {mail.status !== "new" && (
              <form
                action={async () => {
                  "use server";
                  await reopenMail(mail.id);
                }}
                className="mt-3"
              >
                <button className={cn(buttonClass({ variant: "ghost", size: "sm" }), "w-full")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Heropenen
                </button>
              </form>
            )}
            {mail.status === "new" && (
              <form
                action={async () => {
                  "use server";
                  await archiveMail(mail.id);
                }}
                className="mt-3"
              >
                <button className={cn(buttonClass({ variant: "ghost", size: "sm" }), "w-full")}>
                  <Archive className="h-3.5 w-3.5" /> Archiveren
                </button>
              </form>
            )}
          </Card>

          {/* Currently linked */}
          {linkedPO && (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Gelinkt aan PO</p>
              <Link
                href={`/inkooporders/${linkedPO.id}`}
                className="mt-1 block text-sm font-medium hover:underline"
              >
                {linkedPO.supplier} {linkedPO.reference ? `· ${linkedPO.reference}` : ""}
              </Link>
              <p className="text-xs text-muted">Status PO: {linkedPO.status}</p>
            </Card>
          )}
          {linkedQR && (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Gelinkt aan aanvraag</p>
              <Link
                href={`/aanvragen/${linkedQR.id}`}
                className="mt-1 block text-sm font-medium hover:underline"
              >
                {linkedQR.name ?? linkedQR.email}
              </Link>
            </Card>
          )}

          {/* Suggestie: link aan PO */}
          {mail.status === "new" && !linkedPO && (
            <Card className="p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                <Link2 className="mr-1 inline h-3 w-3" /> Link aan Purchase Order
              </p>
              {suggestedPOs.length > 0 ? (
                <>
                  <p className="mb-2 text-xs text-muted">Voorstel op basis van afzender:</p>
                  <ul className="space-y-1.5">
                    {suggestedPOs.map((p) => (
                      <li key={p.id}>
                        <form
                          action={async () => {
                            "use server";
                            await linkMailToPurchaseOrder({
                              emailId: mail.id,
                              purchaseOrderId: p.id,
                              setInTransit: true,
                            });
                          }}
                        >
                          <button
                            type="submit"
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs hover:bg-background-soft"
                          >
                            <span className="block font-medium">{p.supplier}</span>
                            <span className="block text-muted">
                              {p.reference ?? "—"} · {p.status} · {formatEUR(Number(p.total))}
                            </span>
                            <span className="mt-1 block text-[10px] uppercase tracking-wide text-accent">
                              → Link + zet op "onderweg"
                            </span>
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-muted">Geen voorstel — kies handmatig.</p>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                  Alle recente PO's tonen ({allPOs.length})
                </summary>
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {allPOs.map((p) => (
                    <li key={p.id}>
                      <form
                        action={async () => {
                          "use server";
                          await linkMailToPurchaseOrder({
                            emailId: mail.id,
                            purchaseOrderId: p.id,
                            setInTransit: false,
                          });
                        }}
                      >
                        <button
                          type="submit"
                          className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-background-soft"
                        >
                          <span className="font-medium">{p.supplier}</span>{" "}
                          <span className="text-muted">{p.reference ?? "—"}</span>{" "}
                          <span className="text-[10px] text-muted">({p.status})</span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}

          {/* Suggestie: link aan offerte-aanvraag */}
          {mail.status === "new" && !linkedQR && recentRequests.length > 0 && (
            <Card className="p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                <Link2 className="mr-1 inline h-3 w-3" /> Link aan offerte-aanvraag
              </p>
              <p className="mb-2 text-xs text-muted">Aanvragen van zelfde e-mailadres:</p>
              <ul className="space-y-1.5">
                {recentRequests.map((q) => (
                  <li key={q.id}>
                    <form
                      action={async () => {
                        "use server";
                        await linkMailToQuoteRequest({ emailId: mail.id, quoteRequestId: q.id });
                      }}
                    >
                      <button
                        type="submit"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs hover:bg-background-soft"
                      >
                        <span className="block font-medium">{q.name ?? q.email}</span>
                        <span className="block text-muted">
                          {q.status} · {q.createdAt?.toLocaleDateString("nl-NL")}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Notes */}
          <Card className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Interne notities
            </p>
            <form
              action={async (formData: FormData) => {
                "use server";
                await saveMailNotes(mail.id, String(formData.get("notes") ?? ""));
              }}
              className="space-y-2"
            >
              <textarea
                name="notes"
                rows={4}
                defaultValue={mail.notes ?? ""}
                placeholder="Notities (alleen intern zichtbaar)…"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <button className={cn(buttonClass({ size: "sm" }), "w-full")}>Bewaren</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
