import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentForm } from "@/components/document-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { DocKind } from "@/lib/documents";
import { getDocumentFormOptions } from "../../../_options";
import { updateDocument } from "../../actions";
import { documentKindMeta } from "../../../_meta";

export const metadata = { title: "Document bewerken" };

export default async function EditDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [doc, options] = await Promise.all([
    db.query.documents.findFirst({ where: eq(documents.id, id) }),
    getDocumentFormOptions(),
  ]);
  if (!doc) notFound();

  const update = updateDocument.bind(null, id);
  const kindLabel = documentKindMeta[doc.kind];

  return (
    <>
      <PageHeader
        title={`${kindLabel} bewerken`}
        subtitle={doc.docNumber ?? doc.title ?? undefined}
        actions={
          <Link href={`/documents/${id}`} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
        }
      />
      {sp.error === "validation" && (
        <p className="mb-4 max-w-3xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (minstens één regel met een omschrijving).
        </p>
      )}
      <DocumentForm
        action={update}
        kind={doc.kind as DocKind}
        doc={{
          docNumber: doc.docNumber,
          status: doc.status,
          title: doc.title,
          contactId: doc.contactId,
          dealId: doc.dealId,
          propertyId: doc.propertyId,
          projectId: doc.projectId,
          issueDate: doc.issueDate,
          dueDate: doc.dueDate,
          notes: doc.notes,
          items: doc.items,
        }}
        contacts={options.contacts}
        deals={options.deals}
        properties={options.properties}
        projects={options.projects}
        products={options.products}
        submitLabel="Wijzigingen opslaan"
      />
    </>
  );
}
