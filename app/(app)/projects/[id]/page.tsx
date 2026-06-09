import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
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
  Textarea,
} from "@/components/ui";
import { Combobox, type ComboOption } from "@/components/combobox";
import { db } from "@/lib/db";
import { contacts, documents, products, projects, properties, users } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { deleteProject, updateProject } from "../actions";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();

  const [contactOpts, ownerOpts, propertyOpts, linkedDocs] = await Promise.all([
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
      })
      .from(documents)
      .where(eq(documents.projectId, id))
      .orderBy(desc(documents.issueDate), desc(documents.createdAt)),
  ]);

  // Marge per project (intern): omzet − kostprijs van factuurregels (facturen − creditnota's).
  const invoiceDocs = await db
    .select({ kind: documents.kind, subtotalEur: documents.subtotalEur, items: documents.items })
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
  for (const d of invoiceDocs) {
    const sign = d.kind === "creditnote" ? -1 : 1;
    projRevenue += sign * Number(d.subtotalEur ?? 0);
    for (const it of normalizeDocItems(d.items)) {
      const cost =
        (it.productId ? pCostById.get(it.productId) : undefined) ??
        (it.description ? pCostBySku.get(it.description.trim()) : undefined);
      if (cost != null && cost > 0) projCost += sign * cost * (Number(it.units) || 0);
    }
  }
  const projMargin = projRevenue - projCost;
  const projMarginPct = projRevenue > 0 ? Math.round((projMargin / projRevenue) * 100) : null;

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
            <Badge tone={project.status === "active" ? "success" : "neutral"}>
              {project.status === "active" ? "Actief" : "Gearchiveerd"}
            </Badge>
          </span>
        }
        actions={
          <LinkButton href="/projects" variant="ghost">
            ← Overzicht
          </LinkButton>
        }
      />

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
              {linkedDocs.length === 0 ? (
                <p className="text-muted">
                  Nog niets gekoppeld — gebruik de knop hierboven, of kies dit project in het projectveld bij het bewerken van een bestaand document.
                </p>
              ) : (
                <ul className="space-y-1">
                  {linkedDocs.map((d) => {
                    const kindLabel = d.kind === "invoice" ? "Factuur" : d.kind === "estimate" ? "Offerte" : d.kind === "creditnote" ? "Creditnota" : d.kind === "deliverynote" ? "Pakbon" : d.kind;
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <Link href={`/documents/${d.id}`} className="truncate hover:underline">
                          <span className="font-medium">{kindLabel}</span>{" "}
                          <span className="text-muted">{d.docNumber ?? "(geen nr.)"}</span>
                          {d.title && <span className="ml-1 text-xs text-muted">— {d.title}</span>}
                        </Link>
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          € {Number(d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
