import { asc, desc } from "drizzle-orm";
import { headers } from "next/headers";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
  StatTile,
} from "@/components/ui";
import { CopyLinkButton } from "@/components/copy-link-button";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { workers } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import {
  createWorker,
  regenerateWorkerPortalToken,
  revokeWorkerPortalToken,
  toggleWorkerActive,
  updateWorker,
} from "./actions";

export const metadata = { title: "Ploeg" };

const PAY_LABEL = { cash: "Contant", invoice: "Per factuur" } as const;

export default async function PloegPage() {
  const rows = await db
    .select()
    .from(workers)
    .orderBy(desc(workers.active), asc(workers.name));

  // Basis-URL voor de urenportaal-links (zelfde aanpak als de offerte-links).
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const portalBase = `${proto}://${host}/uren`;

  const active = rows.filter((w) => w.active);
  const rated = active.filter((w) => Number(w.hourlyCostEur ?? 0) > 0);
  const avgRate = rated.length
    ? rated.reduce((s, w) => s + Number(w.hourlyCostEur), 0) / rated.length
    : 0;

  return (
    <>
      <PageHeader
        title="Ploeg"
        subtitle="De arbeiders ('de jongens') met hun kostentarief — gebruikt voor de urenregistratie op projecten."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Actieve arbeiders" value={String(active.length)} />
        <StatTile
          label="Gem. uurtarief"
          value={Number.isFinite(avgRate) && avgRate > 0 ? formatEUR(avgRate) : "—"}
          hint="kostprijs per uur"
        />
        <StatTile label="Inactief" value={String(rows.length - active.length)} tone="neutral" />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Arbeider toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWorker} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <Field label="Naam" htmlFor="w-name">
              <Input id="w-name" name="name" required placeholder="Voornaam Achternaam" />
            </Field>
            <Field label="Functie" htmlFor="w-role">
              <Input id="w-role" name="role" placeholder="bijv. tegelzetter" />
            </Field>
            <Field label="Uurtarief (€, kostprijs)" htmlFor="w-rate">
              <Input id="w-rate" name="hourlyCostEur" inputMode="decimal" placeholder="25,00" />
            </Field>
            <Field label="Standaard betaalwijze" htmlFor="w-pay" hint="alleen een voorinvulling — per urenregel kies je contant of factuur">
              <Select id="w-pay" name="defaultPaymentMethod" defaultValue="cash">
                <option value="cash">Contant</option>
                <option value="invoice">Per factuur</option>
              </Select>
            </Field>
            <SubmitButton pendingLabel="Bezig…">Toevoegen</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Arbeiders</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">Nog geen arbeiders toegevoegd.</p>
          </CardContent>
        ) : (
          <div className="divide-y">
            {rows.map((w) => (
              <form
                key={w.id}
                action={updateWorker.bind(null, w.id)}
                className={`grid items-end gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto] ${
                  w.active ? "" : "opacity-60"
                }`}
              >
                <Field label="Naam">
                  <Input name="name" defaultValue={w.name} required />
                </Field>
                <Field label="Functie">
                  <Input name="role" defaultValue={w.role ?? ""} />
                </Field>
                <Field label="Uurtarief (€)">
                  <Input
                    name="hourlyCostEur"
                    inputMode="decimal"
                    defaultValue={w.hourlyCostEur ? String(w.hourlyCostEur).replace(".", ",") : ""}
                  />
                </Field>
                <Field label="Standaard betaalwijze">
                  <Select name="defaultPaymentMethod" defaultValue={w.defaultPaymentMethod}>
                    <option value="cash">Contant</option>
                    <option value="invoice">Per factuur</option>
                  </Select>
                </Field>
                <div className="flex items-center gap-2">
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                    Opslaan
                  </SubmitButton>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:col-span-5">
                  <button
                    type="submit"
                    formAction={toggleWorkerActive.bind(null, w.id, !w.active)}
                    className="text-xs text-muted underline-offset-2 hover:underline"
                  >
                    {w.active ? "Op inactief zetten" : "Heractiveren"}
                  </button>
                  {!w.active && <span className="text-xs text-muted">· {PAY_LABEL[w.defaultPaymentMethod]}</span>}
                  {w.active && (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">· Urenportaal:</span>
                      {w.portalToken ? (
                        <>
                          <CopyLinkButton url={`${portalBase}/${w.portalToken}`} />
                          <button
                            type="submit"
                            formAction={regenerateWorkerPortalToken.bind(null, w.id)}
                            className="text-xs text-muted underline-offset-2 hover:underline"
                          >
                            Vernieuw link
                          </button>
                          <button
                            type="submit"
                            formAction={revokeWorkerPortalToken.bind(null, w.id)}
                            className="text-xs text-muted underline-offset-2 hover:underline"
                          >
                            Intrekken
                          </button>
                        </>
                      ) : (
                        <button
                          type="submit"
                          formAction={regenerateWorkerPortalToken.bind(null, w.id)}
                          className="text-xs text-muted underline-offset-2 hover:underline"
                        >
                          Link aanmaken
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </form>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
