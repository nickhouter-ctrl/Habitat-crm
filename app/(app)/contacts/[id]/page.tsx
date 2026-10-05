import { salesContactActivityFilter } from "@/lib/auth/sales-scope";
import { datumTaal } from "@/lib/i18n/server";
import { ActionDialog } from "@/components/action-dialog";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Phone,
  StickyNote,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Textarea,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  activities,
  contacts,
  documents,
  holdedSyncMap,
  products,
  projects,
  sentEmails,
} from "@/lib/db/schema";
import { ContactOnlineAccess } from "@/components/contact-online-access";
import { cn, formatDate, formatEUR } from "@/lib/utils";
import { normalizeDocItems } from "@/lib/documents";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { AccountReminderButton } from "@/components/account-reminder-button";
import { ReminderButton } from "@/components/reminder-button";
import { ReviewRequestButton } from "@/components/review-request-button";
import { dossierConfigured } from "@/lib/contact-dossier";
import { getWindowsReport } from "@/lib/windows-report";
import { requireModuleRead } from "@/lib/auth/guards";
import { WindowsOverview } from "@/components/windows-overview";
import { windowsPortalHref } from "@/lib/windows-financials";
import { addContactNote, deleteContact, verversContactDossier } from "../actions";
import {
  contactTypeMeta,
  documentKindMeta,
  documentStatusMeta,
  languageMeta,
  leadStageMeta,
} from "../../_meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    columns: { name: true },
  });
  return { title: contact?.name ?? "Contact" };
}

