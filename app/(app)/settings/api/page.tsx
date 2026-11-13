import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CreateApiKey } from "./create-key";
import { revokeApiKey } from "./actions";

export default async function ApiKeysPage() {
  await requireAdmin();
  const keys = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  const fmt = (d: Date | null) => (d ? d.toLocaleString("nl-NL", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" }) : "—");
  return <>
    <PageHeader title="API-sleutels" subtitle="Toegang voor externe partijen tot producten, merken, beelden, teksten en creatives. Geen klant-, project- of financiële gegevens." />
    <div className="space-y-5">
      <Card><CardHeader><CardTitle>Nieuwe sleutel</CardTitle></CardHeader><CardContent className="space-y-3">
        <CreateApiKey />
        <p className="text-sm text-muted">API-adres: <code className="font-mono">https://crm.habitat-one.com/api/v1</code> — met de sleutel als <code className="font-mono">Authorization: Bearer hab_…</code>. Dat adres zelf toont alle endpoints.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Sleutels</CardTitle></CardHeader><CardContent>
        {keys.length === 0 ? <p className="text-sm text-muted">Nog geen sleutels.</p> : <Table><THead><tr><Th>Naam</Th><Th>Sleutel</Th><Th>Rechten</Th><Th>Laatst gebruikt</Th><Th>Aangemaakt</Th><Th /></tr></THead><TBody>
          {keys.map((k) => <Tr key={k.id} className={k.revokedAt ? "opacity-50" : undefined}>
            <Td className="font-medium">{k.name}</Td><Td className="font-mono text-xs">{k.prefix}</Td>
            <Td>{k.scopes.includes("content:write") ? "lezen + schrijven" : "alleen lezen"}</Td><Td>{fmt(k.lastUsedAt)}</Td><Td>{fmt(k.createdAt)}</Td>
            <Td className="text-right">{k.revokedAt ? <Badge tone="neutral">ingetrokken</Badge> : <form action={revokeApiKey.bind(null, k.id)}><ConfirmSubmit message={`Sleutel "${k.name}" intrekken? Alles wat ermee werkt stopt direct.`}>Intrekken</ConfirmSubmit></form>}</Td>
          </Tr>)}
        </TBody></Table>}
      </CardContent></Card>
    </div>
  </>;
}
