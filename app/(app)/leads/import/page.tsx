import { desc } from "drizzle-orm";
import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { prospectImports } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";

import { registerImport, signImportUpload } from "./actions";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lijst importeren" };

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "warning" | "success" | "danger" }> = {
  uploaded: { label: "Kolommen kiezen", tone: "warning" },
  analyzed: { label: "Klaar om te importeren", tone: "accent" },
  applying: { label: "Bezig", tone: "warning" },
  done: { label: "Geïmporteerd", tone: "success" },
  failed: { label: "Mislukt", tone: "danger" },
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string; verwijderd?: string }> }) {
  const sp = await searchParams;
  const batches = await db.query.prospectImports.findMany({ orderBy: desc(prospectImports.createdAt), limit: 30 });

  return (
    <>
      <PageHeader
        title="Lijst importeren"
        subtitle="Excel of CSV met bedrijven → prospects, zonder je contactenlijst te vervuilen"
        actions={<Link href="/leads" className="text-sm underline">Terug naar leads</Link>}
      />

      {sp.error && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.verwijderd && <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">De batch is teruggedraaid.</p>}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Nieuw bestand</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm signAction={signImportUpload} registerAction={registerImport} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Eerdere imports</CardTitle>
          <span className="text-xs text-muted">{batches.length} {batches.length === 1 ? "lijst" : "lijsten"}</span>
        </CardHeader>
        {batches.length === 0 ? (
          <CardContent>
            <EmptyState title="Nog niets geïmporteerd" description="Upload hierboven een Excel- of CSV-bestand om te beginnen." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Lijst</Th>
                <Th>Bestand</Th>
                <Th>Herkomst</Th>
                <Th className="text-right">Rijen</Th>
                <Th className="text-right">Toegevoegd</Th>
                <Th>Status</Th>
                <Th>Datum</Th>
              </tr>
            </THead>
            <TBody>
              {batches.map((b) => {
                const meta = STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
                return (
                  <Tr key={b.id}>
                    <Td className="font-medium">
                      <Link href={`/leads/import/${b.id}`} className="text-accent hover:underline">
                        {b.label}
                      </Link>
                    </Td>
                    <Td className="max-w-[16rem] truncate text-muted">{b.filename}</Td>
                    <Td className="max-w-[18rem] truncate text-muted">
                      {b.vendor ? `${b.vendor} — ` : ""}
                      {b.provenance}
                    </Td>
                    <Td className="text-right tabular-nums">{b.totalRows || "—"}</Td>
                    <Td className="text-right tabular-nums">{b.insertedCount || "—"}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(b.createdAt)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
