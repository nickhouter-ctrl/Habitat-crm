import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
  Textarea,
} from "@/components/ui";
import { Combobox, type ComboOption } from "@/components/combobox";
import { db } from "@/lib/db";
import { contacts, documents, products, projects, properties, users } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { attachDocumentToProject, deleteProject, setProjectStatus, updateProject } from "../actions";
import {
  applyStockOutFromDocument,
  approveEstimateToInvoice,
  cancelSaleReturnStock,
  reverseStockOutFromDocument,
} from "../../documents/actions";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();

  const [contactOpts, ownerOpts, propertyOpts, linkedDocs, unlinkedDocs] = await Promise.all([
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).orderBy(asc(contacts.name)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.email)),
    db.select({ id: properties.id, title: properties.title }).from(properties).orderBy(asc(properties.title)),
    db
      .select({
        id: documents.id,
        kind: documents.kind,
        status: documents.status,
        docNumber: documents.docNumber,
        title: documents.title,
        totalEur: documents.totalEur,
        issueDate: documents.issueDate,
        stockAppliedAt: documents.stockAppliedAt,
      })
      .from(documents)
      .where(eq(documents.projectId, id))
      .orderBy(desc(documents.issueDate), desc(documents.createdAt)),
    // Documenten die nog niet aan een project hangen — om hier te koppelen.
    db
      .select({
        id: documents.id,
        kind: documents.kind,
        docNumber: documents.docNumber,
        title: documents.title,
        totalEur: documents.totalEur,
      })
      .from(documents)
      .where(and(isNull(documents.projectId), inArray(documents.kind, ["invoice", "estimate", "creditnote"])))
      .orderBy(desc(documents.issueDate), desc(documents.createdAt))
      .limit(500),
  ]);

  // Marge per project (intern): omzet − kostprijs van factuurregels (facturen − creditnota's).
  const invoiceDocs = await db
    .select({ id: documents.id, kind: documents.kind, subtotalEur: documents.subtotalEur, items: documents.items })
    .from(documents)
    .where(and(eq(documents.projectId, id), inArray(documents.kind, ["invoice", "creditnote"])));
  const allPids = new Set<string>();
  const allSkus = new Set<string>();
  for (const d of invoiceDocs) {
    for (const it of normalizeDocItems(d.items)) {
      if (it.productId) allPids.add(it.productId);
      if (it.description?.trim()) allSkus.add(it.description.trim());
    }
  }
  const projCostRows =
    allPids.size || allSkus.size
      ? await db.query.products.findMany({
          where: or(
            allPids.size ? inArray(products.id, [...allPids]) : undefined,
            allSkus.size ? inArray(products.sku, [...allSkus]) : undefined,
          ),
          columns: { id: true, sku: true, costEur: true },
        })
      : [];
  const pCostById = new Map(projCostRows.map((p) => [p.id, Number(p.costEur ?? 0)]));
  const pCostBySku = new Map(
    projCostRows.filter((p) => p.sku).map((p) => [p.sku as string, Number(p.costEur ?? 0)]),
  );
  let projRevenue = 0;
  let projCost = 0;
  // Marge per factuur/creditnota (omzet ex. BTW − kostprijs van de regels).
  const marginByDoc = new Map<string, { margin: number; pct: number | null }>();
  for (const d of invoiceDocs) {
    const rev = Number(d.subtotalEur ?? 0);
    let cost = 0;
    for (const it of normalizeDocItems(d.items)) {
      const c =
        (it.productId ? pCostById.get(it.productId) : undefined) ??
        (it.description ? pCostBySku.get(it.description.trim()) : undefined);
      if (c != null && c > 0) cost += c * (Number(it.units) || 0);
    }
    marginByDoc.set(d.id, { margin: rev - cost, pct: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null });
    const sign = d.kind === "creditnote" ? -1 : 1;
    projRevenue += sign * rev;
    projCost += sign * cost;
  }
  const projMargin = projRevenue - projCost;
  const projMarginPct = projRevenue > 0 ? Math.round((projMargin / projRevenue) * 100) : null;

  // Producten in dit project: gereserveerd (uit geaccepteerde offertes) vs.
  // verkocht (uit facturen − creditnota's). Geeft inzicht in wat er naar de klus
  // gaat én wat er voor het project is gereserveerd.
  const projDocItems = await db
    .select({ kind: documents.kind, status: documents.status, items: documents.items })
    .from(documents)
    .where(and(eq(documents.projectId, id), inArray(documents.kind, ["estimate", "invoice", "creditnote"])));
  type Agg = {
    name: string;
    productId: string | null;
    reserved: number;
    sold: number;
    reservedAmt: number;
    soldAmt: number;
  };
  const prodAgg = new Map<string, Agg>();
  for (const d of projDocItems) {
    for (const it of normalizeDocItems(d.items)) {
      const key = it.productId || it.description?.trim() || it.name?.trim();
      if (!key || !it.units) continue;
      const entry =
        prodAgg.get(key) ??
        ({
          name: (it.name || it.description || "—").trim(),
          productId: it.productId ?? null,
          reserved: 0,
          sold: 0,
          reservedAmt: 0,
          soldAmt: 0,
        } satisfies Agg);
      const u = Number(it.units) || 0;
      const amt = (Number(it.price) || 0) * u;
      if (d.kind === "estimate" && d.status === "accepted") {
        entry.reserved += u;
        entry.reservedAmt += amt;
      } else if (d.kind === "invoice") {
        entry.sold += u;
        entry.soldAmt += amt;
      } else if (d.kind === "creditnote") {
        entry.sold -= u;
        entry.soldAmt -= amt;
      }
      prodAgg.set(key, entry);
    }
  }
  // Foto's ophalen voor de gekoppelde producten.
  const aggPids = [...prodAgg.values()].map((p) => p.productId).filter((x): x is string => !!x);
  const imgRows = aggPids.length
    ? await db
        .select({ id: products.id, imageUrl: products.imageUrl })
        .from(products)
        .where(inArray(products.id, aggPids))
    : [];
  const imgById = new Map(imgRows.map((r) => [r.id, r.imageUrl]));
  // Gereserveerd telt alleen wat nog niet verkocht is (reservering − verkocht).
  const aggList = [...prodAgg.values()].map((p) => ({
    ...p,
    image: p.productId ? (imgById.get(p.productId) ?? null) : null,
    reservedNet: Math.max(0, p.reserved - p.sold),
    reservedNetAmt: p.reserved > 0 ? Math.max(0, p.reserved - p.sold) * (p.reservedAmt / p.reserved) : 0,
  }));
  const reservedProducts = aggList
    .filter((p) => p.reservedNet > 0)
    .sort((a, b) => b.reservedNet - a.reservedNet);
  const soldProducts = aggList.filter((p) => p.sold !== 0).sort((a, b) => b.sold - a.sold);
  const projectProducts = aggList.filter((p) => p.reservedNet > 0 || p.sold !== 0);

  const contactOptions: ComboOption[] = contactOpts.map((c) => ({ value: c.id, label: c.name }));
  const ownerOptions: ComboOption[] = ownerOpts.map((u) => ({ value: u.id, label: u.name ?? u.email }));
  const propertyOptions: ComboOption[] = propertyOpts.map((p) => ({ value: p.id, label: p.title }));

  const action = updateProject.bind(null, id);
  const remove = deleteProject.bind(null, id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ background: project.color ?? "#9ca3af" }}
            />
            {project.name}
            {project.holdedProjectId ? (
              <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Holded
              </span>
            ) : null}
            <Badge
              tone={
                project.status === "active" ? "success" : project.status === "completed" ? "info" : "neutral"
              }
            >
              {project.status === "active" ? "Actief" : project.status === "completed" ? "Afgerond" : "Gearchiveerd"}
            </Badge>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {project.status === "completed" ? (
              <form action={setProjectStatus.bind(null, id, "active")}>
                <SubmitButton variant="secondary" pendingLabel="…">
                  Heropenen
                </SubmitButton>
              </form>
            ) : (
              <form action={setProjectStatus.bind(null, id, "completed")}>
                <SubmitButton variant="secondary" pendingLabel="Afronden…">
                  ✓ Afronden
                </SubmitButton>
              </form>
            )}
            <LinkButton href="/projects" variant="ghost">
              ← Overzicht
            </LinkButton>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Omzet (gefactureerd)"
          value={`€ ${projRevenue.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          tone="info"
        />
        <StatTile
          label="Marge"
          value={`€ ${projMargin.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${projMarginPct != null ? ` · ${projMarginPct}%` : ""}`}
          tone={projMargin < 0 ? "danger" : "success"}
        />
        <StatTile label="Documenten" value={String(linkedDocs.length)} tone="neutral" />
        <StatTile label="Producten" value={String(projectProducts.length)} tone="neutral" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent className="p-5">
            <form action={action} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Naam" htmlFor="name">
                  <Input id="name" name="name" required defaultValue={project.name} />
                </Field>
                <Field label="Code (optioneel)" htmlFor="code" hint="korte projectcode, bv. VER">
                  <Input id="code" name="code" defaultValue={project.code ?? ""} />
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={project.status}>
                    <option value="active">Actief</option>
                    <option value="completed">Afgerond</option>
                    <option value="archived">Gearchiveerd</option>
                  </Select>
                </Field>
                <Field label="Verantwoordelijke" htmlFor="ownerId">
                  <Combobox
                    name="ownerId"
                    options={ownerOptions}
                    defaultValue={project.ownerId ?? ""}
                    placeholder="— geen — / kies medewerker"
                    clearable
                  />
                </Field>
                <Field label="Klant" htmlFor="contactId">
                  <Combobox
                    name="contactId"
                    options={contactOptions}
                    defaultValue={project.contactId ?? ""}
                    placeholder="— geen — / zoek contact"
                    clearable
                  />
                </Field>
                <Field label="Pand (optioneel)" htmlFor="propertyId">
                  <Combobox
                    name="propertyId"
                    options={propertyOptions}
                    defaultValue={project.propertyId ?? ""}
                    placeholder="— geen — / zoek pand"
                    clearable
                  />
                </Field>
                <Field label="Startdatum" htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" defaultValue={project.startDate ?? ""} />
                </Field>
                <Field label="Einddatum (gepland)" htmlFor="endDate">
                  <Input id="endDate" name="endDate" type="date" defaultValue={project.endDate ?? ""} />
                </Field>
              </div>
              <Field label="Omschrijving" htmlFor="description">
                <Textarea id="description" name="description" rows={4} defaultValue={project.description ?? ""} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <SubmitButton pendingLabel="Opslaan…">Opslaan</SubmitButton>
                {!project.holdedProjectId && (
                  <ConfirmSubmit
                    formAction={remove}
                    message="Dit project definitief verwijderen?"
                    pendingLabel="Verwijderen…"
                    className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    Project verwijderen
                  </ConfirmSubmit>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Aangemaakt</span>
                <span>{new Date(project.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Bijgewerkt</span>
                <span>{new Date(project.updatedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {project.holdedProjectId && (
                <div className="flex justify-between gap-3 border-t pt-1.5">
                  <span className="text-muted">Holded-ID</span>
                  <span className="truncate font-mono text-xs">{project.holdedProjectId}</span>
                </div>
              )}
              {project.code && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Code</span>
                  <span className="font-medium">{project.code}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documenten in dit project</CardTitle>
              <span className="text-xs text-muted">{linkedDocs.length}</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {invoiceDocs.length > 0 && (
                <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs">
                  <span className="text-muted">Marge (intern · gefactureerd)</span>
                  <span
                    className={`tabular-nums font-medium ${projMargin < 0 ? "text-danger" : "text-foreground"}`}
                  >
                    €{" "}
                    {projMargin.toLocaleString("nl-NL", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {projMarginPct != null ? ` · ${projMarginPct}%` : ""}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <LinkButton
                  href={`/documents/new?kind=estimate&projectId=${id}${project.contactId ? `&contactId=${project.contactId}` : ""}${project.propertyId ? `&propertyId=${project.propertyId}` : ""}`}
                  variant="secondary"
                  className="text-xs"
                >
                  + Nieuwe offerte
                </LinkButton>
                <LinkButton
                  href={`/documents/new?kind=invoice&projectId=${id}${project.contactId ? `&contactId=${project.contactId}` : ""}${project.propertyId ? `&propertyId=${project.propertyId}` : ""}`}
                  variant="ghost"
                  className="text-xs"
                >
                  + Nieuwe factuur
                </LinkButton>
              </div>

              {/* Bestaand document (factuur/offerte) aan dit project koppelen. */}
              {unlinkedDocs.length > 0 && (
                <form action={attachDocumentToProject.bind(null, id)} className="flex items-center gap-2 rounded-md bg-background px-2 py-2">
                  <Select name="documentId" defaultValue="" className="h-8 flex-1 text-xs" required>
                    <option value="" disabled>
                      Bestaande factuur/offerte koppelen…
                    </option>
                    {unlinkedDocs.map((d) => {
                      const k = d.kind === "invoice" ? "Factuur" : d.kind === "estimate" ? "Offerte" : "Creditnota";
                      return (
                        <option key={d.id} value={d.id}>
                          {k} {d.docNumber ?? "(geen nr.)"}
                          {d.title ? ` — ${d.title}` : ""} · €{" "}
                          {Number(d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </option>
                      );
                    })}
                  </Select>
                  <SubmitButton pendingLabel="Koppelen…" className="h-8 px-3 text-xs">
                    Koppel
                  </SubmitButton>
                </form>
              )}

              {linkedDocs.length === 0 ? (
                <p className="text-muted">
                  Nog niets gekoppeld — gebruik de knoppen hierboven, of kies dit project in het projectveld bij het bewerken van een bestaand document.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linkedDocs.map((d) => {
                    const kindLabel = d.kind === "invoice" ? "Factuur" : d.kind === "estimate" ? "Offerte" : d.kind === "creditnote" ? "Creditnota" : d.kind === "deliverynote" ? "Pakbon" : d.kind;
                    const isSale = d.kind === "invoice" || d.kind === "deliverynote";
                    const voided = d.status === "void";
                    const booked = !!d.stockAppliedAt;
                    return (
                      <li key={d.id} className="rounded-md border border-border/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/documents/${d.id}`} className="truncate hover:underline">
                            <span className="font-medium">{kindLabel}</span>{" "}
                            <span className="text-muted">{d.docNumber ?? "(geen nr.)"}</span>
                            {d.title && <span className="ml-1 text-xs text-muted">— {d.title}</span>}
                          </Link>
                          <span className={`shrink-0 text-xs tabular-nums ${voided ? "text-muted line-through" : "text-muted"}`}>
                            € {Number(d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {(d.kind === "invoice" || d.kind === "creditnote") && marginByDoc.has(d.id) && (
                          <div className="mt-0.5 text-[11px] text-muted">
                            Marge:{" "}
                            <span className={marginByDoc.get(d.id)!.margin < 0 ? "font-medium text-danger" : "font-medium text-foreground"}>
                              € {marginByDoc.get(d.id)!.margin.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {marginByDoc.get(d.id)!.pct != null ? ` · ${marginByDoc.get(d.id)!.pct}%` : ""}
                            </span>
                          </div>
                        )}
                        {isSale && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {voided ? (
                              <Badge tone="danger">Geannuleerd</Badge>
                            ) : booked ? (
                              <>
                                <Badge tone="success">Voorraad afgeboekt</Badge>
                                <ConfirmSubmit
                                  formAction={reverseStockOutFromDocument.bind(null, d.id)}
                                  message="Voorraad-afboeking terugdraaien? De stuks komen weer in voorraad."
                                  pendingLabel="…"
                                  className="rounded px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-muted/50"
                                >
                                  Terugdraaien
                                </ConfirmSubmit>
                              </>
                            ) : (
                              <ConfirmSubmit
                                formAction={applyStockOutFromDocument.bind(null, d.id)}
                                message="Voorraad van deze factuur nu afboeken?"
                                pendingLabel="…"
                                className="rounded px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50"
                              >
                                Voorraad afboeken
                              </ConfirmSubmit>
                            )}
                            {!voided && (
                              <ConfirmSubmit
                                formAction={cancelSaleReturnStock.bind(null, d.id)}
                                message="Deze verkoop annuleren? De factuur wordt op 'geannuleerd' gezet en de voorraad komt terug."
                                pendingLabel="Annuleren…"
                                className="rounded px-2 py-0.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10"
                              >
                                Annuleren
                              </ConfirmSubmit>
                            )}
                          </div>
                        )}
                        {d.kind === "estimate" && d.status !== "rejected" && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {d.status === "accepted" && <Badge tone="info">Gereserveerd</Badge>}
                            <ConfirmSubmit
                              formAction={approveEstimateToInvoice.bind(null, d.id)}
                              message="Een factuur aanmaken van deze offerte? De gereserveerde producten gaan naar verkocht; je belandt op de nieuwe factuur om te versturen."
                              pendingLabel="Bezig…"
                              className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                            >
                              {d.status === "accepted" ? "→ Factuur maken (verkopen)" : "✓ Goedkeuren → factuur"}
                            </ConfirmSubmit>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {(reservedProducts.length > 0 || soldProducts.length > 0) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Gereserveerd</CardTitle>
              <span className="text-xs text-muted">
                {reservedProducts.length} {reservedProducts.length === 1 ? "product" : "producten"}
              </span>
            </CardHeader>
            {reservedProducts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Niets gereserveerd — uit geaccepteerde offertes.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Aantal</Th>
                    <Th className="text-right">Bedrag</Th>
                  </tr>
                </THead>
                <TBody>
                  {reservedProducts.map((p, i) => (
                    <Tr key={i}>
                      <Td>
                        <ProductCell image={p.image} name={p.name} />
                      </Td>
                      <Td className="text-right tabular-nums text-warning">{p.reservedNet}</Td>
                      <Td className="text-right tabular-nums text-muted">{euro(p.reservedNetAmt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="border-t px-5 py-3 text-xs text-muted">
              Uit geaccepteerde offertes; keur een offerte goed om naar verkocht te boeken.
            </p>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Verkocht</CardTitle>
              <span className="text-xs text-muted">
                {soldProducts.length} {soldProducts.length === 1 ? "product" : "producten"}
              </span>
            </CardHeader>
            {soldProducts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Nog niets verkocht — uit facturen.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Aantal</Th>
                    <Th className="text-right">Bedrag</Th>
                  </tr>
                </THead>
                <TBody>
                  {soldProducts.map((p, i) => (
                    <Tr key={i}>
                      <Td>
                        <ProductCell image={p.image} name={p.name} />
                      </Td>
                      <Td className="text-right tabular-nums text-success">{p.sold}</Td>
                      <Td className="text-right tabular-nums text-muted">{euro(p.soldAmt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="border-t px-5 py-3 text-xs text-muted">Uit facturen (minus creditnota's).</p>
          </Card>
        </div>
      )}
    </>
  );
}

function euro(n: number): string {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProductCell({ image, name }: { image: string | null; name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-9 w-9 shrink-0 rounded border border-border object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded border border-border bg-muted" />
      )}
      <span className="font-medium">{name}</span>
    </div>
  );
}
