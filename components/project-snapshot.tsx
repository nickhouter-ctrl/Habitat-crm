import Link from "next/link";
import { datumTaal, tekst } from "@/lib/i18n/server";
import type { AdvanceCover } from "@/lib/project-financials";
import type { projectProgress } from "@/lib/project-progress";
import { formatDate, formatEUR } from "@/lib/utils";
import { Badge, Card, CardContent, LinkButton } from "./ui";
import { ProjectFundingSummary } from "./project-funding-summary";

export async function ProjectSnapshot({ id, cover, progress, status, requestedOpen, outstandingInvoices, startDate, endDate }: {
  id: string; cover: AdvanceCover; progress: ReturnType<typeof projectProgress>; status: string;
  requestedOpen: number; outstandingInvoices: number; startDate: string | null; endDate: string | null;
}) {
  const t = await tekst(), locale = await datumTaal();
  const needsAdvance = status === "active" && cover.status !== "gedekt";
  const label = status !== "active" ? t("Project afgesloten") : cover.requiredRevenue <= 0.01 && cover.totalReceived <= 0.01
    ? t("Nog geen werk geboekt") : cover.status === "voorgeschoten" ? t("Voorschot nodig") : cover.status === "bijna_op" ? t("Nieuw voorschot voorbereiden") : t("Voldoende voorschotruimte");
  return <Card className="mb-5 overflow-hidden" data-project-snapshot>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-background/40 px-5 py-5">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{t("Projectstand")}</p><Badge tone={status === "active" ? cover.tone : "neutral"}>{label}</Badge>
        <p className="mt-3 max-w-2xl text-sm text-muted">{t("Ontvangsten voor eigen producten staan apart. Hier zie je welk klantgeld overblijft voor de jongens en inkopen bij derden, na de geboekte kosten.")}</p>
      </div>
      <LinkButton href="#voorschot-opvragen" variant={needsAdvance ? "primary" : "secondary"}>{t(requestedOpen > 0.01 ? "Bestaand voorschot opvolgen" : needsAdvance ? "Voorschot voorbereiden" : "Voorschotten bekijken")}</LinkButton>
    </div>
    <CardContent>
      <ProjectFundingSummary cover={cover}/>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
        <span>{progress.percent === null ? t("Voortgang nog niet vastgelegd") : `${t("Voortgang")} ${progress.percent}% · ${t("{done} van {total} fases afgerond", { done: progress.completed, total: progress.total })}`}{progress.current && <span className="ml-2 text-muted">· {progress.current}</span>}</span>
        <Link href="#planning" className="text-accent underline-offset-4 hover:underline">{t("Voortgang bijwerken")}</Link>
      </div>
      {progress.percent !== null && <div role="progressbar" aria-label={t("Voortgang")} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-accent" style={{width:`${progress.percent}%`}}/></div>}
      {(startDate || endDate) && <p className="mt-3 text-xs text-muted">{t("Planning")}: {formatDate(startDate, locale)} → {formatDate(endDate, locale)}</p>}
      {needsAdvance && requestedOpen <= 0.01 && outstandingInvoices <= 0.01 && <p className="mt-4 rounded-lg bg-accent/5 px-3 py-2 text-sm">{t("Voorstel volgend voorschot: {amount} (inclusief buffer). Controleer de termijn en het bedrag vóór versturen.", { amount: formatEUR(cover.suggestedRequestEur) })}</p>}
      {requestedOpen > 0.01 && <p className="mt-4 rounded-lg bg-warning/5 px-3 py-2 text-sm">{t("Er staat al {amount} aan voorschotverzoeken open. Controleer die eerst voordat je opnieuw vraagt.", { amount: formatEUR(requestedOpen) })}</p>}
      {outstandingInvoices > 0.01 && <div className="mt-4 rounded-lg bg-warning/5 px-3 py-2 text-sm"><p>{t("Er staat {amount} aan klantfacturen open (ex. btw). Volg die op en stem een nieuw voorschot af op de afgesproken termijnen.", { amount: formatEUR(outstandingInvoices) })}</p><Link href="#documenten" className="mt-1 inline-block text-accent underline underline-offset-4">{t("Openstaande facturen bekijken")}</Link></div>}
    </CardContent>
  </Card>;
}
