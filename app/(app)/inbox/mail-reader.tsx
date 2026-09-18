import { MarkRead } from "./mark-read";
import { QueueInvoiceButton } from "./queue-invoice-button";
import { asc, eq } from "drizzle-orm";

import { huidigeToegangOfNull } from "@/lib/auth/access";
import Link from "next/link";
import { Suspense } from "react";
import { Archive, ArrowLeft, FilePlus2, Reply } from "lucide-react";
import { db } from "@/lib/db";
import { emailInbox, inboxSuggestions, mailAttachments, purchaseInvoiceReviews } from "@/lib/db/schema";
import { MAIL_GROUPS, type MailGroup } from "@/lib/assistant/mail-rules";
import { sanitizeMailHtml } from "@/lib/sanitize-mail-html";
import { aiReplyConfigured } from "@/lib/ai-reply";
import { listCatalogFiles } from "@/lib/storage";
import { AiMailForm } from "@/components/ai-mail-form";
import { LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveReplyDraft } from "../assistent/actions";
import { aiMailConcept, replyToMail } from "./actions";
import { archiveReaderMail, createRequestFromMail, restoreReaderMail } from "./reader-actions";

type Mail = typeof emailInbox.$inferSelect;
type Suggestion = typeof inboxSuggestions.$inferSelect;
async function ReaderReply({ mail, suggestion, returnTo }: { mail: Mail; suggestion?: Suggestion; returnTo: string }) {
  const catalogi = await listCatalogFiles();
  return <AiMailForm initialBody={suggestion?.draft ?? ""} initialAttachments={suggestion?.draftAttachments ?? []}
    defaultSubject={suggestion?.draftSubject || `Re: ${(mail.subject || "je bericht").replace(/^(re|fwd?|aw):\s*/i, "")}`}
    toEmail={mail.fromEmail!} aiBeschikbaar={aiReplyConfigured()} bijlagen={catalogi.map(f => ({ path: f.path, name: f.name, size: f.size }))}
    saveDraft={saveReplyDraft.bind(null, mail.id)} genereer={aiMailConcept.bind(null, mail.id)} verstuur={replyToMail.bind(null, mail.id)} returnTo={returnTo} />;
}
export async function MailReader({ opened, id, reply, replyResult, backHref, mailHref }: { opened: boolean; id: string; reply: boolean; replyResult: string; backHref: string; mailHref: string }) {
  const [mail, suggestion, attachments, ik] = await Promise.all([
    db.query.emailInbox.findFirst({ where: eq(emailInbox.id, id) }),
    db.query.inboxSuggestions.findFirst({ where: eq(inboxSuggestions.emailId, id) }),
    db.select({ id: mailAttachments.id, filename: mailAttachments.filename, sizeBytes: mailAttachments.sizeBytes, reviewStatus: purchaseInvoiceReviews.status, purchaseOrderId: purchaseInvoiceReviews.purchaseOrderId })
      .from(mailAttachments).leftJoin(purchaseInvoiceReviews, eq(purchaseInvoiceReviews.mailAttachmentId, mailAttachments.id)).where(eq(mailAttachments.emailId, id)).orderBy(asc(mailAttachments.filename)),
    huidigeToegangOfNull(),
  ]);
  if (!mail) return <p className="p-6 text-sm text-muted">Dit bericht is niet meer beschikbaar.</p>;
  const readOnly = !ik?.heeftCap("schrijven");
  // Een bijlage als inkoopfactuur klaarzetten hoort bij inkoop, niet bij mail.
  const magFactuurKlaarzetten = ik?.magModule("inkoop") ?? false;
  return <article className="min-w-0" aria-label={mail.subject || "Mail zonder onderwerp"}>
    {opened && !readOnly && !mail.readAt && <MarkRead id={id} />}
    <div className="border-b border-border p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 break-words text-xl font-semibold">{mail.subject || "Zonder onderwerp"}</h2><span className="rounded bg-background-soft px-2 py-1 text-xs text-muted">{MAIL_GROUPS[suggestion?.category as MailGroup] || "Nog te beoordelen"}</span></div>
      {!mail.readAt && <p className="mt-3 inline-flex rounded-md bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">Ongelezen</p>}
      {suggestion && <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm"><p className="text-accent">{suggestion.source === "ai" ? "AI-samenvatting" : "Voorstel"}: {suggestion.summary}</p>{suggestion.deadline && <p className="mt-2 text-warning">Termijn uit bericht: {suggestion.deadline}</p>}</div>}
      <div className="mt-4 space-y-1 break-words text-sm"><p>Van: {mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail}</p><p>Aan: {mail.toEmail}</p>{mail.ccEmail && <p>Cc: {mail.ccEmail}</p>}<p className="text-xs text-muted">{mail.receivedAt?.toLocaleString("nl-NL", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Madrid" })}</p></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!readOnly && mail.fromEmail && <LinkButton href={`${mailHref}&reply=1`}><Reply className="size-4" />{suggestion?.draft ? "Concept bekijken" : "Reageren"}</LinkButton>}
        {mail.linkedQuoteRequestId ? <LinkButton href={`/aanvragen/${mail.linkedQuoteRequestId}`} variant="secondary">Aanvraag openen</LinkButton> : !readOnly && mail.fromEmail && <form action={createRequestFromMail.bind(null, id)}><SubmitButton variant="secondary" pendingLabel="Aanvraag klaarzetten…"><FilePlus2 className="size-4" />Aanvraag maken</SubmitButton></form>}
        {attachments.length > 0 && <LinkButton href="/inkooporders/te-verwerken" variant="secondary">Facturen keuren</LinkButton>}
        {!readOnly && <form action={mail.status === "archived" ? restoreReaderMail.bind(null, id) : archiveReaderMail.bind(null, id, backHref)}><SubmitButton variant="secondary" pendingLabel="Opslaan…"><Archive className="size-4" />{mail.status === "archived" ? "Terug naar inbox" : "Archiveren"}</SubmitButton></form>}
        <LinkButton href={`/inbox/${id}`} variant="ghost">Meer acties</LinkButton>
      </div>
      {mail.linkedPurchaseOrderId && <Link href={`/inkooporders/${mail.linkedPurchaseOrderId}`} className="mt-3 inline-block text-sm text-accent">Gekoppelde inkoopfactuur openen →</Link>}
    </div>
    {reply && !readOnly && mail.fromEmail && <div className="border-b border-border bg-background-soft/50 p-5 lg:p-6">
      <div className="mb-3 flex justify-between gap-3"><h3 className="font-medium">Antwoord controleren</h3><Link href={mailHref} className="text-sm text-muted"><ArrowLeft className="mr-1 inline size-3" />Sluiten</Link></div>
      {replyResult && <p className={`mb-3 text-sm ${replyResult === "1" ? "text-success" : "text-warning"}`}>{replyResult === "1" ? "Antwoord verstuurd." : "Antwoord niet verstuurd. Controleer je bericht en probeer opnieuw."}</p>}
      <Suspense fallback={<p className="text-sm text-muted">Antwoordformulier laden…</p>}><ReaderReply key={`${id}-${replyResult}`} mail={mail} suggestion={suggestion} returnTo={`${mailHref}&reply=1`} /></Suspense>
    </div>}
    {attachments.length > 0 && <div className="space-y-2 border-b border-border px-5 py-3">{attachments.map(a => <div key={a.id} className="flex flex-wrap items-center gap-3"><Link href={`/api/archief/${a.id}`} target="_blank" className="max-w-full break-words rounded-md border border-border px-3 py-2 text-xs hover:border-accent">📎 {a.filename}{a.sizeBytes ? ` · ${Math.ceil(a.sizeBytes / 1024)} kB` : ""}</Link>{!readOnly && magFactuurKlaarzetten && /\.(pdf|jpe?g|png|webp|xlsx?|xlsm)$/i.test(a.filename) && <QueueInvoiceButton emailId={id} attachmentId={a.id} status={a.reviewStatus} purchaseOrderId={a.purchaseOrderId} />}</div>)}{magFactuurKlaarzetten && <p className="text-xs text-muted">Klaarzetten boekt nog geen kosten. Goedkeuren en over projecten verdelen doe je bij Facturen keuren.</p>}</div>}
    <div className="p-5 lg:p-6">
      {mail.bodyHtml ? <iframe title="Inhoud van de mail" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" className="h-[85dvh] min-h-[32rem] w-full rounded-md bg-white"
        srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px/1.6 Arial,sans-serif;margin:16px;color:#263244;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${sanitizeMailHtml(mail.bodyHtml)}</body></html>`} />
        : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{mail.bodyText || "Dit bericht heeft geen tekstinhoud."}</p>}
    </div>
  </article>;
}
