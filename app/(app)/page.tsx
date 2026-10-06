import { tekst as uiTranslation } from '@/lib/i18n/server';
/**
 * Persoonlijke startpagina — de landingspagina na inloggen.
 * Begroeting op Madrid-tijd, eigen dagelijkse taken en open taken direct
 * zichtbaar naast de dagplanning. Overige controles en tegels zijn inklapbaar.
 * Het cijfer-dashboard leeft op /dashboard.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { requireModuleRead } from "@/lib/auth/guards";
import { datumTaal, tekst } from "@/lib/i18n/server";
import { salesTaskFilter } from "@/lib/auth/sales-scope";
import { magAlles } from "@/lib/auth/modules";
import { DagtakenLijst } from "@/components/dagtaken-lijst";
import { LinkButton } from "@/components/ui";
import { db } from "@/lib/db";
import { activities, users } from "@/lib/db/schema";
import { verzamelDagtaken } from "@/lib/dagtaken";
import { verzamelNavBadges } from "@/lib/nav-badges";
import type { StartPrefs } from "@/lib/start-tegels";

import { saveStartPrefs } from "./_start/actions";
import { MijnTaken, type MijnTaak } from "./_start/mijn-taken";
import { TegelGrid } from "./_start/tegel-grid";
import { DailyTasks } from "@/components/daily-tasks";
import { loadDailyTasks } from "@/lib/daily-tasks";
import { staffAgendaItems } from "@/lib/staff-notifications";
import { agendaDay } from "@/lib/agenda-dates";
import { TodayAgenda } from "./_start/today";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Start") };
}

/** Sleutel voor de begroeting; de vertaling gebeurt met t(). */
function begroeting(): string {
  const uur = Number(
    new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Madrid", hour: "numeric", hourCycle: "h23" }).format(
      new Date(),
    ),
  );
  if (uur < 6) return "Goedenacht";
  if (uur < 12) return "Goedemorgen";
  if (uur < 18) return "Goedemiddag";
  return "Goedenavond";
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ "geen-toegang"?: string }>;
}) {
  const t = await tekst();
  const ik = await requireModuleRead("start");
  const today = agendaDay(new Date());
  const userId = ik?.id ?? "";
  const isViewer = !ik?.heeftCap("schrijven");
  const allesZichtbaar = magAlles(ik?.rol);
  const geweigerd = "geen-toegang" in (await searchParams);

  const author = alias(users, "author");
  const [dagtaken, taakRows, teamleden, badges, [prefsRow], agendaItems, dailyTasks] = await Promise.all([
    verzamelDagtaken(ik?.rol, ik?.email),
    db
      .select({
        id: activities.id,
        subject: sql<string>`case when ${activities.subject} in ('Opvolging', 'Beursopvolging') then coalesce(nullif(trim(${activities.body}), ''), ${activities.subject}) else ${activities.subject} end`,
        dueAt: activities.dueAt,
        priority: activities.priority,
        authorId: activities.authorId,
        authorName: author.name,
      })
      .from(activities)
      .leftJoin(author, eq(activities.authorId, author.id))
      .where(
        and(
          eq(activities.type, "task"),
          salesTaskFilter(ik?.rol),
          isNull(activities.completedAt),
          sql`not (coalesce(${activities.subject}, '') in ('Opvolging', 'Beursopvolging') and (
            exists (select 1 from partner_profiles p where p.contact_id = ${activities.contactId} and p.stage = 'stopped') or
            exists (select 1 from contacts c where c.id = ${activities.contactId} and coalesce(c.tags, '{}'::text[]) @> array['opvolging:uitgesloten'])
          ))`,
          or(
            eq(activities.assigneeId, userId),
            and(isNull(activities.assigneeId), eq(activities.authorId, userId)),
          ),
        ),
      )
      .orderBy(
        sql`case ${activities.priority} when 'hoog' then 0 when 'middel' then 1 else 2 end`,
        sql`${activities.dueAt} asc nulls last`,
      )
      .limit(25),
    // De teamledenlijst is er om taken toe te wijzen; dat is niets voor een
    // beperkt account, en dan hoeft de lijst ook niet opgehaald te worden.
    allesZichtbaar
      ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(sql`${users.role} <> 'viewer'`).orderBy(asc(users.name))
      : Promise.resolve([] as { id: string; name: string | null; email: string }[]),
    verzamelNavBadges(ik?.rol, ik?.email, ik?.id),
    // Naam vers uit de DB: de JWT-sessie kan een oude naam cachen (30 dagen).
    db.select({ startPrefs: users.startPrefs, name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
    staffAgendaItems(userId, today),
    loadDailyTasks(ik, today),
  ]);

  // Tellers op de tegels: de nav-badges aangevuld met de dagtaken-signalen,
  // zodat bv. "Facturen" een teller krijgt bij vervallen facturen. Tegels met
  // een teller schuiven in de hoofdrij automatisch naar voren.
  const tegelBadges: Record<string, number> = { ...badges };
  for (const taak of dagtaken) {
    const route = taak.href.split("?")[0];
    tegelBadges[route] = Math.max(tegelBadges[route] ?? 0, taak.aantal);
  }

  const mijnTaken: MijnTaak[] = taakRows.map((t) => ({
    id: t.id,
    subject: t.subject,
    dueAt: t.dueAt,
    priority: t.priority,
    authorName: t.authorName,
    isVanAnder: !!t.authorId && t.authorId !== userId,
  }));

  const volleNaam = prefsRow?.name?.trim() || ik?.name?.trim() || "";
  const naam = volleNaam.split(" ")[0] || ik?.email || "";
  const datum = new Date().toLocaleDateString(await datumTaal(), {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(begroeting())}, {naam}
          </h1>
          <p className="mt-1 text-sm capitalize text-muted">{datum}</p>
        </div>
        {allesZichtbaar && (
          <LinkButton href="/dashboard" variant="secondary">
            {t("Naar het dashboard")} →
          </LinkButton>
        )}
      </div>

      {/* Iemand die een verboden pad intypte, hoort te weten waarom hij hier staat. */}
      {geweigerd && (
        <p className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {t("Dat onderdeel hoort niet bij jouw rol. Hieronder staat alles waar je wél bij kunt.")}
        </p>
      )}

      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted">{t("Jouw taken, dagelijkse controles en afspraken. Alles wat voor jou klaarstaat.")}</p>
      <div className="mb-6 grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <div id="taken" className="space-y-5">
          <DailyTasks tasks={dailyTasks} day={today} userId={userId} readOnly={isViewer}/>
          <MijnTaken hasDailyTasks={dailyTasks.length > 0} taken={mijnTaken} teamleden={teamleden} readOnly={isViewer}/>
        </div>
        <div id="vandaag" className="space-y-5">
          <TodayAgenda hasDailyTasks={dailyTasks.length > 0} items={agendaItems} readOnly={isViewer}/>
          <div className="flex flex-wrap gap-3">
            {ik.magModule("klantopvolging")&&<LinkButton href="/opvolging" variant="secondary">{t("Opvolging")}{(badges['/opvolging']??0)>0?` · ${badges['/opvolging']}`:''}</LinkButton>}
            {ik.magModule("teamberichten")&&<LinkButton href="/teamberichten" variant="secondary">{t("Teamberichten")}{(badges['/teamberichten']??0)>0?` · ${badges['/teamberichten']}`:''}</LinkButton>}
            {ik.heeftCap("teambeheer")&&<LinkButton href="/agenda?owner=all&kind=task" variant="secondary">{t("Taken per medewerker")}</LinkButton>}
          </div>
        </div>
      </div>
      <details id="controles" className="mb-5 rounded-xl border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("Overige aandachtspunten")}{dagtaken.length?` · ${dagtaken.length}`:''}</summary>
        <div className="mt-4"><DagtakenLijst taken={dagtaken} titel={t("Wat vraagt aandacht")} className=""/></div>
      </details>
      <details id="onderdelen" className="rounded-xl border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("Onderdelen")}</summary>
        <div className="mt-4"><TegelGrid prefs={(prefsRow?.startPrefs as StartPrefs | null) ?? null} badges={tegelBadges} saveAction={saveStartPrefs} rol={ik?.rol}/></div>
      </details>
    </>
  );
}
