import { ilike, or } from "drizzle-orm";
import { Search } from "lucide-react";
import Link from "next/link";

import { Badge, Card, CardHeader, CardTitle, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { contacts, documents, products, projects, properties } from "@/lib/db/schema";
import {
  contactTypeMeta,
  documentKindMeta,
  documentStatusMeta,
  leadStageMeta,
  propertyStatusMeta,
} from "../_meta";

export const metadata = { title: "Zoeken" };

function ResultSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-xs text-muted">{count}</span>
      </CardHeader>
      <ul className="divide-y">{children}</ul>
    </Card>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-background">
        {children}
      </Link>
    </li>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const searchForm = (
    <form className="relative mb-6 max-w-md" action="/search">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input name="q" defaultValue={q} autoFocus placeholder="Zoek in contacten, projecten, panden, producten, documenten…" className="pl-8" />
    </form>
  );

  if (q.length < 2) {
    return (
      <>
        <PageHeader title="Zoeken" subtitle="Typ minstens 2 tekens" />
        {searchForm}
      </>
    );
  }

  const like = `%${q}%`;
  const [cs, prjs, ps, prs, docs] = await Promise.all([
    db.query.contacts.findMany({
      where: or(ilike(contacts.name, like), ilike(contacts.email, like)),
      orderBy: contacts.name,
      limit: 12,
      columns: { id: true, name: true, email: true, type: true, stage: true },
    }),
    db.query.projects.findMany({
      where: or(ilike(projects.name, like), ilike(projects.code, like)),
      limit: 12,
      columns: { id: true, name: true, status: true, code: true },
    }),
    db.query.properties.findMany({
      where: or(ilike(properties.title, like), ilike(properties.reference, like), ilike(properties.location, like)),
      limit: 12,
      columns: { id: true, title: true, reference: true, status: true, location: true },
    }),
    db.query.products.findMany({
      where: or(ilike(products.name, like), ilike(products.sku, like), ilike(products.category, like), ilike(products.collection, like)),
      orderBy: products.name,
      limit: 20,
      columns: { id: true, name: true, category: true, collection: true },
    }),
    db.query.documents.findMany({
      where: or(ilike(documents.docNumber, like), ilike(documents.title, like)),
      limit: 12,
      columns: { id: true, kind: true, docNumber: true, title: true, status: true },
    }),
  ]);

  const total = cs.length + prjs.length + ps.length + prs.length + docs.length;

  return (
    <>
      <PageHeader title="Zoeken" subtitle={`${total} resultaat${total === 1 ? "" : "en"} voor "${q}"`} />
      {searchForm}

      {total === 0 ? (
        <EmptyState title="Niets gevonden" description="Probeer een ander zoekwoord." />
      ) : (
        <div className="space-y-4">
          <ResultSection title="Contacten" count={cs.length}>
            {cs.map((c) => (
              <Row key={c.id} href={`/contacts/${c.id}`}>
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.email && <span className="ml-2 text-xs text-muted">{c.email}</span>}
                </span>
                <Badge tone={c.type === "lead" ? leadStageMeta[c.stage].tone : contactTypeMeta[c.type].tone}>
                  {c.type === "lead" ? leadStageMeta[c.stage].label : contactTypeMeta[c.type].label}
                </Badge>
              </Row>
            ))}
          </ResultSection>

          <ResultSection title="Projecten" count={prjs.length}>
            {prjs.map((p) => (
              <Row key={p.id} href={`/projects/${p.id}`}>
                <span>
                  <span className="font-medium">{p.name}</span>
                  {p.code && <span className="ml-2 text-xs text-muted">{p.code}</span>}
                </span>
                <Badge tone={p.status === "active" ? "success" : "neutral"}>
                  {p.status === "active" ? "Actief" : "Gearchiveerd"}
                </Badge>
              </Row>
            ))}
          </ResultSection>

          <ResultSection title="Panden" count={ps.length}>
            {ps.map((p) => (
              <Row key={p.id} href={`/properties/${p.id}`}>
                <span>
                  <span className="font-medium">{p.title}</span>
                  {(p.reference || p.location) && (
                    <span className="ml-2 text-xs text-muted">{[p.reference, p.location].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
                <Badge tone={propertyStatusMeta[p.status].tone}>{propertyStatusMeta[p.status].label}</Badge>
              </Row>
            ))}
          </ResultSection>

          <ResultSection title="Producten" count={prs.length}>
            {prs.map((p) => (
              <Row key={p.id} href={`/products/${p.id}/edit`}>
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted">{[p.collection, p.category].filter(Boolean).join(" › ") || "—"}</span>
              </Row>
            ))}
          </ResultSection>

          <ResultSection title="Offertes & facturen" count={docs.length}>
            {docs.map((d) => (
              <Row key={d.id} href={`/documents/${d.id}`}>
                <span>
                  <span className="font-medium">
                    {documentKindMeta[d.kind]} {d.docNumber ?? "(geen nr.)"}
                  </span>
                  {d.title && <span className="ml-2 text-xs text-muted">{d.title}</span>}
                </span>
                <Badge tone={documentStatusMeta[d.status].tone}>{documentStatusMeta[d.status].label}</Badge>
              </Row>
            ))}
          </ResultSection>
        </div>
      )}
    </>
  );
}
