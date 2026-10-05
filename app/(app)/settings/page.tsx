import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import Link from "next/link";
import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { asc, desc } from "drizzle-orm";

import { huidigeToegangOfNull } from "@/lib/auth/access";
import { ROLE_LABEL, ROLES } from "@/lib/auth/modules";
import { LOCALE_LABEL, LOCALES } from "@/lib/i18n";
import { ConfirmSubmit } from "@/components/confirm-submit";
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
import { TeamMemberRoleSelect } from "@/components/team-member-role";
import { db } from "@/lib/db";
import { users, webhookEvents } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import {
  changeOwnLocale,
  changeOwnPassword,
  createTeamMember,
  deleteTeamMember,
  setTeamMemberPassword,
  setTeamMemberPhone,
  setTeamMemberRole,
} from "./actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Instellingen") };
}

/** Labels komen uit de moduletabel, zodat een nieuwe rol hier niet vergeten wordt. */
const ROLE_TONE: Record<string, "accent" | "info" | "success" | "neutral"> = {
  admin: "accent",
  agent: "info",
  marketing: "success",
  viewer: "neutral",
};
const ROLE_META: Record<string, { label: string; tone: "accent" | "info" | "success" | "neutral" }> =
  Object.fromEntries(ROLES.map((r) => [r, { label: ROLE_LABEL[r], tone: ROLE_TONE[r] ?? "neutral" }]));

