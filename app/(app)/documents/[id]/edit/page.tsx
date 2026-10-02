import { tekst as uiTranslation } from '@/lib/i18n/server';
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentForm } from "@/components/document-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { normalizeDocItems, type DocKind } from "@/lib/documents";
import { getDocumentFormOptions } from "../../../_options";
import { updateDocument } from "../../actions";
import { documentKindMeta } from "../../../_meta";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Document bewerken") };
}

export default async function EditDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiT = await uiTranslation();
  const { id } = await params;
  const sp = await searchParams;

  const [doc, options] = await Promise.all([
    db.query.documents.findFirst({ where: eq(documents.id, id) }),
    getDocumentFormOptions(),
  ]);
  if (!doc) notFound();

  const update = updateDocument.bind(null, id);
  const kindLabel = uiT(documentKindMeta[doc.kind]);

  return (
    <>
      <PageHeader
        title={uiT("{v0} bewerken", { v0: kindLabel })}
        subtitle={doc.docNumber ?? doc.title ?? undefined}
        actions={
          <Link href={`/documents/${id}`} className="text-sm text-muted hover:underline">
            {uiT("← Terug")} </Link>
        }
      />
      {sp.error === "validation" && (
        <p className="mb-4 max-w-3xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {uiT("Controleer de gegevens (minstens één regel met een omschrijving).")} </p>
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
          items: normalizeDocItems(doc.items),
          isAdvance: doc.isAdvance,
          vatReverseCharge: doc.vatReverseCharge,
        }}
        contacts={options.contacts}
        deals={options.deals}
        properties={options.properties}
        projects={options.projects}
        products={options.products}
        submitLabel={uiT("Wijzigingen opslaan")}
      />
    </>
  );
}
