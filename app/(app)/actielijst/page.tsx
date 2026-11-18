import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CheckSquare, Plus } from "lucide-react";
import { z } from "zod";
import { requireModuleRead } from "@/lib/auth/guards";
import { datumTaal, tekst } from "@/lib/i18n/server";
import { agendaDay, AGENDA_TIME_ZONE } from "@/lib/agenda-dates";
import { actieKleur, bestaandeIndeling, deadlineTekst, groepeer, isAchterstallig } from "@/lib/actielijst";
import { laadActielijst, toewijsbareMedewerkers } from "@/lib/actielijst-db";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, StatTile, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { WorkflowModal } from "@/components/workflow-modal";
import { ActiepuntForm, ActieArchiefKnop, ActieKlaarVinkje, LinkKopieerKnop, OpmerkingForm } from "./forms";
import { zorgVoorActielijstLinks } from "@/lib/actielijst-link";
import { vernieuwLink } from "./actions";

/** De kleur van een regel: dezelfde regels als in de herinneringsmail. */
const TOON = { neutraal: "neutral", bezig: "warning", achterstallig: "danger", klaar: "success" } as const;

export async function generateMetadata(){ return { title: (await tekst())("Actielijst") }; }
export default async function ActielijstPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const ik = await requireModuleRead("actielijst"), t = await tekst(), locale = await datumTaal(), sp = await searchParams;
  const uuid = (v: unknown) => z.string().uuid().safeParse(v).success ? v as string : null;
  const mag = ik.heeftCap("schrijven"), vandaag = agendaDay(new Date());
  const weergave = sp.weergave === "alles" || sp.weergave === "archief" ? sp.weergave : "open";
  const alleenIk = sp.wie === "mij", geselecteerd = uuid(sp.taak), nieuw = sp.nieuw === "1";
  // Dezelfde query als de persoonlijke link gebruikt, zodat de twee ingangen
  // niet uit elkaar kunnen lopen.
  const [{ rijen, alles, opmerkingen, selectie }, medewerkers] = await Promise.all([
    laadActielijst({ weergave, alleenVoor: alleenIk ? ik.id : null, punt: geselecteerd }),
    toewijsbareMedewerkers(),
  ]);
  const indeling = bestaandeIndeling(alles);
  // De persoonlijke links staan hier, want hier beheer je ze ook.
  const links = mag ? await zorgVoorActielijstLinks() : [];
  const open = alles.filter(r => r.status !== "done"), achterstallig = open.filter(r => isAchterstallig(r, vandaag));
  const kort = (dag: string) => new Date(`${dag}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", day: "numeric", month: "short" });
  const tijd = (at: Date) => at.toLocaleString(locale, { timeZone: AGENDA_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const tab = (naam: string, href: string, actief: boolean) => <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm ${actief ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-surface"}`}>{naam}</Link>;
  const lijstHref = `/actielijst?weergave=${weergave}${alleenIk ? "&wie=mij" : ""}`;

  return <><PageHeader title={t("Actielijst")} subtitle={t("Wat er moet gebeuren, wie het oppakt en wanneer het klaar moet zijn. Iedereen die met de lijst werkt kan punten toevoegen, bijwerken, opmerkingen plaatsen en afvinken.")}
    actions={mag && <Link href={`${lijstHref}&nieuw=1`} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"><Plus size={16}/>{t("Nieuw actiepunt")}</Link>}/>
    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <StatTile label={t("Open punten")} value={String(open.length)} tone="accent"/>
      <StatTile label={t("Deadline verstreken")} value={String(achterstallig.length)} tone={achterstallig.length ? "danger" : "neutral"} hint={t("De verantwoordelijke krijgt hierover een aparte mail.")}/>
      <StatTile label={t("Van mij")} value={String(open.filter(r => r.assigneeId === ik.id).length)} tone="neutral"/>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {tab(t("Open punten"), `/actielijst${alleenIk ? "?wie=mij" : ""}`, weergave === "open")}
      {tab(t("Alles, ook afgerond"), `/actielijst?weergave=alles${alleenIk ? "&wie=mij" : ""}`, weergave === "alles")}
      {tab(t("Uit de lijst gehaald"), `/actielijst?weergave=archief${alleenIk ? "&wie=mij" : ""}`, weergave === "archief")}
      <span className="mx-1 h-6 w-px bg-border"/>
      {tab(alleenIk ? t("Alleen van mij") : t("Van iedereen"), `/actielijst?weergave=${weergave}${alleenIk ? "" : "&wie=mij"}`, alleenIk)}
      <p className="ml-auto text-xs text-muted">{t("Rood = deadline verstreken · Oranje = iemand is ermee bezig · Groen = klaar")}</p>
    </div>
    <div className="mb-5 rounded-lg border border-border bg-background/50 px-3 py-2">
      <p className="text-xs leading-relaxed text-muted">{t("Een punt met een deadline staat ook als taak in de teamagenda, en komt zo mee in je eigen agenda op de telefoon en in het ochtendoverzicht van 08:00.")}</p>
    </div>

    {rijen.length ? <div className="space-y-5">{groepeer(rijen).map(groep => <Card key={groep.groep}>
      <CardHeader><CardTitle>{groep.groep}</CardTitle><Badge>{groep.subgroepen.reduce((n, s) => n + s.regels.length, 0)}</Badge></CardHeader>
      {groep.subgroepen.map(sub => <div key={sub.naam ?? "-"}>
        {sub.naam && <p className="border-t bg-background/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{sub.naam}</p>}
        <Table>
          <THead><tr><Th className="w-10"><span className="sr-only">{t("Klaar")}</span></Th><Th>{t("Actiepunt")}</Th><Th className="hidden w-40 sm:table-cell">{t("Wie")}</Th><Th className="hidden w-28 sm:table-cell">{t("Deadline")}</Th><Th className="hidden w-64 lg:table-cell">{t("Opmerking")}</Th></tr></THead>
          <TBody>{sub.regels.map(rij => {
            const kleur = actieKleur(rij, vandaag), laatste = opmerkingen.filter(o => o.itemId === rij.id).at(-1), aantal = opmerkingen.filter(o => o.itemId === rij.id).length;
            return <Tr key={rij.id} className={kleur === "achterstallig" ? "bg-red-50/60" : kleur === "klaar" ? "bg-green-50/40" : undefined}>
              <Td className="pr-0">{mag ? <ActieKlaarVinkje id={rij.id} titel={rij.title} klaar={rij.status === "done"}/> : <span className={`block size-3 rounded-full ${kleur === "klaar" ? "bg-success" : kleur === "achterstallig" ? "bg-danger" : kleur === "bezig" ? "bg-warning" : "bg-border"}`}/>}</Td>
              <Td><Link href={`${lijstHref}&taak=${rij.id}`} className="block font-medium hover:text-accent">{rij.title}</Link>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  {rij.status !== "open" && <Badge tone={TOON[kleur]}>{t(rij.status === "done" ? "Klaar" : "Bezig")}</Badge>}
                  {kleur === "achterstallig" && <Badge tone="danger">{t("Deadline verstreken")}</Badge>}
                  {rij.helpers && <span className="text-xs text-muted">{t("Samen met")}: {rij.helpers}</span>}
                </span>
                {/* Op een telefoon staat alles onder elkaar in plaats van in kolommen. */}
                <span className="mt-1 block text-xs text-muted sm:hidden">{rij.teamwide ? t("Hele team") : rij.assigneeName ?? t("Nog niemand")}{rij.dueDate ? ` · ${kort(rij.dueDate)}` : ""}{aantal ? ` · ${aantal}×` : ""}</span></Td>
              <Td className="hidden text-sm sm:table-cell">{rij.teamwide ? t("Hele team") : rij.assigneeName ?? rij.assigneeEmail ?? <span className="text-xs text-muted">{t("Nog niemand")}</span>}</Td>
              <Td className={`hidden text-sm sm:table-cell ${kleur === "achterstallig" ? "font-semibold text-danger" : ""}`}>{rij.dueDate ? kort(rij.dueDate) : <span className="text-xs text-muted">—</span>}</Td>
              <Td className="hidden lg:table-cell"><Link href={`${lijstHref}&taak=${rij.id}`} className="block text-xs leading-relaxed text-muted hover:text-accent">{laatste ? <>{aantal > 1 && <span className="mr-1 font-semibold">{aantal}×</span>}<span className="line-clamp-2">{laatste.body}</span></> : t("Opmerking plaatsen")}</Link></Td>
            </Tr>;
          })}</TBody>
        </Table>
      </div>)}
    </Card>)}</div> : <EmptyState icon={<CheckSquare/>} title={t(weergave === "archief" ? "Niets uit de lijst gehaald." : alleenIk ? "Geen punten voor jou." : "Nog geen actiepunten.")} description={t("Zet erin wat er moet gebeuren — showroom, magazijn, logistiek, social media. Met een verantwoordelijke en een deadline erbij.")} action={mag && <Link href={`${lijstHref}&nieuw=1`} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"><Plus size={16}/>{t("Nieuw actiepunt")}</Link>}/>}

    {mag && <Card className="mt-6">
      <CardHeader><CardTitle>{t("Persoonlijke links")}</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-4 text-sm leading-relaxed text-muted">{t("Met deze link staat de lijst op de telefoon open zonder inloggen. De link is persoonlijk: afvinken en opmerkingen komen op naam. Maak een nieuwe link als iemand hem kwijt is — de oude werkt dan direct niet meer.")}</p>
        <ul className="divide-y divide-border">{links.map(lid => <li key={lid.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-28 text-sm font-medium">{lid.name ?? lid.email}</span>
          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs text-muted">{lid.link?.url ?? "—"}</code>
          {lid.link && <LinkKopieerKnop url={lid.link.url}/>}
          <form action={vernieuwLink}><input type="hidden" name="userId" value={lid.id}/><button className="rounded-lg border border-border px-3 py-2 text-sm text-muted">{t("Nieuwe link")}</button></form>
          <span className="text-xs text-muted">{lid.link?.lastSeenAt ? t("laatst geopend {wanneer}", { wanneer: tijd(lid.link.lastSeenAt) }) : t("nog niet geopend")}</span>
        </li>)}</ul>
      </CardContent>
    </Card>}

    {mag && nieuw && <WorkflowModal title={t("Nieuw actiepunt")} closeHref={lijstHref}>
      <ActiepuntForm submissionId={randomUUID()} team={medewerkers} indeling={indeling} vandaag={vandaag} sluitHref={lijstHref}/>
    </WorkflowModal>}

    {selectie && <WorkflowModal title={selectie.title} closeHref={lijstHref}>
      <div className="space-y-6">
        {mag ? <ActiepuntForm submissionId={selectie.id} team={medewerkers} indeling={indeling} vandaag={vandaag} sluitHref={lijstHref}
          punt={{ id: selectie.id, groupName: selectie.groupName, subgroup: selectie.subgroup, title: selectie.title, description: selectie.description, assigneeId: selectie.assigneeId, teamwide: selectie.teamwide, helpers: selectie.helpers, dueDate: selectie.dueDate, status: selectie.status }}/>
          : <div className="space-y-2 text-sm"><p className="text-muted">{selectie.groupName}{selectie.subgroup ? ` · ${selectie.subgroup}` : ""}</p>{selectie.description && <p className="whitespace-pre-wrap leading-relaxed">{selectie.description}</p>}<p>{t("Wie")}: {selectie.teamwide ? t("Hele team") : selectie.assigneeName ?? t("Nog niemand")}</p>{selectie.dueDate && <p>{t("Deadline")}: {deadlineTekst(selectie.dueDate, locale)}</p>}</div>}
        {selectie.dueDate && isAchterstallig(selectie, vandaag) && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{selectie.assigneeId ? t("De deadline van {datum} is verstreken. De verantwoordelijke krijgt hierover een mail.", { datum: deadlineTekst(selectie.dueDate, locale) }) : t("De deadline van {datum} is verstreken. Zonder verantwoordelijke gaat er geen mail uit.", { datum: deadlineTekst(selectie.dueDate, locale) })}</p>}
        <div className="space-y-3 border-t pt-5">
          <p className="text-sm font-semibold">{t("Opmerkingen")}</p>
          {opmerkingen.filter(o => o.itemId === selectie.id).map(o => <div key={o.id} className="rounded-lg border border-border bg-background/50 px-3 py-2">
            <p className="text-xs text-muted">{o.authorName ?? t("Medewerker")} · {tijd(o.createdAt)}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{o.body}</p>
          </div>)}
          {!opmerkingen.some(o => o.itemId === selectie.id) && <p className="text-sm text-muted">{t("Nog geen opmerkingen.")}</p>}
          {mag && <OpmerkingForm itemId={selectie.id}/>}
        </div>
        {mag && <div className="flex flex-wrap items-center gap-3 border-t pt-5"><ActieArchiefKnop id={selectie.id} inArchief={!!selectie.archivedAt} sluitHref={lijstHref}/><span className="text-xs text-muted">{t("Uit de lijst halen laat het punt en de opmerkingen staan onder ‘Uit de lijst gehaald’.")}</span></div>}
      </div>
    </WorkflowModal>}
  </>;
}
