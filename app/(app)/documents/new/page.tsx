import { count, eq } from "drizzle-orm";
import Link from "next/link";

import { DocumentForm } from "@/components/document-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { suggestDocNumber, type DocKind } from "@/lib/documents";
import { getDocumentFormOptions } from "../../_options";
import { createDocument } from "../actions";
import { documentKindMeta } from "../../_meta";

export const metadata = { title: "Nieuw document" };

const VALID_KINDS: DocKind[] = ["estimate", "proforma", "invoice", "creditnote", "salesreceipt"];

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kindParam = typeof params.kind === "string" ? params.kind : "estimate";
  const kind = (VALID_KINDS.includes(kindParam as DocKind) ? kindParam : "estimate") as DocKind;
  const kindLabel = documentKindMeta[kind];

  const [options, [{ n }]] = await Promise.all([
    getDocumentFormOptions(),
    db.select({ n: count() }).from(documents).where(eq(documents.kind, kind)),
  ]);

  const defaults = {
    contactId: typeof params.contactId === "string" ? params.contactId : undefined,
    dealId: typeof params.dealId === "string" ? params.dealId : undefined,
    propertyId: typeof params.propertyId === "string" ? params.propertyId : undefined,
  };

  const backHref = kind === "invoice" ? "/invoices" : kind === "estimate" ? "/quotes" : "/quotes";

  return (
    <>
      <PageHeader
        title={`Nieuwe ${kindLabel.toLowerCase()}`}
        subtitle="Stel de regels samen — totalen en BTW worden automatisch berekend"
        actions={
          <Link href={backHref} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
        }
      />
      {params.error === "validation" && (
        <p className="mb-4 max-w-3xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (minstens één regel met een omschrijving).
        </p>
      )}
      <DocumentForm
        action={createDocument}
        kind={kind}
        defaultDocNumber={suggestDocNumber(kind, n)}
        contacts={options.contacts}
        deals={options.deals}
        properties={options.properties}
        defaults={defaults}
        submitLabel={`${kindLabel} aanmaken`}
      />
    </>
  );
}
