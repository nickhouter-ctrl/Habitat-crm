import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { sentEmails } from "@/lib/db/schema";
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
          <Link href={backHref} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
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
              <iframe
                title="E-mailinhoud"
                sandbox=""
                srcDoc={mail.html}
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
