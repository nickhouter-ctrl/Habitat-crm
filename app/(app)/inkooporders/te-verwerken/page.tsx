import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import { createPoFromEmail, dismissEmailFromQueue } from "../actions";

export const metadata = { title: "Te verwerken — inkoop" };

const FINANCIAL = ["supplier-invoice", "freight-invoice", "agent-fee-china", "agent-fee-spain", "opex"];
const isProforma = (f: string) => /\bproforma\b|\bquotation\b|\bquote\b|^PI[\s._-]|\bPI\s+for\b/i.test(f);

const CAT_LABEL: Record<string, string> = {
  "supplier-invoice": "Leveranciersfactuur",
  "freight-invoice": "Vracht",
  "agent-fee-china": "Allpack / handling",
  "agent-fee-spain": "Agent (ES)",
  opex: "Kosten",
};

const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function TeVerwerkenPage() {
  const rows = await db
    .select({
      emailId: emailInbox.id,
      subject: emailInbox.subject,
      fromName: emailInbox.fromName,
      fromEmail: emailInbox.fromEmail,
      receivedAt: emailInbox.receivedAt,
      attId: mailAttachments.id,
      filename: mailAttachments.filename,
      category: mailAttachments.category,
      supplierTag: mailAttachments.supplierTag,
      amountEur: mailAttachments.amountEur,
    })
    .from(mailAttachments)
    .innerJoin(emailInbox, eq(emailInbox.id, mailAttachments.emailId))
    .where(
      and(
        isNull(emailInbox.linkedPurchaseOrderId),
        ne(emailInbox.status, "archived"),
        inArray(mailAttachments.category, FINANCIAL),
      ),
    )
    .orderBy(desc(emailInbox.receivedAt));

  // Groepeer per e-mail; proforma's tellen niet mee als te-betalen.
  type Item = {
    emailId: string;
    subject: string | null;
    from: string;
    receivedAt: Date | null;
    supplier: string | null;
    categories: Set<string>;
    amount: number;
    files: string[];
  };
  const byEmail = new Map<string, Item>();
  for (const r of rows) {
    if (isProforma(r.filename)) continue;
    let it = byEmail.get(r.emailId);
    if (!it) {
      it = {
        emailId: r.emailId,
        subject: r.subject,
        from: r.fromName || r.fromEmail || "—",
        receivedAt: r.receivedAt,
        supplier: r.supplierTag,
        categories: new Set(),
        amount: 0,
        files: [],
      };
      byEmail.set(r.emailId, it);
    }
    it.categories.add(r.category);
    it.files.push(r.filename);
    const amt = Number(r.amountEur ?? 0);
    if (amt > it.amount) it.amount = amt;
    if (!it.supplier && r.supplierTag) it.supplier = r.supplierTag;
  }
  const items = [...byEmail.values()];

  return (
    <>
      <PageHeader
        title="Te verwerken"
        subtitle={`${items.length} e-mail(s) met een factuur-bijlage die nog niet aan een inkooporder hangen`}
        actions={
          <LinkButton href="/inkooporders" variant="ghost">
            ← Inkooporders
          </LinkButton>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Niets te verwerken"
          description="Alle binnengekomen factuur-mails zijn aan een inkooporder gekoppeld of geseponeerd."
          action={<LinkButton href="/inkooporders">Naar inkooporders</LinkButton>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.emailId}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{it.supplier ?? "(leverancier onbekend)"}</span>
                    {[...it.categories].map((c) => (
                      <Badge key={c} tone={c === "agent-fee-china" ? "info" : "neutral"}>
                        {CAT_LABEL[c] ?? c}
                      </Badge>
                    ))}
                    {it.amount > 0 ? (
                      <span className="text-sm font-semibold tabular-nums">{formatEUR(it.amount)}</span>
                    ) : (
                      <span className="text-xs text-warning">bedrag niet uitgelezen</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted" title={it.subject ?? ""}>
                    {it.subject ?? "(geen onderwerp)"}
                  </p>
                  <p className="text-xs text-muted">
                    {it.from} · {fmtDate(it.receivedAt)} · {it.files.length} bijlage{it.files.length === 1 ? "" : "n"}
                  </p>
                  <p className="mt-1 break-all text-[11px] text-muted">{it.files.join(" · ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={createPoFromEmail.bind(null, it.emailId)}>
                    <SubmitButton size="sm" variant="primary" pendingLabel="Bezig…">
                      → Maak inkooporder
                    </SubmitButton>
                  </form>
                  <form action={dismissEmailFromQueue.bind(null, it.emailId)}>
                    <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">
                      Negeren
                    </SubmitButton>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
