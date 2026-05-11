import { desc } from "drizzle-orm";

import { auth } from "@/auth";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SyncHoldedButton } from "@/components/sync-holded-button";
import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  const session = await auth();
  const holdedConfigured = Boolean(process.env.HOLDED_API_KEY);
  const webhookSecretSet = Boolean(process.env.HOLDED_WEBHOOK_SECRET);

  const recentEvents = await db.query.webhookEvents.findMany({
    orderBy: desc(webhookEvents.receivedAt),
    limit: 15,
  });

  return (
    <>
      <PageHeader title="Instellingen" subtitle="Integraties en account" />

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
              <dd>{session?.user?.role ?? "—"}</dd>
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
