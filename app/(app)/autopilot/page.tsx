import { tekst as uiTranslation } from "@/lib/i18n/server";
import Link from "next/link";
import { Badge, Card, Input, PageHeader, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireModuleRead } from "@/lib/auth/guards";
import { recentAccountDecisions } from "@/lib/autopilot/accounts";
import { recentLaborDecisions } from "@/lib/autopilot/labor-invoices";
import { lessonStats } from "@/lib/autopilot/lessons";
import { listProposals, MIN_MARGIN_PCT } from "@/lib/autopilot/quotes";
import { formatEUR } from "@/lib/utils";
import { dismissProposal, sendProposal } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Autopilot") };
}

export default async function AutopilotPage() {
  const toegang = await requireModuleRead("assistent");
  const uiT = await uiTranslation();
  if (!toegang.heeftCap("bedragen")) return <p className="text-sm text-muted">{uiT("Geen toegang tot bedragen.")}</p>;
  const [open, done, accounts, stats, labor] = await Promise.all([
    listProposals(["ready", "review"]),
    listProposals(["sent", "rejected"], 14),
    recentAccountDecisions(14),
    lessonStats(14),
    recentLaborDecisions(14),
  ]);

  return (
    <>
      <PageHeader
        title={uiT("Autopilot")}
        subtitle={uiT("Offertes en antwoorden die het systeem klaarzet. Meekijkperiode: er gaat niets vanzelf naar klanten — jij verstuurt, het systeem leert van je aanpassingen.")}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.kind} className="p-4">
            <p className="text-sm text-muted">{s.kind === "mail" ? uiT("Mailconcepten ongewijzigd verstuurd") : uiT("Offertes ongewijzigd verstuurd")}</p>
            <p className="text-2xl font-semibold">{s.pct == null ? "—" : `${s.pct}%`}</p>
            <p className="text-xs text-muted">{s.unchanged} / {s.total} · {uiT("laatste 14 dagen")}</p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-sm text-muted">{uiT("Accounts automatisch goedgekeurd")}</p>
          <p className="text-2xl font-semibold">{accounts.filter((a) => a.approved).length}</p>
          <p className="text-xs text-muted">{accounts.filter((a) => !a.approved).length} {uiT("naar jou")} · {uiT("laatste 14 dagen")}</p>
        </Card>
      </div>

      <h2 className="mb-2 text-lg font-semibold">{uiT("Offertes ter goedkeuring")}</h2>
      {open.length === 0 && <p className="mb-6 text-sm text-muted">{uiT("Niets te doen.")}</p>}
      <div className="mb-8 space-y-4">
        {open.map((p) => (
          <Card key={p.requestId} className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={p.status === "ready" ? "success" : "warning"}>{p.status === "ready" ? uiT("Klopt — klaar om te versturen") : uiT("Even naar kijken")}</Badge>
              <span className="font-semibold">{p.customer}</span>
              <span className="text-sm text-muted">{p.email}</span>
              <span className="ml-auto text-sm">
                {formatEUR(p.total)} {uiT("incl. btw")} · {uiT("marge")} {p.marginPct == null ? "?" : `${p.marginPct}%`} ({uiT("min.")} {MIN_MARGIN_PCT}%)
              </span>
            </div>
            {p.reasons.length > 0 && (
              <ul className="mb-2 list-disc pl-5 text-sm text-danger">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            )}
            {p.warnings.length > 0 && (
              <ul className="mb-2 list-disc pl-5 text-sm text-muted">{p.warnings.map((r) => <li key={r}>{r}</li>)}</ul>
            )}
            {p.lines.length > 0 && (
              <table className="mb-3 w-full text-sm">
                <tbody>
                  {p.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1">{l.name}</td>
                      <td className="py-1 text-right">{l.units} {l.unit ?? ""}</td>
                      <td className="py-1 text-right">{formatEUR(l.price)}</td>
                      <td className="py-1 text-right text-muted">{l.cost == null ? uiT("kostprijs ?") : `${uiT("kost")} ${formatEUR(l.cost)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mb-3 flex flex-wrap gap-3 text-sm">
              {p.documentId && <Link className="text-accent hover:underline" href={`/documents/${p.documentId}`}>{uiT("Offerte openen/aanpassen")} {p.docNumber}</Link>}
              <Link className="text-accent hover:underline" href={`/aanvragen/${p.requestId}`}>{uiT("Aanvraag bekijken")}</Link>
            </div>
            <form action={sendProposal.bind(null, p.requestId)} className="space-y-2">
              <Input name="subject" defaultValue={p.subject} aria-label={uiT("Onderwerp")} />
              <Textarea name="message" defaultValue={p.body} rows={8} aria-label={uiT("Bericht")} />
              <div className="flex gap-2">
                <SubmitButton pendingLabel={uiT("Bezig…")}>{p.documentId ? uiT("Offerte versturen") : uiT("Mail versturen")}</SubmitButton>
              </div>
            </form>
            <form action={dismissProposal.bind(null, p.requestId)} className="mt-2">
              <SubmitButton variant="secondary" size="sm" pendingLabel={uiT("Bezig…")}>{uiT("Zelf afhandelen")}</SubmitButton>
            </form>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 text-lg font-semibold">{uiT("Accountaanvragen")}</h2>
      <Card className="mb-8 divide-y">
        {accounts.length === 0 && <p className="p-4 text-sm text-muted">{uiT("Nog geen aanvragen beoordeeld.")}</p>}
        {accounts.map((a) => (
          <div key={a.requestId} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <Badge tone={a.approved ? "success" : "warning"}>{a.approved ? uiT("Goedgekeurd") : uiT("Naar jou")}</Badge>
            <span className="font-medium">{a.name}</span>
            <span className="text-muted">{a.email} · {a.kind}</span>
            {!a.approved && <span className="w-full text-danger">{a.reasons.join(" · ")}</span>}
          </div>
        ))}
        <div className="p-3 text-sm"><Link className="text-accent hover:underline" href="/accounts">{uiT("Naar klantaccounts")}</Link></div>
      </Card>

      <h2 className="mb-2 text-lg font-semibold">{uiT("Urenfacturen")}</h2>
      <Card className="mb-8 divide-y">
        {labor.length === 0 && <p className="p-4 text-sm text-muted">{uiT("Nog geen urenfacturen met urenstaat verwerkt.")}</p>}
        {labor.map((l) => (
          <div key={l.reviewId} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <Badge tone={l.outcome === "approved" ? "success" : l.outcome === "returned" ? "neutral" : "warning"}>
              {l.outcome === "approved" ? uiT("Geboekt") : l.outcome === "returned" ? uiT("Teruggestuurd") : uiT("Naar jou")}
            </Badge>
            <span className="font-medium">{l.reference ?? l.supplier}</span>
            {l.amount != null && <span className="text-muted">{formatEUR(l.amount)}</span>}
            {l.summary && <span className="text-muted">· {l.summary}</span>}
            {l.reasons.length > 0 && <span className={`w-full ${l.outcome === "approved" ? "text-muted" : "text-danger"}`}>{l.reasons.join(" · ")}</span>}
          </div>
        ))}
        <div className="p-3 text-sm"><Link className="text-accent hover:underline" href="/inkooporders/te-verwerken">{uiT("Naar facturen keuren")}</Link></div>
      </Card>

      {done.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-semibold">{uiT("Afgehandeld")}</h2>
          <Card className="divide-y">
            {done.map((p) => (
              <div key={p.requestId} className="flex flex-wrap gap-2 p-3 text-sm">
                <Badge tone={p.status === "sent" ? "success" : "neutral"}>{p.status === "sent" ? uiT("Verstuurd") : uiT("Zelf afgehandeld")}</Badge>
                <span className="font-medium">{p.customer}</span>
                <span className="text-muted">{formatEUR(p.total)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
