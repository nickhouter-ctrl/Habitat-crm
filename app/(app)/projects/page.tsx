import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SyncHoldedButton } from "@/components/sync-holded-button";
import { db } from "@/lib/db";
import { projects, contacts } from "@/lib/db/schema";

export const metadata = { title: "Projecten" };

export default async function ProjectsPage() {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      code: projects.code,
      color: projects.color,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      holdedProjectId: projects.holdedProjectId,
      contactId: projects.contactId,
      contactName: contacts.name,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
    .orderBy(asc(projects.status), desc(projects.updatedAt));

  const active = rows.filter((r) => r.status === "active");
  const archived = rows.filter((r) => r.status === "archived");

  return (
    <>
      <PageHeader
        title="Projecten"
        subtitle="Gekoppeld aan Holded — alle lopende klussen op één plek."
        actions={<SyncHoldedButton />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Projecten (totaal)" value={rows.length} />
        <StatTile label="Actief" value={active.length} />
        <StatTile label="Gearchiveerd" value={archived.length} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen projecten"
          description="Maak een project aan in Holded en klik dan op ‘Sync met Holded’ om ze hier op te halen."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Project</Th>
                <Th>Code</Th>
                <Th>Klant</Th>
                <Th>Status</Th>
                <Th>Bron</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ background: p.color ?? "#9ca3af" }}
                      />
                      <span className="font-medium">{p.name}</span>
                    </div>
                    {p.description && (
                      <span className="ml-4 line-clamp-1 text-xs text-muted">{p.description}</span>
                    )}
                  </Td>
                  <Td className="text-muted">{p.code ?? "—"}</Td>
                  <Td>
                    {p.contactName ? (
                      <Link href={`/contacts/${p.contactId}`} className="hover:underline">
                        {p.contactName}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={p.status === "active" ? "success" : "neutral"}>
                      {p.status === "active" ? "Actief" : "Gearchiveerd"}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-muted">{p.holdedProjectId ? "Holded" : "CRM"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
