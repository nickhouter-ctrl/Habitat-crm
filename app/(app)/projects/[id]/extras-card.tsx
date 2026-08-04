/**
 * Meerwerk — wat er buiten de aanneemsom is afgesproken.
 *
 * Staat los van de aanneemsom en komt op de eindafrekening als aparte regels
 * erbovenop. Het vinkje "akkoord van de klant" is er niet voor de vorm:
 * meerwerk zonder akkoord is de klassieke discussie aan het eind van een klus,
 * en wie het wanneer heeft afgesproken is later niet meer te achterhalen.
 */
import { asc, eq } from "drizzle-orm";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { projectExtras } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import { addProjectExtra, deleteProjectExtra, toggleProjectExtraApproved } from "../actions";

export async function ProjectExtrasCard({ projectId }: { projectId: string }) {
  const regels = await db
    .select()
    .from(projectExtras)
    .where(eq(projectExtras.projectId, projectId))
    .orderBy(asc(projectExtras.date));

  const totaal = regels.reduce((s, r) => s + Number(r.amountEur ?? 0), 0);
  const kost = regels.reduce((s, r) => s + Number(r.costEur ?? 0), 0);
  const zonderAkkoord = regels.filter((r) => !r.approvedAt);

  return (
    <Card id="meerwerk" className="mb-5 scroll-mt-24">
      <CardHeader>
        <CardTitle>Meerwerk</CardTitle>
        <span className="text-xs text-muted">
          buiten de aanneemsom · komt op de eindafrekening bovenop
          {totaal > 0 ? ` · ${formatEUR(totaal)} ex. btw${kost > 0 ? ` (kostprijs ${formatEUR(kost)})` : ""}` : ""}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {zonderAkkoord.length > 0 && (
          <p className="rounded-md bg-warning/10 p-3 text-sm">
            {zonderAkkoord.length} {zonderAkkoord.length === 1 ? "regel" : "regels"} zonder akkoord van de klant, samen{" "}
            {formatEUR(zonderAkkoord.reduce((s, r) => s + Number(r.amountEur ?? 0), 0))}. Leg dat vast vóór de
            eindafrekening — achteraf is het een discussie.
          </p>
        )}

        {regels.length > 0 && (
          <Table>
            <THead>
              <tr>
                <Th>Datum</Th>
                <Th>Wat</Th>
                <Th className="text-right">Kostprijs</Th>
                <Th className="text-right">Aan klant</Th>
                <Th>Akkoord</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {regels.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted">
                    {new Date(r.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                  </Td>
                  <Td>
                    <span className="font-medium">{r.description}</span>
                    {r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">
                    {r.costEur != null ? formatEUR(Number(r.costEur)) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-medium">{formatEUR(Number(r.amountEur ?? 0))}</Td>
                  <Td>
                    <form action={toggleProjectExtraApproved.bind(null, projectId, r.id, !r.approvedAt)}>
                      <button type="submit" className="text-left">
                        {r.approvedAt ? (
                          <Badge tone="success">akkoord</Badge>
                        ) : (
                          <Badge tone="warning">nog niet</Badge>
                        )}
                      </button>
                    </form>
                  </Td>
                  <Td className="text-right">
                    <form action={deleteProjectExtra.bind(null, projectId, r.id)}>
                      <ConfirmSubmit
                        message={`"${r.description}" verwijderen?`}
                        className="rounded p-1 text-xs text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        ×
                      </ConfirmSubmit>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}

        <form
          action={addProjectExtra.bind(null, projectId)}
          className="grid gap-3 lg:grid-cols-[2fr_0.9fr_0.9fr_0.9fr_auto] lg:items-end"
        >
          <Field label="Wat is er afgesproken?" htmlFor="mw-desc">
            <Input id="mw-desc" name="description" required placeholder="bijv. extra badkamer betegelen" />
          </Field>
          <Field label="Aan klant (€)" htmlFor="mw-amount" hint="ex. btw">
            <Input id="mw-amount" name="amountEur" inputMode="decimal" required className="text-right" placeholder="0,00" />
          </Field>
          <Field label="Kostprijs (€)" htmlFor="mw-cost" hint="optioneel">
            <Input id="mw-cost" name="costEur" inputMode="decimal" className="text-right" placeholder="—" />
          </Field>
          <Field label="Datum" htmlFor="mw-date">
            <Input id="mw-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="…">
            + Meerwerk
          </SubmitButton>
          <label className="flex items-center gap-2 text-sm lg:col-span-5">
            <input type="checkbox" name="approved" />
            <span>De klant is hiermee akkoord</span>
          </label>
        </form>
      </CardContent>
    </Card>
  );
}
