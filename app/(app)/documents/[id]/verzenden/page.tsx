import { tekst as uiTranslation } from '@/lib/i18n/server';
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

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Versturen") };
}

export default async function SendDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const uiT = await uiTranslation();
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
        title={uiT("{v0} versturen", { v0: kindLabel })}
        subtitle={`${doc.docNumber ?? ""}${doc.contact?.name ? uiT(" · aan {naam}",{naam:doc.contact.name}) : ""}`}
        actions={
          <Link href={`/documents/${id}`} className="text-sm text-muted hover:underline">
            {uiT("← Terug")} </Link>
        }
      />

      <Card className="max-w-2xl">
        <CardContent>
          <p className="mb-4 text-sm text-muted">
            {uiT("Controleer de mail hieronder en pas 'm eventueel aan. Klik daarna op")}{" "}
            <span className="font-medium text-foreground">{uiT("Verstuur")}</span> {uiT("— daarna zie je een bevestiging.")} </p>

          {!doc.contact?.email && (
            <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              {uiT("Dit contact heeft geen e-mailadres. Vul hieronder een adres in, anders wordt de mail niet verstuurd.")} </p>
          )}

          <form action={send} className="space-y-5">
            <Field label={uiT("Aan")} htmlFor="to">
              <Input
                id="to"
                name="to"
                type="email"
                defaultValue={doc.contact?.email ?? ""}
                placeholder={uiT("klant@voorbeeld.com")}
              />
            </Field>

            <Field label={uiT("Onderwerp")} htmlFor="subject">
              <Input id="subject" name="subject" defaultValue={defaults.subject} />
            </Field>

            <Field
              label={uiT("Bericht")}
              htmlFor="message"
              hint={uiT("Je kunt de tekst vrij aanpassen. Knoppen, link en je handtekening worden automatisch toegevoegd.")}
            >
              <Textarea
                id="message"
                name="message"
                defaultValue={defaults.intro}
                className="min-h-32"
              />
            </Field>

            <Field
              label={uiT("Bijlagen")}
              htmlFor="extra"
              hint={uiT("De {v0} wordt automatisch als PDF meegestuurd. Voeg hier eventueel extra bestanden toe.", { v0: kindLabel.toLowerCase() })}
            >
              <Input id="extra" name="extra" type="file" multiple />
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SubmitButton pendingLabel={uiT("Versturen…")}>{uiT("Verstuur naar klant")}</SubmitButton>
              <a
                href={`/documents/${id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                {uiT("PDF-preview bekijken")} </a>
              <Link
                href={`/documents/${id}`}
                className="rounded-md px-3 py-2 text-sm text-muted hover:underline"
              >
                {uiT("Annuleren")} </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
