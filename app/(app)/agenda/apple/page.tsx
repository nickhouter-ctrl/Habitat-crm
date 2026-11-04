import Link from "next/link";
import { and, eq, isNotNull } from "drizzle-orm";
import { requireModuleRead } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { appleCalendarConnections as connections, appleCalendarEvents as mappings, appointments } from "@/lib/db/schema";
import { tekst, datumTaal } from "@/lib/i18n/server";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { AppleConnectForm, AppleSyncControls } from "./forms";
import { resolveAppleConflict } from "./actions";

export const metadata = { title: "Apple Agenda" };
export default async function AppleCalendarPage() {
  const access = await requireModuleRead("agenda"), t = await tekst(), locale = await datumTaal();
  const admin = access.heeftCap("teambeheer");
  // Explicit projection: never serialize encrypted credentials into page props.
  const [connection] = await db.select({ enabled: connections.enabled, appleAccount: connections.appleAccount,
    lastSyncedAt: connections.lastSyncedAt, lastError: connections.lastError }).from(connections).where(eq(connections.id, "team"));
  const issues = admin ? await db.select({ id: mappings.id, title: appointments.title, issue: mappings.issue, resolution: mappings.resolution })
    .from(mappings).leftJoin(appointments, eq(appointments.id, mappings.appointmentId))
    .where(and(eq(mappings.connectionId, "team"), isNotNull(mappings.issue))) : [];
  return <>
    <PageHeader title={t("Apple Agenda")} subtitle={t("Eén gedeelde werkagenda op de iPhones van het team.")} actions={<Link className="text-sm underline" href="/agenda">{t("Terug naar agenda")}</Link>}/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("Habitat One-werkagenda")}</CardTitle><Badge tone={connection?.enabled ? "success" : "neutral"}>{t(connection?.enabled ? "Gekoppeld" : "Niet gekoppeld")}</Badge></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{t("Afspraken toevoegen, verplaatsen en wijzigen kan in het CRM én in Apple Agenda. De koppeling controleert iedere vijf minuten op wijzigingen; de iPhone kan extra tijd nodig hebben om te verversen.")}</p>
          <p>{t("Nieuwe afspraken vanuit Apple worden toegewezen aan de beheerder die de koppeling heeft ingesteld. Taken en dagelijkse controles blijven in het CRM.")}</p>
          <p className="text-muted">{t("Deze koppeling verwerkt losse afspraken en afspraken voor een hele dag. Herhalende afspraken en afspraken met uitnodigingen worden overgeslagen en niet aangepast.")}</p>
          {connection?.lastSyncedAt && <p>{t("Laatste synchronisatie")}: {connection.lastSyncedAt.toLocaleString(locale, { timeZone: "Europe/Madrid" })}</p>}
          {connection?.lastError && <p role="status" className="rounded-lg bg-warning/10 p-3">{t(connection.lastError === "issues" ? "Er zijn afspraken die aandacht nodig hebben. Controleer de conflicten en eventuele herhalingen of uitnodigingen in Apple Agenda." : connection.lastError === "remaining" ? "Een deel is verwerkt. De volgende synchronisatie gaat verder." : "De laatste synchronisatie is niet gelukt. De beheerder kan opnieuw proberen of de Apple-toegang vernieuwen.")}</p>}
          {admin && connection?.enabled && <AppleSyncControls/>}
          {!admin && !connection?.enabled && <p>{t("Een CRM-beheerder kan de gezamenlijke iCloud-agenda hier koppelen.")}</p>}
        </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("Collega’s uitnodigen")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <ol className="list-decimal space-y-3 pl-5"><li>{t("Open Apple Agenda op de iPhone van de eigenaar en tik onderaan op Agenda’s.")}</li><li>{t("Tik op het informatieknopje naast Habitat One CRM en kies Voeg persoon toe.")}</li><li>{t("Nodig de collega uit met diens Apple Account en zet Sta bewerking toe aan.")}</li><li>{t("De collega accepteert de uitnodiging en kiest Habitat One CRM bij het maken van een werkafspraak.")}</li></ol>
        <p className="text-muted">{t("Alle uitgenodigde bewerkers hebben toegang tot de volledige gedeelde werkagenda. De rollen en toegangsrechten binnen het CRM blijven gelden.")}</p>
        <a className="text-accent underline" href="https://support.apple.com/nl-nl/guide/iphone/iph7613c4fb/ios" target="_blank" rel="noopener noreferrer">{t("Apple: een iCloud-agenda delen")}</a>
      </CardContent></Card>
      {admin && <Card><CardHeader><CardTitle>{t(connection?.enabled ? "Apple-toegang vernieuwen" : "Apple Agenda verbinden")}</CardTitle></CardHeader><CardContent>
        <AppleConnectForm account={connection?.appleAccount}/>
      </CardContent></Card>}
      {admin && issues.length > 0 && <Card><CardHeader><CardTitle>{t("Afspraken controleren")}</CardTitle></CardHeader><CardContent className="space-y-4">
        {issues.map(issue => <div key={issue.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <p className="font-semibold">{issue.title ?? t("Verwijderde CRM-afspraak")}</p>
          <p className="text-muted">{t(issue.issue === "conflict" ? "Deze afspraak is aan beide kanten gewijzigd. Bekijk beide agenda’s en kies welke versie behouden moet blijven." : "Deze Apple-afspraak kan niet worden verwerkt. Controleer herhaling, uitnodigingen en datuminstellingen.")}</p>
          {issue.resolution ? <p>{t("Keuze opgeslagen; wordt bij de volgende synchronisatie verwerkt.")}</p> : issue.issue === "conflict" && <div className="flex flex-wrap gap-3">
            {(["crm", "apple"] as const).map(source => <form key={source} action={resolveAppleConflict.bind(null, issue.id, source)}><ConfirmSubmit message={t("Deze versie gebruiken? De andere versie wordt bij de volgende synchronisatie vervangen.")} className="rounded-lg border px-3 py-2">{t(source === "crm" ? "Gebruik CRM-versie" : "Gebruik Apple-versie")}</ConfirmSubmit></form>)}
          </div>}
        </div>)}
      </CardContent></Card>}
    </div>
  </>;
}
