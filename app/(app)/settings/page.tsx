import { asc, desc } from "drizzle-orm";

import { auth } from "@/auth";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SyncHoldedButton } from "@/components/sync-holded-button";
import { db } from "@/lib/db";
import { users, webhookEvents } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { createTeamMember, deleteTeamMember, setTeamMemberRole } from "./actions";

export const metadata = { title: "Instellingen" };

const ROLE_META: Record<string, { label: string; tone: "accent" | "info" | "neutral" }> = {
  admin: { label: "Beheerder", tone: "accent" },
  agent: { label: "Medewerker", tone: "info" },
  viewer: { label: "Alleen lezen", tone: "neutral" },
};

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const holdedConfigured = Boolean(process.env.HOLDED_API_KEY);
  const webhookSecretSet = Boolean(process.env.HOLDED_WEBHOOK_SECRET);

  const [recentEvents, teamMembers] = await Promise.all([
    db.query.webhookEvents.findMany({ orderBy: desc(webhookEvents.receivedAt), limit: 15 }),
    isAdmin
      ? db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).orderBy(asc(users.email))
      : Promise.resolve([] as { id: string; name: string | null; email: string; role: string; createdAt: Date }[]),
  ]);

  return (
    <>
      <PageHeader title="Instellingen" subtitle="Medewerkers, integraties en account" />

      {isAdmin && (
        <Card className="mb-4 overflow-hidden">
          <CardHeader>
            <CardTitle>Medewerkers</CardTitle>
            <span className="text-xs text-muted">{teamMembers.length} {teamMembers.length === 1 ? "account" : "accounts"}</span>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>Naam</Th>
                <Th>E-mail</Th>
                <Th>Rol</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {teamMembers.map((u) => {
                const meta = ROLE_META[u.role] ?? { label: u.role, tone: "neutral" as const };
                const isSelf = u.id === session!.user!.id;
                return (
                  <Tr key={u.id}>
                    <Td className="font-medium">{u.name ?? "—"}{isSelf && <span className="ml-1 text-xs text-muted">(jij)</span>}</Td>
                    <Td className="text-muted">{u.email}</Td>
                    <Td>
                      {isSelf ? (
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      ) : (
                        <form action={setTeamMemberRole.bind(null, u.id)} className="flex items-center gap-1.5">
                          <Select name="role" defaultValue={u.role} className="h-8 w-36 py-0 text-xs">
                            {Object.entries(ROLE_META).map(([v, m]) => (
                              <option key={v} value={v}>{m.label}</option>
                            ))}
                          </Select>
                          <button className={buttonClass({ variant: "ghost", size: "sm" })}>Opslaan</button>
                        </form>
                      )}
                    </Td>
                    <Td className="text-right">
                      {!isSelf && (
                        <form action={deleteTeamMember.bind(null, u.id)}>
                          <button className="rounded p-1 text-xs text-muted transition-colors hover:bg-danger/10 hover:text-danger">
                            Verwijderen
                          </button>
                        </form>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          <CardContent className="border-t bg-background/50">
            <form action={createTeamMember} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_10rem_1fr_auto]">
              <Field label="Naam" htmlFor="m-name">
                <Input id="m-name" name="name" required placeholder="Voornaam Achternaam" />
              </Field>
              <Field label="E-mail" htmlFor="m-email">
                <Input id="m-email" name="email" type="email" required placeholder="naam@habitat-one.com" />
              </Field>
              <Field label="Rol" htmlFor="m-role">
                <Select id="m-role" name="role" defaultValue="agent">
                  {Object.entries(ROLE_META).map(([v, m]) => (
                    <option key={v} value={v}>{m.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Wachtwoord" htmlFor="m-pw">
                <Input id="m-pw" name="password" type="text" required minLength={8} placeholder="min. 8 tekens" />
              </Field>
              <Button type="submit">Toevoegen</Button>
            </form>
            <p className="mt-2 text-xs text-muted">
              De medewerker logt in op dit CRM met dit e-mailadres en wachtwoord. Rollen: Beheerder (alles, incl. medewerkers beheren), Medewerker (dagelijks gebruik), Alleen lezen.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Holded</CardTitle>
            <SyncHoldedButton />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">API-sleutel</span>
              <Badge tone={holdedConfigured ? "success" : "danger"}>
                {holdedConfigured ? "Ingesteld" : "Ontbreekt"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Webhook-secret</span>
              <Badge tone={webhookSecretSet ? "success" : "warning"}>
                {webhookSecretSet ? "Ingesteld" : "Niet ingesteld"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-muted">Webhook-URL (in Holded instellen):</p>
              <code className="block break-all rounded-md bg-background px-2.5 py-2 font-mono text-xs">
                {`https://<jouw-domein>/api/webhooks/holded${
                  webhookSecretSet ? "?key=<HOLDED_WEBHOOK_SECRET>" : ""
                }`}
              </code>
            </div>
            {!holdedConfigured && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-warning">
                Zet <code className="font-mono">HOLDED_API_KEY</code> in{" "}
                <code className="font-mono">.env.local</code> (Holded → Instellingen →
                Developers → API key) en herstart de dev-server.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Naam</dt>
              <dd>{session?.user?.name ?? "—"}</dd>
              <dt className="text-muted">E-mail</dt>
              <dd>{session?.user?.email ?? "—"}</dd>
              <dt className="text-muted">Rol</dt>
              <dd>{ROLE_META[session?.user?.role ?? ""]?.label ?? session?.user?.role ?? "—"}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Recente Holded-webhooks</CardTitle>
        </CardHeader>
        {recentEvents.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">Nog geen webhook-events ontvangen.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Ontvangen</Th>
                <Th>Event</Th>
                <Th>Verwerkt</Th>
                <Th>Fout</Th>
              </tr>
            </THead>
            <TBody>
              {recentEvents.map((e) => (
                <Tr key={e.id}>
                  <Td className="text-muted">{formatDate(e.receivedAt)}</Td>
                  <Td className="font-mono text-xs">{e.eventType ?? "—"}</Td>
                  <Td>
                    {e.processedAt ? (
                      <Badge tone="success">Ja</Badge>
                    ) : e.error ? (
                      <Badge tone="danger">Mislukt</Badge>
                    ) : (
                      <Badge tone="neutral">—</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-danger">{e.error ?? ""}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
