/**
 * Persoonlijke startpagina — de landingspagina na inloggen.
 * Begroeting op Madrid-tijd, "Vandaag" (automatische dagtaken + mijn taken)
 * en alle functies als grote tegels op werkvolgorde (per gebruiker indeelbaar).
 * Het cijfer-dashboard leeft op /dashboard.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { auth } from "@/auth";
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

export const metadata = { title: "Start" };

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

export default async function StartPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const isViewer = session?.user?.role === "viewer";

  const author = alias(users, "author");
  const [dagtaken, taakRows, teamleden, badges, [prefsRow]] = await Promise.all([
    verzamelDagtaken(),
    db
      .select({
        id: activities.id,
        subject: activities.subject,
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
          isNull(activities.completedAt),
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
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.name)),
    verzamelNavBadges(),
    // Naam vers uit de DB: de JWT-sessie kan een oude naam cachen (30 dagen).
    db.select({ startPrefs: users.startPrefs, name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
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

  const volleNaam = prefsRow?.name?.trim() || session?.user?.name?.trim() || "";
  const naam = volleNaam.split(" ")[0] || session?.user?.email || "";
  const datum = new Date().toLocaleDateString("nl-NL", {
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
            {begroeting()}, {naam} 👋
          </h1>
          <p className="mt-1 text-sm capitalize text-muted">{datum}</p>
        </div>
        <LinkButton href="/dashboard" variant="secondary">
          Naar het dashboard →
        </LinkButton>
      </div>

      <div className="mb-8 grid items-start gap-5 lg:grid-cols-2">
        <DagtakenLijst taken={dagtaken} titel="Wat moet er vandaag gebeuren" className="" />
        <MijnTaken taken={mijnTaken} teamleden={teamleden} readOnly={isViewer} />
      </div>

      <TegelGrid prefs={(prefsRow?.startPrefs as StartPrefs | null) ?? null} badges={tegelBadges} saveAction={saveStartPrefs} />
    </>
  );
}