export default async function SettingsPage() {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  // Rol uit de database: het sessiecookie leeft 30 dagen en kan achterlopen.
  const ik = await huidigeToegangOfNull();
  const isAdmin = ik?.heeftCap("teambeheer") ?? false;
  const holdedConfigured = Boolean(process.env.HOLDED_API_KEY);
  const webhookSecretSet = Boolean(process.env.HOLDED_WEBHOOK_SECRET);

  const [recentEvents, teamMembers] = await Promise.all([
    // Webhook-berichten bevatten Holded-gegevens; alleen voor beheerders.
    isAdmin
      ? db.query.webhookEvents.findMany({ orderBy: desc(webhookEvents.receivedAt), limit: 15 })
      : Promise.resolve([] as (typeof webhookEvents.$inferSelect)[]),
    isAdmin
      ? db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, createdAt: users.createdAt })
          .from(users)
          .orderBy(asc(users.email))
      : Promise.resolve([] as { id: string; name: string | null; email: string; role: string; phone: string | null; createdAt: Date }[]),
  ]);

  return (
    <>
<TabsRoot defaultTab="account" ids={["account","team","clients","integration"]} param="section">
      <PageHeader title={uiT("Instellingen")} subtitle={uiT("Medewerkers, integraties en account")} />
<TabsBar tabs={[{id:"account",label:uiT("Account")},...(isAdmin ? [{id:"team",label:uiT("Medewerkers")}] : []),...(ik?.magModule("klantaccounts") ? [{id:"clients",label:uiT("Klanttoegang")}] : []),...(isAdmin ? [{id:"integration",label:uiT("Integraties")}] : [])]}/>
      {ik?.magModule("klantaccounts") && <TabPanel id="clients"><Card className="mb-5"><CardHeader><CardTitle>{uiT("Klanttoegang")}</CardTitle></CardHeader><div className="flex flex-wrap gap-4 px-5 pb-5 text-sm"><Link className="underline" href="/accounts">{uiT("Website-accounts en aanvragen")}</Link><Link className="underline" href="/windows-accounts">{uiT("Windows-accounts en aanvragen")}</Link><Link className="underline" href="/contacts">{uiT("Toegang beheren via een contact")}</Link></div></Card></TabPanel>}

      {isAdmin && (
        <TabPanel id="team"><Card className="mb-4 overflow-hidden">
          <CardHeader>
            <CardTitle>{uiT("Medewerkers")}</CardTitle>
            <span className="text-xs text-muted">{teamMembers.length} {teamMembers.length === 1 ? uiT("account") : uiT("accounts")}</span>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>{uiT("Naam")}</Th>
                <Th>{uiT("E-mail")}</Th>
                <Th>{uiT("Rol")}</Th>
                <Th>{uiT("Telefoon")}</Th>
                <Th>{uiT("Wachtwoord")}</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {teamMembers.map((u) => {
                const meta = ROLE_META[u.role] ?? { label: u.role, tone: "neutral" as const };
                const isSelf = u.id === ik!.id;
                return (
                  <Tr key={u.id}>
                    <Td className="font-medium">{u.name ?? "—"}{isSelf && <span className="ml-1 text-xs text-muted">{uiT("(jij)")}</span>}</Td>
                    <Td className="text-muted">{u.email}</Td>
                    <Td>
                      {isSelf ? (
                        <Badge tone={meta.tone}>{uiT(meta.label)}</Badge>
                      ) : (
                        <TeamMemberRoleSelect
                          key={`${u.id}:${u.role}`}
                          initialRole={u.role}
                          action={setTeamMemberRole.bind(null, u.id)}
                          roles={Object.entries(ROLE_META).map(([value, m]) => ({ value, label: m.label }))}
                        />
                      )}
                    </Td>
                    <Td>
                      {/* Telefoonnummer komt onder de voorschotbrief te staan. */}
                      <form action={setTeamMemberPhone.bind(null, u.id)} className="flex items-center gap-1">
                        <Input
                          name="phone"
                          defaultValue={u.phone ?? ""}
                          placeholder="+34 6…"
                          className="h-8 w-36 text-xs"
                        />
                        <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                          ✓
                        </SubmitButton>
                      </form>
                    </Td>
                    <Td>
                      {/* Een bestaand wachtwoord is niet op te vragen — het staat als
                          bcrypt-hash in de database. Alleen een nieuw wachtwoord zetten. */}
                      <form action={setTeamMemberPassword.bind(null, u.id)} className="flex items-center gap-1">
                        <Input
                          name="password"
                          type="text"
                          minLength={8}
                          required
                          placeholder={uiT("nieuw, min. 8")}
                          className="h-8 w-40 text-xs"
                        />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                          {uiT("Zet")} </SubmitButton>
                      </form>
                    </Td>
                    <Td className="text-right">
                      {!isSelf && (
                        <form action={deleteTeamMember.bind(null, u.id)}>
                          <ConfirmSubmit
                            message={uiT("{v0} uit het team verwijderen?", { v0: u.name ?? u.email })}
                            className="rounded p-1 text-xs text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            {uiT("Verwijderen")} </ConfirmSubmit>
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
              <Field label={uiT("Naam")} htmlFor="m-name">
                <Input id="m-name" name="name" required placeholder={uiT("Voornaam Achternaam")} />
              </Field>
              <Field label={uiT("E-mail")} htmlFor="m-email">
                <Input id="m-email" name="email" type="email" required placeholder={uiT("naam@habitat-one.com")} />
              </Field>
              <Field label={uiT("Rol")} htmlFor="m-role">
                <Select id="m-role" name="role" defaultValue="agent">
                  {Object.entries(ROLE_META).map(([v, m]) => (
                    <option key={v} value={v}>{uiT(m.label)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={uiT("Wachtwoord")} htmlFor="m-pw">
                <Input id="m-pw" name="password" type="text" required minLength={8} placeholder={uiT("min. 8 tekens")} />
              </Field>
              <Button type="submit">{uiT("Toevoegen")}</Button>
            </form>
            <p className="mt-2 text-xs text-muted">
              {uiT("Rollen:")} <strong>{uiT("Beheerder")}</strong> {uiT("mag alles, incl. medewerkers beheren ·")} <strong>{uiT("Medewerker")}</strong> {uiT("is dagelijks gebruik ·")} <strong>{uiT("Marketing en klantcontact")}</strong> {uiT("ziet alleen mail, contacten, aanvragen, leads, agenda en de assistent — geen projecten, financiën, inkoop of prijzen ·")} <strong>{uiT("Alleen lezen")}</strong>{" "}
              {uiT("kan niets wijzigen. Een vergeten wachtwoord is nergens op te zoeken — zet er hierboven een nieuw.")} </p>
          </CardContent>
        </Card></TabPanel>
      )}

      <div className="space-y-5">
        {isAdmin && <TabPanel id="integration"><Card>
          <CardHeader>
            <CardTitle>{uiT("Holded")}</CardTitle>
            <SyncHoldedButton />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">{uiT("API-sleutel")}</span>
              <Badge tone={holdedConfigured ? "success" : "danger"}>
                {holdedConfigured ? uiT("Ingesteld") : uiT("Ontbreekt")}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{uiT("Webhook-secret")}</span>
              <Badge tone={webhookSecretSet ? "success" : "warning"}>
                {webhookSecretSet ? uiT("Ingesteld") : uiT("Niet ingesteld")}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-muted">{uiT("Webhook-URL (in Holded instellen):")}</p>
              <code className="block break-all rounded-md bg-background px-2.5 py-2 font-mono text-xs">
                {`https://<jouw-domein>/api/webhooks/holded${
                  webhookSecretSet ? "?key=<HOLDED_WEBHOOK_SECRET>" : ""
                }`}
              </code>
            </div>
            {!holdedConfigured && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-warning">
                {uiT("Zet")} <code className="font-mono">HOLDED_API_KEY</code> {uiT("in")}{" "}
                <code className="font-mono">{uiT(".env.local")}</code> {uiT("(Holded → Instellingen → Developers → API key) en herstart de dev-server.")} </p>
            )}
          </CardContent>
        </Card></TabPanel>}

        <TabPanel id="account"><Card>
          <CardHeader>
            <CardTitle>{uiT("Account")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">{uiT("Naam")}</dt>
              <dd>{ik?.name ?? "—"}</dd>
              <dt className="text-muted">{uiT("E-mail")}</dt>
              <dd>{ik?.email ?? "—"}</dd>
              <dt className="text-muted">{uiT("Rol")}</dt>
              <dd>{uiT(ROLE_META[ik?.rol ?? ""]?.label) ?? ik?.rol ?? "—"}</dd>
            </dl>
            {/* Taal van het CRM. Nederlands is de brontaal; Engels en Spaans komen
                uit de woordenboeken in lib/i18n. */}
            <form action={changeOwnLocale} className="space-y-2 border-t pt-4">
              <p className="text-xs text-muted">{uiT("Taal van het systeem")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <Select name="locale" defaultValue={ik?.locale ?? "nl"} className="w-48">
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_LABEL[l]}
                    </option>
                  ))}
                </Select>
                <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                  {uiT("Taal wijzigen")} </SubmitButton>
              </div>
              <p className="text-xs text-muted">
                {uiT("Nederlands is de oorspronkelijke taal. Wat nog niet vertaald is, blijft in het Nederlands staan.")} </p>
            </form>

            {/* Zelf je wachtwoord wijzigen — hoefde eerst langs een beheerder. */}
            <form action={changeOwnPassword} className="space-y-2 border-t pt-4">
              <p className="text-xs text-muted">{uiT("Wachtwoord wijzigen")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label={uiT("Huidig")} htmlFor="pw-huidig">
                  <Input id="pw-huidig" name="huidig" type="password" autoComplete="current-password" />
                </Field>
                <Field label={uiT("Nieuw")} htmlFor="pw-nieuw">
                  <Input id="pw-nieuw" name="nieuw" type="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <Field label={uiT("Nogmaals")} htmlFor="pw-herhaal">
                  <Input id="pw-herhaal" name="herhaal" type="password" required minLength={8} autoComplete="new-password" />
                </Field>
              </div>
              <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                {uiT("Wachtwoord wijzigen")} </SubmitButton>
            </form>
          </CardContent>
        </Card></TabPanel>
      </div>

      {isAdmin && <TabPanel id="integration"><Card className="mt-4 overflow-hidden">
        <CardHeader>
          <CardTitle>{uiT("Recente Holded-webhooks")}</CardTitle>
        </CardHeader>
        {recentEvents.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">{uiT("Nog geen webhook-events ontvangen.")}</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>{uiT("Ontvangen")}</Th>
                <Th>{uiT("Event")}</Th>
                <Th>{uiT("Verwerkt")}</Th>
                <Th>{uiT("Fout")}</Th>
              </tr>
            </THead>
            <TBody>
              {recentEvents.map((e) => (
                <Tr key={e.id}>
                  <Td className="text-muted">{formatDate(e.receivedAt, uiDateLocale)}</Td>
                  <Td className="font-mono text-xs">{e.eventType ?? "—"}</Td>
                  <Td>
                    {e.processedAt ? (
                      <Badge tone="success">{uiT("Ja")}</Badge>
                    ) : e.error ? (
                      <Badge tone="danger">{uiT("Mislukt")}</Badge>
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
      </Card></TabPanel>}

</TabsRoot>
</>
  );
}
