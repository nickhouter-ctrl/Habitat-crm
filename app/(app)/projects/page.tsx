import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { contacts, projects } from "@/lib/db/schema";

export const metadata = { title: "Projecten" };

export default async function ProjectsPage() {
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
      status: projects.status,
      holdedProjectId: projects.holdedProjectId,
      contactId: projects.contactId,
      contactName: contacts.name,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
    .orderBy(asc(projects.status), desc(projects.updatedAt));

  return (
    <>
      <PageHeader title="Projecten" />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Alle projecten</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              {projectRows.length} {projectRows.length === 1 ? "project" : "projecten"}
            </span>
            <LinkButton href="/projects/new" variant="primary">
              Nieuw project
            </LinkButton>
          </div>
        </CardHeader>
        {projectRows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">
            Nog geen projecten — maak er een aan met “Nieuw project”.
          </div>
        ) : (
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
              {projectRows.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ background: p.color ?? "#9ca3af" }}
                      />
                      {p.name}
                    </Link>
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
        )}
      </Card>
    </>
  );
}
