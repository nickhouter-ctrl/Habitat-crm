import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import Link from "next/link";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { huidigeToegangOfNull } from "@/lib/auth/access";
import { mailZichtbaarVoor } from "@/lib/mail-visibility";
import { db } from "@/lib/db";
import { emailInbox, inboxSuggestions, purchaseInvoiceReviews } from "@/lib/db/schema";
import { nogRelevant } from "@/lib/assistant/achterhaald";
import { Card, PageHeader, LinkButton, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { MAIL_GROUPS, type MailGroup } from "@/lib/assistant/mail-rules";
import { loadQuoteChecks } from "@/lib/assistant/overview";
import { loadProjectFunding } from "@/lib/project-funding";
import { formatEUR } from "@/lib/utils";
import { prepareSuggestions, reviewSuggestion, restoreSuggestedMail } from "./actions";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Assistent — klaar ter controle") };
}
export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const { group = "all", status = "open", view: gevraagd = "mail" } = await searchParams;
  const ik = await huidigeToegangOfNull();
  const readOnly = !ik?.heeftCap("schrijven");
  // De tabbladen Projecten en Offertes gaan over dekking, marges en prijzen.
  // Wie geen bedragen mag zien, houdt het maildeel over — en dan hoeven de
  // zware funding- en prijscontrolequeries ook niet te draaien.
  const magBedragen = ik?.heeftCap("bedragen") ?? false;
  const view = magBedragen ? gevraagd : "mail";
  const [mails, funding, quotes, [invoices]] = await Promise.all([
    db.select({ suggestion: inboxSuggestions, subject: emailInbox.subject, from: emailInbox.fromEmail, received: emailInbox.receivedAt })
      .from(inboxSuggestions).innerJoin(emailInbox, eq(emailInbox.id, inboxSuggestions.emailId))
      // Openstaande voorstellen: alleen mail waar nog niets met is gedaan — niet
      // gelezen, niet gekoppeld, geen beslissing op de factuurkaart.
      // Het marketingpostvak is privé: haar voorstellen horen niet in de lijst
      // van iemand anders.
      .where(and(eq(inboxSuggestions.status, ["reviewed", "auto_archived"].includes(status) ? status : "open"), status === "open" ? nogRelevant : status === "auto_archived" ? undefined : ne(emailInbox.status, "archived"), mailZichtbaarVoor(ik?.email)))
      .orderBy(desc(emailInbox.receivedAt)).limit(200),
    magBedragen ? loadProjectFunding() : new Map<string, Awaited<ReturnType<typeof loadProjectFunding>> extends Map<string, infer V> ? V : never>(),
    magBedragen ? loadQuoteChecks() : [],
    ik?.magPad("/inkooporders/te-verwerken")
      ? db.select({ n: count() }).from(purchaseInvoiceReviews).where(eq(purchaseInvoiceReviews.status, "pending"))
      : [{ n: 0 }],
  ]);
  const urgent = mails.filter(m => m.suggestion.category === "urgent");
  const replies = mails.filter(m => m.suggestion.needsReply);
  const projects = [...funding.values()].filter(p => p.cover.status !== "gedekt" && p.cover.requiredRevenue > 0);
  const quoteAlerts = quotes.filter(q => q.checks.length);
  const visible = mails.filter(m => group === "all" || (group === "reply" ? m.suggestion.needsReply : m.suggestion.category === group));
  return <>
    <PageHeader title={uiT("Assistent")} subtitle={uiT("Klaar ter controle. Jullie beslissen wat wordt verstuurd, aangepast of verwerkt.")}
      actions={!readOnly ? <form action={prepareSuggestions}><SubmitButton pendingLabel={uiT("Voorstellen voorbereiden…")}>{uiT("Nieuwe mail voorbereiden")}</SubmitButton></form> : undefined} />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { title: uiT("Tijdgevoelige mail"), n: urgent.length, href: "/assistent?group=urgent" },
        { title: uiT("Te beantwoorden"), n: replies.length, href: "/assistent?group=reply" },
        ...(ik?.magPad("/inkooporders/te-verwerken")
          ? [{ title: uiT("Facturen keuren"), n: invoices.n, href: "/inkooporders/te-verwerken" }]
          : []),
        ...(magBedragen
          ? [{ title: uiT("Projecten met krappe dekking"), n: projects.length, href: "/assistent?view=projects" }]
          : []),
      ].map(c => <Link href={c.href} key={c.title}><Card className="h-full p-4 hover:border-accent"><p className="text-sm text-muted">{c.title}</p><p className="mt-2 text-3xl font-semibold">{c.n}</p></Card></Link>)}
    </div>
    <nav className="mb-5 flex gap-2" aria-label={uiT("Assistent onderdelen")}>
      {(magBedragen
        ? [["mail", "Mail"], ["projects", `Projecten (${projects.length})`], ["quotes", `Offertes (${quoteAlerts.length})`]]
        : [["mail", "Mail"]]
      ).map(([key, label]) => <Link key={key} href={`/assistent?view=${key}`} className={`rounded-lg border px-4 py-2 text-sm ${view === key ? "border-accent bg-accent/10 text-accent" : "border-border"}`}>{label}</Link>)}
    </nav>
    {!["projects", "quotes"].includes(view) && <Card className="mb-6 p-5">
      <h2 className="text-lg font-semibold">{uiT("Mail — voorstellen en concepten")}</h2>
      <p className="mt-1 text-sm text-muted">{uiT("Nieuwe CRM-mail uit de afgelopen 14 dagen wordt elke 5 minuten in groepen van maximaal 8 voorbereid. Hieronder maximaal 200 voorstellen. Alleen duidelijk herkenbare reclame wordt in het CRM opgeborgen. Geen Gmail-wijzigingen, automatische antwoorden of afmeldingen.")}</p>
      <div className="my-4 flex flex-wrap gap-2">
        {[["all", "Alles"], ["reply", "Te beantwoorden"], ...Object.entries(MAIL_GROUPS)].map(([key, label]) => <Link key={key} href={`/assistent?group=${key}&status=${["reviewed", "auto_archived"].includes(status) ? status : "open"}`} className={`rounded-md border px-3 py-2 text-sm ${group === key ? "border-accent text-accent" : "border-border text-muted"}`}>{label}</Link>)}
        <Link href="/assistent?status=auto_archived" className="px-3 py-2 text-sm text-accent">{uiT("Automatisch opgeborgen")}</Link>
        <Link href={status === "reviewed" ? "/assistent" : "/assistent?status=reviewed"} className="px-3 py-2 text-sm text-accent">{status === "reviewed" ? uiT("Openstaande voorstellen") : uiT("Gecontroleerde voorstellen")}</Link>
      </div>
      {!visible.length && <p className="py-5 text-sm text-muted">{uiT("Geen voorstellen in deze groep. Nieuwe voorstellen verschijnen na de voorbereiding.")}</p>}
      <div className="divide-y divide-border">{visible.map(({ suggestion: s, subject, from, received }) => <div key={s.id} className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-medium text-accent" href={`/inbox?status=all&mail=${s.emailId}`}>{subject || uiT("Zonder onderwerp")}</Link><Badge tone={s.category === "urgent" ? "warning" : "neutral"}>{MAIL_GROUPS[s.category as MailGroup]}</Badge></div>
        <p className="mt-1 text-xs text-muted">{from} · {received?.toLocaleDateString(uiDateLocale)} · {s.source === "ai" ? uiT("AI-voorstel") : uiT("Basisvoorstel — AI niet beschikbaar")}</p>
        <p className="mt-2 text-sm">{s.summary}</p><p className="mt-1 text-sm text-muted">{s.reason}</p>
        {s.deadline && <p className="mt-2 text-sm text-warning">{uiT("Termijn uit het bericht:")} {s.deadline}</p>}
        {s.draft && <details className="mt-3 rounded-md bg-background-soft p-3"><summary className="cursor-pointer text-sm">{uiT("Conceptantwoord bekijken")}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{s.draft}</p></details>}
        <div className="mt-3 flex flex-wrap gap-3"><LinkButton href={`/inbox?status=all&mail=${s.emailId}${s.draft ? "&reply=1" : ""}`} variant="secondary">{s.draft ? uiT("Concept controleren en bewerken") : uiT("Mail controleren")}</LinkButton>
          {!readOnly && !s.reviewedAt && ["open", "auto_archived"].includes(s.status) && <form action={reviewSuggestion.bind(null, s.id)}><SubmitButton variant="secondary" pendingLabel={uiT("Opslaan…")}>{uiT("Gecontroleerd")}</SubmitButton></form>}
          {!readOnly && s.status === "auto_archived" && <form action={restoreSuggestedMail.bind(null, s.id)}><SubmitButton variant="secondary" pendingLabel={uiT("Terugzetten…")}>{uiT("Terug naar inbox")}</SubmitButton></form>}
          {s.category === "receipt" && <LinkButton href="/inkooporders/te-verwerken" variant="ghost">{uiT("Facturen keuren")}</LinkButton>}
        </div>
      </div>)}</div>
    </Card>}
    {view === "projects" && <Card className="mb-6 p-5" id="projecten">
      <h2 className="text-lg font-semibold">{uiT("Projecten — voorschot voorbereiden")}</h2>
      <p className="mt-1 text-sm text-muted">{uiT("Dezelfde actuele berekening als op de projectpagina. Ontvangsten en doorbelasting excl. btw, inclusief projectopslagen en verkoopwaarde van eigen materialen. Nog niet gekeurde facturen tellen niet mee.")}</p>
      {!projects.length && <p className="mt-4 text-sm">{uiT("Geen actieve projecten met geboekt werk en krappe dekking.")}</p>}
      {projects.sort((a, b) => a.cover.saldo - b.cover.saldo).map(p => <div key={p.id} className="mt-4 rounded-lg border border-border p-4"><Link href={`/projects/${p.id}`} className="font-medium text-accent">{p.name}</Link>
        <p className="mt-2 text-sm">{uiT("Ontvangen")} {formatEUR(p.cover.received)} {uiT("· Doorbelasting")} {formatEUR(p.cover.requiredRevenue)} {uiT("· Resterende dekking")} <strong>{formatEUR(p.cover.saldo)}</strong></p>
        {p.cover.received === 0 && <p className="mt-2 text-sm text-warning">{uiT("Nog geen ontvangen betalingen geregistreerd. Controleer eerst of de betalingsregistratie compleet is.")}</p>}
        <p className="mt-2 text-sm">{uiT("Voorstel nieuw voorschot:")} <strong>{formatEUR(p.cover.suggestedRequestEur)}</strong> {uiT("excl. btw. Controleer planning en openstaande voorschotverzoeken voordat je dit overneemt.")}</p>
        <details className="mt-2 text-sm"><summary className="cursor-pointer text-accent">{uiT("Voorsteltekst bekijken")}</summary><p className="mt-2 whitespace-pre-wrap">{uiT("Beste klant,\n\nVoor de volgende werkzaamheden aan {v0} willen we een volgend voorschot met u afstemmen. Ons voorstel is {v1} exclusief btw. Na afstemming ontvangt u het bijbehorende voorschotdocument.\n\nMet vriendelijke groet,\nHabitat One", { v0: p.name, v1: formatEUR(p.cover.suggestedRequestEur) })}</p></details>
        <Link href={`/projects/${p.id}`} className="mt-3 inline-block text-sm text-accent">{uiT("Bedragen controleren en voorschot voorbereiden →")}</Link>
      </div>)}
    </Card>}
    {view === "quotes" && <Card className="p-5" id="offertes"><h2 className="text-lg font-semibold">{uiT("Offertes — prijscontrole")}</h2>
      <p className="mt-1 text-sm text-muted">{uiT("Controles op de laatste 100 conceptoffertes. Signalen zijn geen prijswijzigingen. Productkeuze, aantallen en volledigheid van de werkzaamheden blijven jullie inhoudelijke controle.")}</p>
      <p className="mt-3 text-sm">{quoteAlerts.length} {uiT("van")} {quotes.length} {uiT("conceptoffertes met aandachtspunten.")}</p>
      {quoteAlerts.map(q => <details key={q.id} className="mt-3 rounded-lg border border-border p-4"><summary className="cursor-pointer">{q.number || q.title || uiT("Conceptofferte")} · {q.checks.length} {uiT("aandachtspunten")}</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{q.checks.map((c, i) => <li key={i}>{c}</li>)}</ul><Link href={`/documents/${q.id}`} className="mt-3 inline-block text-sm text-accent">{uiT("Offerte controleren →")}</Link></details>)}
    </Card>}
  </>;
}