function InfoRow({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted" />
      <span>{children}</span>
    </div>
  );
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ik = await requireModuleRead("contacts");
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const { id } = await params;
  const sp = await searchParams;
  const magBedragen = ik?.heeftCap("bedragen") ?? false;

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    with: {
      owner: { columns: { name: true, email: true } },
      company: { columns: { id: true, name: true } },
    },
  });
  if (!contact) notFound();

  const windowsReport = magBedragen ? await getWindowsReport(id) : null;
  const hasWindows = (windowsReport?.dealers.length??0) > 0;

  const [relatedProjects, relatedDocs, timeline, holdedMap] = await Promise.all([
    magBedragen ? db.query.projects.findMany({
      where: eq(projects.contactId, id),
      orderBy: desc(projects.updatedAt),
    }) : [],
    magBedragen ? db.query.documents.findMany({
      where: eq(documents.contactId, id),
      orderBy: desc(documents.createdAt),
    }) : [],
    db.query.activities.findMany({
      where: and(eq(activities.contactId, id),salesContactActivityFilter(ik?.rol)),
      orderBy: desc(activities.createdAt),
      limit: 50,
      with: { author: { columns: { name: true } } },
    }),
    db.query.holdedSyncMap.findFirst({
      where: and(
        eq(holdedSyncMap.entityType, "contact"),
        eq(holdedSyncMap.localId, id),
      ),
    }),
  ]);

  async function submitNote(formData: FormData) {
    "use server";
    await addContactNote(id, String(formData.get("body") ?? ""));
  }

  const addressParts = [
    contact.addressLine,
    [contact.postalCode, contact.city].filter(Boolean).join(" "),
    contact.province,
    contact.country,
  ].filter(Boolean);

  // KPI's uit de documenten van dit contact.
  const num = (v: unknown) => Number(v ?? 0);
  const estimates = relatedDocs.filter((d) => d.kind === "estimate");
  const invoices = relatedDocs.filter((d) => d.kind === "invoice" && d.status !== "void");
  const creditnotes = relatedDocs.filter((d) => d.kind === "creditnote" && d.status !== "void");
  // Omzet = verstuurde/betaalde facturen − creditnota's (incl. BTW).
  const omzet =
    invoices.filter((d) => d.status !== "draft").reduce((s, d) => s + num(d.totalEur), 0) -
    creditnotes.reduce((s, d) => s + num(d.totalEur), 0);
  const openstaand = invoices
    .filter((d) => d.status !== "paid")
    .reduce((s, d) => s + (num(d.totalEur) - num(d.paidEur)), 0);
  const geoffreerd = estimates
    .filter((d) => d.status !== "rejected" && d.status !== "void")
    .reduce((s, d) => s + num(d.totalEur), 0);
  // Conversie: offertes die tot een factuur leidden (via bron-offerte-koppeling).
  const invoicedEstimateIds = new Set(
    invoices.map((d) => d.sourceDocumentId).filter(Boolean) as string[],
  );
  const conversie = estimates.length
    ? Math.round((invoicedEstimateIds.size / estimates.length) * 100)
    : 0;
  const isZakelijk = !!contact.company;

  // Marge (intern) over alle gefactureerde regels met bekende kostprijs — om te
  // kunnen aantonen wat er werkelijk op deze klant verdiend is.
  const marginDocs = relatedDocs.filter(
    (d) => (d.kind === "invoice" || d.kind === "creditnote") && d.status !== "void" && d.status !== "draft",
  );
  const marginItems = marginDocs.flatMap((d) =>
    normalizeDocItems(d.items).map((it) => ({ it, sign: d.kind === "creditnote" ? -1 : 1 })),
  );
  const mPids = [...new Set(marginItems.map((x) => x.it.productId).filter(Boolean) as string[])];
  const mSkus = [...new Set(marginItems.map((x) => x.it.description?.trim()).filter(Boolean) as string[])];
  const mCostRows =
    mPids.length || mSkus.length
      ? await db.query.products.findMany({
          where: or(
            mPids.length ? inArray(products.id, mPids) : undefined,
            mSkus.length ? inArray(products.sku, mSkus) : undefined,
          ),
          columns: { id: true, sku: true, costEur: true },
        })
      : [];
  const mCostById = new Map(mCostRows.map((p) => [p.id, Number(p.costEur ?? 0)]));
  const mCostBySku = new Map(
    mCostRows.filter((p) => p.sku).map((p) => [p.sku as string, Number(p.costEur ?? 0)]),
  );
  let margeRevenue = 0;
  let margeCost = 0;
  let margeCosted = 0;
  for (const { it, sign } of marginItems) {
    const cost =
      (it.productId ? mCostById.get(it.productId) : undefined) ??
      (it.description ? mCostBySku.get(it.description.trim()) : undefined);
    if (cost != null && cost > 0) {
      const net = (Number(it.price) || 0) * (Number(it.units) || 0) * (1 - (Number(it.discount) || 0) / 100);
      margeRevenue += sign * net;
      margeCost += sign * cost * (Number(it.units) || 0);
      margeCosted++;
    }
  }
  const klantMarge = margeRevenue - margeCost;
  const klantMargePct = margeRevenue > 0 ? Math.round((klantMarge / margeRevenue) * 100) : null;
  const margeTotalLines = marginItems.length;

  const ALLE_TABS = [
    { key: "overzicht", label: uiT("Overzicht") },
    { key: "offertes", label: uiT("Offertes") },
    { key: "facturen", label: uiT("Facturen") },
    { key: "pakbonnen", label: uiT("Pakbonnen") },
    { key: "projecten", label: uiT("Projecten") },
    { key: "kozijnen", label: uiT("Kozijnen") },
    { key: "archief", label: uiT("Archief") },
  ] as const;
  type Tab = (typeof ALLE_TABS)[number]["key"];
  // Wie geen bedragen mag zien, houdt het overzicht: gegevens, notities en
  // mailhistorie. De tabbladen met offertes, facturen, pakbonnen, projecten en
  // het archief staan vol met bedragen en vallen dus weg — ook als het tabblad
  // met de hand in de URL wordt gezet.
  const TABS = magBedragen ? ALLE_TABS : ALLE_TABS.filter((t) => t.key === "overzicht");
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "overzicht";
  const offertesList = relatedDocs.filter((d) => d.kind === "estimate");
  const facturenList = relatedDocs.filter((d) => d.kind === "invoice" || d.kind === "creditnote");
  const pakbonnenList = relatedDocs.filter((d) => d.kind === "deliverynote");
  // Openstaande posten + verstuurde herinneringen voor het archief.
  const openInvoices = facturenList.filter(
    (d) => d.kind === "invoice" && d.status !== "paid" && d.status !== "void" && d.status !== "draft" && num(d.totalEur) - num(d.paidEur) > 0.01,
  );
  const hasOpenInvoices = openInvoices.length > 0;
  // Verstuurde mails (herinneringen, aanmaningen, reviews) — met bewaarde inhoud.
  const sentMails = magBedragen ? await db.query.sentEmails.findMany({
    where: eq(sentEmails.contactId, id),
    orderBy: desc(sentEmails.createdAt),
    limit: 50,
  }) : [];

  // Documenten per project (voor de uitklapbare Projecten-tab).
  const projectIds = relatedProjects.map((p) => p.id);
  const projectDocs = projectIds.length
    ? await db.query.documents.findMany({
        where: inArray(documents.projectId, projectIds),
        columns: {
          id: true,
          projectId: true,
          kind: true,
          status: true,
          docNumber: true,
          totalEur: true,
          issueDate: true,
          items: true,
          sourceDocumentId: true,
        },
        orderBy: desc(documents.issueDate),
      })
    : [];
  const docsByProject = new Map<string, typeof projectDocs>();
  for (const d of projectDocs) {
    if (!d.projectId) continue;
    const arr = docsByProject.get(d.projectId);
    if (arr) arr.push(d);
    else docsByProject.set(d.projectId, [d]);
  }
  // Producten per project (uit factuurregels − creditnota's).
  const productsForProject = (pid: string) => {
    const m = new Map<string, { name: string; units: number }>();
    for (const d of docsByProject.get(pid) ?? []) {
      if (d.kind !== "invoice" && d.kind !== "creditnote") continue;
      const sign = d.kind === "creditnote" ? -1 : 1;
      for (const it of normalizeDocItems(d.items)) {
        const key = it.productId || it.description?.trim() || it.name?.trim();
        if (!key || !it.units) continue;
        const e = m.get(key) ?? { name: (it.name || it.description || "—").trim(), units: 0 };
        e.units += sign * (Number(it.units) || 0);
        m.set(key, e);
      }
    }
    return [...m.values()].filter((p) => Math.abs(p.units) > 0.001);
  };
  const tabHref = (key: Tab) => (key === "overzicht" ? `/contacts/${id}` : `/contacts/${id}?tab=${key}`);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {contact.name}
            {contact.type === "lead" ? (
              <Badge tone={leadStageMeta[contact.stage].tone}>
                {uiT(leadStageMeta[contact.stage].label)}
              </Badge>
            ) : (
              <Badge tone={contactTypeMeta[contact.type].tone}>
                {uiT(contactTypeMeta[contact.type].label)}
              </Badge>
            )}
            <Badge tone={isZakelijk ? "info" : "neutral"}>
              {isZakelijk ? uiT("Zakelijk") : uiT("Particulier")}
            </Badge>
          </span>
        }
        subtitle={
          <>
            {contact.jobTitle ? `${contact.jobTitle} · ` : ""}
            {contact.company ? (
              <Link href={`/contacts?q=${encodeURIComponent(contact.company.name)}`}>
                {contact.company.name}
              </Link>
            ) : (
              uiT("Geen bedrijf")
            )}
          </>
        }
        actions={
          <>
            {ik?.magModule('klantopvolging') && <LinkButton href={`/opvolging/${id}`} variant="primary">{uiT("Opvolging")}</LinkButton>}
            <LinkButton href={`/contacts/${id}/edit`} variant="secondary">{uiT("Bewerken")}</LinkButton>
            <Link href="/contacts" className="text-sm text-muted hover:underline">
              {uiT("← Contacten")} </Link>
            {ik?.magModule("klantaccounts")&&<Link href="#online-toegang" className="text-sm underline">{uiT("Online toegang")}</Link>}
            {magBedragen&&<form action={deleteContact.bind(null, id)} className="contents">
              <ConfirmSubmit
                message={uiT("Contact \"{v0}\" definitief verwijderen?", { v0: contact.name })}
                className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
              >
                {uiT("Verwijderen")} </ConfirmSubmit>
            </form>}
          </>
        }
      />

      {ik?.magModule("klantaccounts")&&<ContactOnlineAccess contactId={id} email={contact.email} />}

      {sp.verwijderen === "facturen" && (
        <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {uiT("Dit contact kan niet verwijderd worden — er hangen nog verstuurde of betaalde facturen aan. Verwijder of ontkoppel die eerst.")} </p>
      )}

      {magBedragen && tab !== "kozijnen" && <div className="mb-4"><ActionDialog title={uiT("Financieel overzicht")} wide><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={uiT("Totale omzet")} value={formatEUR(omzet)} hint={uiT("gefactureerd, incl. BTW")} tone="success" />
        <StatTile label={uiT("Openstaand")} value={formatEUR(openstaand)} hint={uiT("te ontvangen")} tone={openstaand > 0 ? "warning" : "neutral"} />
        {margeCosted > 0 && (
          <StatTile
            label={uiT("Marge (intern)")}
            value={`${formatEUR(klantMarge)}${klantMargePct != null ? ` · ${klantMargePct}%` : ""}`}
            hint={
              margeCosted < margeTotalLines
                ? uiT("over {v0}/{v1} regels met kostprijs", { v0: margeCosted, v1: margeTotalLines })
                : uiT("verdiend op deze klant")
            }
            tone={klantMarge <= 0 ? "danger" : klantMargePct != null && klantMargePct < 15 ? "warning" : "neutral"}
          />
        )}
        <StatTile label={uiT("Totaal geoffreerd")} value={formatEUR(geoffreerd)} hint={uiT("lopende offertes")} />
        <StatTile label={uiT("Offertes")} value={String(estimates.length)} hint={uiT("{v0} gefactureerd", { v0: invoicedEstimateIds.size })} />
        <StatTile label={uiT("Conversie")} value={`${conversie}%`} hint={uiT("offerte → factuur")} tone="info" />
      </div></ActionDialog></div>}

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.filter(t => t.key !== "kozijnen" || hasWindows).map((t) => {
          const cnt =
            t.key === "offertes"
              ? offertesList.length
              : t.key === "facturen"
                ? facturenList.length
                : t.key === "pakbonnen"
                  ? pakbonnenList.length
                  : t.key === "projecten"
                    ? relatedProjects.length
                    : 0;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {uiT(t.label)}
              {cnt > 0 ? ` (${cnt})` : ""}
            </Link>
          );
        })}
      </div>

      {hasWindows && windowsReport && tab === "overzicht" && (
        <Card className="mb-5">
          <CardHeader><CardTitle>{uiT("Kozijnen · Habitat One Windows")}</CardTitle><Link href={tabHref("kozijnen")} className="text-sm text-accent hover:underline">{uiT("Bekijk kozijnendashboard →")}</Link></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3 text-sm">
              <div><p className="text-muted">{uiT("Orderwaarde excl. btw")}</p><strong>{formatEUR(windowsReport.totals.dealer)}</strong><p className="text-xs text-muted">{windowsReport.totals.orders} {uiT("orders ·")} {windowsReport.totals.elements} {uiT("kozijnen")}</p></div>
              <div><p className="text-muted">{uiT("Open offertes excl. btw")}</p><strong>{formatEUR(windowsReport.quotes.openValue)}</strong><p className="text-xs text-muted">{windowsReport.quotes.open} {uiT("offertes · laatste versies")}</p></div>
              <div><p className="text-muted">{uiT("Openstaande Windows-facturen incl. btw")}</p><strong>{formatEUR(windowsReport.totals.open)}</strong><p className="text-xs text-muted">{uiT("Betaald:")} {formatEUR(windowsReport.totals.paidGross)}</p></div>
            </div>
            <p className="mt-3 text-xs text-muted">{uiT("Windows-overzicht. Facturen die ook in het CRM staan zijn dezelfde facturen; tel beide overzichten niet bij elkaar op.")}</p>
          </CardContent>
        </Card>
      )}
      {tab === "kozijnen" && windowsReport && (hasWindows ? <div className="space-y-4">
        <div className="flex flex-wrap gap-3">{windowsReport.dealers.map(d => <LinkButton key={d.id} href={windowsPortalHref(`/admin/dealers/${d.id}`)} variant="secondary" target="_blank" rel="noreferrer" prefetch={false}>{uiT("Windows-dashboard ·")} {d.companyName || d.email}</LinkButton>)}</div>
        <WindowsOverview report={windowsReport} scoped />
      </div> : <Card className="p-5 text-sm text-muted">{uiT("Aan dit CRM-contact is geen Windows-account gekoppeld.")}</Card>)}

      {tab === "offertes" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{uiT("Offertes")}</CardTitle>
            <LinkButton href={`/documents/new?kind=estimate&contactId=${contact.id}`} variant="secondary" size="sm">
              {uiT("Nieuwe offerte")} </LinkButton>
          </CardHeader>
          {offertesList.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Geen offertes voor deze klant.")}</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{uiT("Nr.")}</Th>
                  <Th>{uiT("Status")}</Th>
                  <Th>{uiT("Datum")}</Th>
                  <Th className="text-right">{uiT("Totaal")}</Th>
                </tr>
              </THead>
              <TBody>
                {offertesList.map((doc) => (
                  <Tr key={doc.id}>
                    <Td className="font-medium">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.docNumber ?? uiT("(geen nr.)")}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={documentStatusMeta[doc.status].tone}>
                        {uiT(documentStatusMeta[doc.status].label)}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(doc.issueDate, uiDateLocale)}</Td>
                    <Td className="text-right tabular-nums">{formatEUR(doc.totalEur)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "facturen" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{uiT("Facturen")}</CardTitle>
            <span className="flex flex-wrap items-center gap-2">
              {hasOpenInvoices && contact.email && (
                <AccountReminderButton contactId={contact.id} />
              )}
              <LinkButton href={`/documents/new?kind=invoice&contactId=${contact.id}`} variant="secondary" size="sm">
                {uiT("Nieuwe factuur")} </LinkButton>
            </span>
          </CardHeader>
          {facturenList.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Geen facturen voor deze klant.")}</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{uiT("Nr.")}</Th>
                  <Th>{uiT("Type")}</Th>
                  <Th>{uiT("Status")}</Th>
                  <Th>{uiT("Datum")}</Th>
                  <Th className="text-right">{uiT("Totaal")}</Th>
                  <Th className="text-right">{uiT("Betaald")}</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {facturenList.map((doc) => (
                  <Tr key={doc.id}>
                    <Td className="font-medium">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.docNumber ?? uiT("(geen nr.)")}
                      </Link>
                    </Td>
                    <Td>{uiT(documentKindMeta[doc.kind])}</Td>
                    <Td>
                      <Badge tone={documentStatusMeta[doc.status].tone}>
                        {uiT(documentStatusMeta[doc.status].label)}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(doc.issueDate, uiDateLocale)}</Td>
                    <Td className="text-right tabular-nums">{formatEUR(doc.totalEur)}</Td>
                    <Td className="text-right tabular-nums text-muted">{formatEUR(doc.paidEur)}</Td>
                    <Td className="text-right">
                      {doc.kind === "invoice" &&
                        doc.status !== "paid" &&
                        doc.status !== "void" &&
                        doc.status !== "draft" &&
                        num(doc.totalEur) - num(doc.paidEur) > 0.01 && (
                          <ReminderButton documentId={doc.id} />
                        )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "pakbonnen" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{uiT("Pakbonnen")}</CardTitle>
          </CardHeader>
          {pakbonnenList.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Geen pakbonnen voor deze klant.")}</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{uiT("Nr.")}</Th>
                  <Th>{uiT("Status")}</Th>
                  <Th>{uiT("Datum")}</Th>
                  <Th className="text-right">{uiT("Afgeleverd")}</Th>
                </tr>
              </THead>
              <TBody>
                {pakbonnenList.map((doc) => (
                  <Tr key={doc.id}>
                    <Td className="font-medium">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.docNumber ?? uiT("(geen nr.)")}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={documentStatusMeta[doc.status].tone}>
                        {uiT(documentStatusMeta[doc.status].label)}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(doc.issueDate, uiDateLocale)}</Td>
                    <Td className="text-right text-muted">
                      {doc.stockAppliedAt ? formatDate(doc.stockAppliedAt, uiDateLocale) : "—"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "projecten" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{uiT("Projecten")}</CardTitle>
            <LinkButton href="/projects/new" variant="secondary" size="sm">
              {uiT("Nieuw project")} </LinkButton>
          </CardHeader>
          {relatedProjects.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Geen gekoppelde projecten.")}</p>
            </CardContent>
          ) : (
            <div className="divide-y">
              {relatedProjects.map((p) => {
                const docs = docsByProject.get(p.id) ?? [];
                // Per bron-offerte: hoeveel is er al gefactureerd?
                const invoicedByEst = new Map<string, number>();
                for (const d of docs) {
                  if (d.kind === "invoice" && d.status !== "void" && d.sourceDocumentId) {
                    invoicedByEst.set(
                      d.sourceDocumentId,
                      (invoicedByEst.get(d.sourceDocumentId) ?? 0) + Number(d.totalEur ?? 0),
                    );
                  }
                }
                // Verberg offertes die al volledig gefactureerd zijn (de factuur staat er al).
                const visibleDocs = docs.filter((d) => {
                  if (d.kind !== "estimate") return true;
                  return (invoicedByEst.get(d.id) ?? 0) < Number(d.totalEur ?? 0) - 0.01;
                });
                const prods = productsForProject(p.id);
                return (
                  <details key={p.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 hover:bg-background">
                      <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                      <span className="font-medium">{p.name}</span>
                      {p.code ? <span className="text-xs text-muted">{p.code}</span> : null}
                      <Badge tone={p.status === "active" ? "success" : "neutral"}>
                        {p.status === "active" ? uiT("Actief") : uiT("Gearchiveerd")}
                      </Badge>
                      <span className="ml-auto text-xs text-muted">
                        {visibleDocs.length} {uiT(visibleDocs.length === 1 ? "document" : "documenten")}
                      </span>
                    </summary>
                    <div className="space-y-3 bg-background/40 px-5 pb-4 pt-1">
                      {visibleDocs.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                            {uiT("Documenten")} </p>
                          <ul className="space-y-1 text-sm">
                            {visibleDocs.map((d) => (
                              <li key={d.id} className="flex flex-wrap items-center gap-2">
                                <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                                  {d.docNumber ?? uiT(documentKindMeta[d.kind])}
                                </Link>
                                <span className="text-muted">{uiT(documentKindMeta[d.kind])}</span>
                                <Badge tone={documentStatusMeta[d.status].tone}>
                                  {uiT(documentStatusMeta[d.status].label)}
                                </Badge>
                                <span className="ml-auto tabular-nums">{formatEUR(d.totalEur)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {prods.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                            {uiT("Producten (verkocht)")} </p>
                          <ul className="space-y-0.5 text-sm">
                            {prods.map((pr, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="truncate">{pr.name}</span>
                                <span className="shrink-0 tabular-nums text-muted">{pr.units}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Link
                        href={`/projects/${p.id}`}
                        className="inline-block text-sm font-medium text-accent hover:underline"
                      >
                        {uiT("Open project →")} </Link>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "archief" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Openstaand")}</CardTitle>
              {hasOpenInvoices && contact.email && <AccountReminderButton contactId={contact.id} />}
            </CardHeader>
            <CardContent>
              {hasOpenInvoices ? (
                <p className="text-sm">
                  <strong>{openInvoices.length}</strong> {uiT(openInvoices.length === 1 ? "openstaande factuur" : "openstaande facturen")} {uiT("· totaal")}{" "}
                  <strong>{formatEUR(openstaand)}</strong> {uiT("incl. btw.")} {!contact.email && (
                    <span className="text-danger"> {uiT("Geen e-mailadres bekend.")}</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted">{uiT("Geen openstaande facturen. 🎉")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Tevredenheid & review")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted">
                {uiT("Vraag de klant om een Google-review. (Automatisch ±3 weken na levering zodra de review-mails aanstaan.)")} </p>
              {contact.email ? (
                <ReviewRequestButton contactId={contact.id} />
              ) : (
                <p className="text-sm text-danger">{uiT("Geen e-mailadres bekend.")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Verstuurde e-mails")}</CardTitle>
            </CardHeader>
            <CardContent>
              {sentMails.length === 0 ? (
                <p className="text-sm text-muted">
                  {uiT("Nog geen e-mails verstuurd vanuit het CRM. Eerder verstuurde herinneringen vind je in de tijdlijn onder Overzicht.")} </p>
              ) : (
                <ol className="space-y-2">
                  {sentMails.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-3 border-b border-border pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <Badge tone={m.kind === "review" ? "accent" : "warning"}>
                            {m.kind === "review"
                              ? uiT("Review")
                              : m.kind === "document"
                                ? uiT("Document")
                                : uiT("Herinnering")}
                          </Badge>
                          <span className="truncate font-medium">{m.subject}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {formatDate(m.createdAt, uiDateLocale)} {uiT("· naar")} {m.toEmail ?? "—"}
                        </span>
                      </span>
                      <Link
                        href={`/sent-mail/${m.id}`}
                        className="shrink-0 text-xs font-medium text-accent hover:underline"
                      >
                        {uiT("Bekijk mail →")} </Link>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Alle facturen & creditnota's")}</CardTitle>
            </CardHeader>
            {facturenList.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">{uiT("Nog geen facturen.")}</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>{uiT("Nr.")}</Th>
                    <Th>{uiT("Type")}</Th>
                    <Th>{uiT("Status")}</Th>
                    <Th>{uiT("Datum")}</Th>
                    <Th className="text-right">{uiT("Totaal")}</Th>
                    <Th className="text-right">{uiT("Betaald")}</Th>
                  </tr>
                </THead>
                <TBody>
                  {facturenList.map((doc) => (
                    <Tr key={doc.id}>
                      <Td className="font-medium">
                        <Link href={`/documents/${doc.id}`} className="hover:underline">
                          {doc.docNumber ?? uiT("(geen nr.)")}
                        </Link>
                      </Td>
                      <Td>{uiT(documentKindMeta[doc.kind])}</Td>
                      <Td>
                        <Badge tone={documentStatusMeta[doc.status].tone}>
                          {uiT(documentStatusMeta[doc.status].label)}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{formatDate(doc.issueDate, uiDateLocale)}</Td>
                      <Td className="text-right tabular-nums">{formatEUR(doc.totalEur)}</Td>
                      <Td className="text-right tabular-nums text-muted">{formatEUR(doc.paidEur)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "overzicht" && (
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Gegevens")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {contact.email ? (
                <InfoRow icon={Mail}>
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </InfoRow>
              ) : null}
              {contact.mobile || contact.phone ? (
                <InfoRow icon={Phone}>
                  {contact.mobile ?? contact.phone}
                  {contact.mobile && contact.phone ? ` · ${contact.phone}` : ""}
                </InfoRow>
              ) : null}
              {addressParts.length > 0 && (
                <InfoRow icon={MapPin}>{addressParts.join(", ")}</InfoRow>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-sm">
                <dt className="text-muted">{uiT("Eigenaar")}</dt>
                <dd>{contact.owner?.name ?? "—"}</dd>
                <dt className="text-muted">{uiT("Taal")}</dt>
                <dd>
                  {contact.preferredLanguage
                    ? uiT(languageMeta[contact.preferredLanguage])
                    : "—"}
                </dd>
                <dt className="text-muted">{uiT("Bron")}</dt>
                <dd>{contact.source ?? "—"}</dd>
                <dt className="text-muted">{uiT("Laatste contact")}</dt>
                <dd>{formatDate(contact.lastContactedAt, uiDateLocale)}</dd>
                <dt className="text-muted">{uiT("Aangemaakt")}</dt>
                <dd>{formatDate(contact.createdAt, uiDateLocale)}</dd>
              </dl>
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {contact.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {ik?.rol!=="sales" && contact.notes && (
            <Card>
              <CardHeader>
                <CardTitle>{uiT("Notitie")}</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {contact.notes}
              </CardContent>
            </Card>
          )}

          <ActionDialog title={uiT("Holded")} wide><Card>
            <CardHeader>
              <CardTitle>{uiT("Holded")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {holdedMap ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <dt className="text-muted">{uiT("Holded-id")}</dt>
                  <dd className="font-mono text-xs">{holdedMap.holdedId}</dd>
                  <dt className="text-muted">{uiT("Laatste sync")}</dt>
                  <dd>{formatDate(holdedMap.lastSyncedAt, uiDateLocale)}</dd>
                  <dt className="text-muted">{uiT("Richting")}</dt>
                  <dd>{holdedMap.lastSyncDirection ?? "—"}</dd>
                </dl>
              ) : (
                <p className="text-muted">{uiT("Nog niet gekoppeld aan Holded.")}</p>
              )}
            </CardContent>
          </Card></ActionDialog>
        </div>

        {/* Right: timeline */}
        <div className="space-y-4 lg:col-span-2">
          {magBedragen && (contact.aiDossier || dossierConfigured()) && (
            <ActionDialog title={uiT("AI-dossier")} wide><Card>
              <CardHeader>
                <CardTitle>{uiT("🤖 Dossier")}</CardTitle>
                <div className="flex items-center gap-2">
                  {contact.aiDossierAt && (
                    <span className="text-xs text-muted">
                      {uiT("bijgewerkt")} {formatDate(contact.aiDossierAt, uiDateLocale)}
                    </span>
                  )}
                  {dossierConfigured() && (
                    <form action={verversContactDossier.bind(null, contact.id)}>
                      <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("AI leest alles…")}>
                        {uiT("Ververs")} </SubmitButton>
                    </form>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {contact.aiDossier ? (
                  <DossierTekst tekst={contact.aiDossier} />
                ) : (
                  <p className="text-sm text-muted">
                    {uiT("Nog geen dossier — klik op Ververs en de AI vat alle feiten over deze klant samen (projecten, offertes, mails, betalingen). Alleen feiten uit het CRM, niets verzonnen.")} </p>
                )}
              </CardContent>
            </Card></ActionDialog>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Tijdlijn")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActionDialog title={uiT("Notitie toevoegen")}><form action={submitNote} className="space-y-2">
                <Textarea
                  name="body"
                  placeholder={uiT("Notitie toevoegen (gesprek, afspraak, …)")}
                  required
                  className="min-h-20"
                />
                <Button type="submit" size="sm">
                  {uiT("Notitie toevoegen")} </Button>
              </form></ActionDialog>

              {timeline.length === 0 ? (
                <EmptyState title={uiT("Nog geen activiteiten")} />
              ) : (
                <ol className="space-y-3">
                  {timeline.map((a) => {
                    const subject = a.subject ?? "";
                    const isReminder =
                      a.type === "email" && /herinner|aanmaning/i.test(subject);
                    const meta = isReminder
                      ? { label: uiT("Betaalherinnering"), Icon: Bell, tone: "bg-amber-500/10 text-amber-600" }
                      : a.type === "email"
                        ? { label: uiT("E-mail"), Icon: Mail, tone: "bg-blue-500/10 text-blue-600" }
                        : a.type === "call"
                          ? { label: uiT("Telefoon"), Icon: Phone, tone: "bg-muted/40 text-muted" }
                          : a.type === "meeting"
                            ? { label: uiT("Afspraak"), Icon: CalendarClock, tone: "bg-muted/40 text-muted" }
                            : a.type === "task"
                              ? { label: uiT("Taak"), Icon: CalendarClock, tone: "bg-muted/40 text-muted" }
                              : { label: uiT("Notitie"), Icon: StickyNote, tone: "bg-muted/40 text-muted" };
                    const Icon = meta.Icon;
                    return (
                      <li key={a.id} className="flex gap-3">
                        <span
                          className={cn(
                            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                            meta.tone,
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span className="font-medium text-foreground">{uiT(meta.label)}</span>
                            <span>·</span>
                            <span>{formatDate(a.createdAt, uiDateLocale)}</span>
                            {a.author?.name && (
                              <>
                                <span>·</span>
                                <span>{a.author.name}</span>
                              </>
                            )}
                          </div>
                          {a.subject && <p className="text-sm font-medium">{a.subject}</p>}
                          {a.body && (
                            <p className="whitespace-pre-wrap text-sm text-muted">{a.body}</p>
                          )}
                          {a.documentId && (
                            <Link
                              href={`/documents/${a.documentId}`}
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                            >
                              <FileText className="size-3" /> {uiT("Bekijk document")} </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </>
  );
}

/** Dossier-tekst: regels renderen, **kopjes** vet (simpele markdown-bold). */
function DossierTekst({ tekst }: { tekst: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {tekst.split("\n").map((regel, i) => {
        if (!regel.trim()) return <div key={i} className="h-1.5" />;
        const delen = regel.split(/\*\*(.+?)\*\*/g);
        return (
          <p key={i} className="whitespace-pre-wrap">
            {delen.map((deel, j) => (j % 2 === 1 ? <strong key={j}>{deel}</strong> : deel))}
          </p>
        );
      })}
    </div>
  );
}
