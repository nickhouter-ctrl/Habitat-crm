import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, LinkButton, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { sentEmails } from "@/lib/db/schema";
import { mailHtmlOpgeschoond } from "@/lib/mail-html";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Verstuurde mail" };

export default async function SentMailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mail = await db.query.sentEmails.findFirst({ where: eq(sentEmails.id, id) });
  if (!mail) notFound();

  const backHref = mail.contactId ? `/contacts/${mail.contactId}?tab=archief` : "/";

  return (
    <>
      <PageHeader
        title="Verstuurde mail"
        subtitle={mail.subject ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            {/* Los vel zonder schermmenu; in het printvenster kun je ook
                "bewaar als pdf" kiezen, dus dit dekt printen én bewaren. */}
            <LinkButton href={`/sent-mail/${id}/print?auto=1`} variant="secondary" size="sm" target="_blank">
              Printen of opslaan als pdf
            </LinkButton>
            <Link href={backHref} className="text-sm text-muted hover:underline">
              ← Terug
            </Link>
          </div>
        }
      />

      <Card className="mx-auto max-w-2xl">
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Aan</dt>
            <dd>{mail.toEmail ?? "—"}</dd>
            <dt className="text-muted">Onderwerp</dt>
            <dd className="font-medium">{mail.subject ?? "—"}</dd>
            <dt className="text-muted">Verstuurd</dt>
            <dd>{formatDate(mail.createdAt)}</dd>
          </dl>

          <div className="overflow-hidden rounded-lg border">
            {mail.html ? (
              /* sandbox="" liet het kader leeg: Chrome rendert een volledig
                 afgeschermde srcDoc niet. Met allow-same-origin verschijnt de
                 brief wél, en zonder allow-scripts kan er nog steeds niets
                 uitgevoerd worden — de HTML is bovendien al opgeschoond. */
              <iframe
                title="E-mailinhoud"
                sandbox="allow-same-origin"
                srcDoc={mailHtmlOpgeschoond(mail.html)}
                className="h-[640px] w-full bg-white"
              />
            ) : (
              <pre className="whitespace-pre-wrap p-4 text-sm">{mail.body ?? ""}</pre>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
