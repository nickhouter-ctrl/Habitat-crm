import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { offerteDefaults } from "@/lib/email";
import { sendDocumentCustom } from "../../actions";

export const metadata = { title: "Versturen" };

export default async function SendDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: { id: true, kind: true, docNumber: true, title: true },
    with: { contact: { columns: { email: true, name: true, preferredLanguage: true } } },
  });
  if (!doc) notFound();

  const kindLabel = doc.kind === "invoice" ? "Factuur" : "Offerte";
  const defaults = offerteDefaults({
    lang: doc.contact?.preferredLanguage,
    kind: doc.kind,
    docNumber: doc.docNumber ?? "",
  });
  const send = sendDocumentCustom.bind(null, id);

  return (
    <>
      <PageHeader
        title={`${kindLabel} versturen`}
        subtitle={`${doc.docNumber ?? ""}${doc.contact?.name ? ` · aan ${doc.contact.name}` : ""}`}
        actions={
          <Link href={`/documents/${id}`} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
        }
      />

      <Card className="max-w-2xl">
        <CardContent>
          <p className="mb-4 text-sm text-muted">
            Controleer de mail hieronder en pas 'm eventueel aan. Klik daarna op{" "}
            <span className="font-medium text-foreground">Verstuur</span> — daarna zie je een
            bevestiging.
          </p>

          {!doc.contact?.email && (
            <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              Dit contact heeft geen e-mailadres. Vul hieronder een adres in, anders wordt de mail
              niet verstuurd.
            </p>
          )}

          <form action={send} className="space-y-5">
            <Field label="Aan" htmlFor="to">
              <Input
                id="to"
                name="to"
                type="email"
                defaultValue={doc.contact?.email ?? ""}
                placeholder="klant@voorbeeld.com"
              />
            </Field>

            <Field label="Onderwerp" htmlFor="subject">
              <Input id="subject" name="subject" defaultValue={defaults.subject} />
            </Field>

            <Field
              label="Bericht"
              htmlFor="message"
              hint="Je kunt de tekst vrij aanpassen. Knoppen, link en je handtekening worden automatisch toegevoegd."
            >
              <Textarea
                id="message"
                name="message"
                defaultValue={defaults.intro}
                className="min-h-32"
              />
            </Field>

            <Field
              label="Bijlagen"
              htmlFor="extra"
              hint={`De ${kindLabel.toLowerCase()} wordt automatisch als PDF meegestuurd. Voeg hier eventueel extra bestanden toe.`}
            >
              <Input id="extra" name="extra" type="file" multiple />
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SubmitButton pendingLabel="Versturen…">Verstuur naar klant</SubmitButton>
              <a
                href={`/documents/${id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                PDF-preview bekijken
              </a>
              <Link
                href={`/documents/${id}`}
                className="rounded-md px-3 py-2 text-sm text-muted hover:underline"
              >
                Annuleren
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
