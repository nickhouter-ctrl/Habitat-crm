import { BookOpen, Download, Trash2, Upload } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { listCatalogFiles } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

import { deleteCatalog, uploadCatalog } from "./actions";

export const metadata = { title: "Catalogi" };
export const dynamic = "force-dynamic";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

export default async function CatalogiPage() {
  const files = await listCatalogFiles();

  return (
    <>
      <PageHeader
        title="Catalogi"
        subtitle="Catalogussen en brochures — uploaden en snel downloaden"
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Catalogus uploaden</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={uploadCatalog} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept="application/pdf"
              required
              className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-background-soft file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-border"
            />
            <button type="submit" className={buttonClass({ variant: "secondary" })}>
              <Upload className="h-4 w-4" /> Uploaden
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">Alleen PDF, max 25 MB.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalogussen ({files.length})</CardTitle>
        </CardHeader>
        {files.length === 0 ? (
          <CardContent>
            <EmptyState
              title="Nog geen catalogussen"
              description="Upload hierboven een PDF om te beginnen."
            />
          </CardContent>
        ) : (
          <CardContent className="divide-y divide-border py-0">
            {files.map((f) => (
              <div key={f.path} className="flex flex-wrap items-center gap-3 py-3">
                <BookOpen className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={f.name}>
                  {f.name}
                </span>
                <span className="text-xs tabular-nums text-muted">{formatSize(f.size)}</span>
                {f.uploadedAt && (
                  <span className="text-xs text-muted">{formatDate(f.uploadedAt)}</span>
                )}
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass({ variant: "secondary" })}
                >
                  <Download className="h-4 w-4" /> Download
                </a>
                <form
                  action={async () => {
                    "use server";
                    await deleteCatalog(f.path);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    title="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </>
  );
}
