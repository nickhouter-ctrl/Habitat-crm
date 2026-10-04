import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Calculator, FileText, Layers3, Table2 } from "lucide-react";
import { TabPanel, TabsBar, TabsRoot } from "@/components/tabs";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, LinkButton, Select, StatTile, Table, THead, TBody, Th, Td, Tr } from "@/components/ui";
import type { DistributeurItem, DistributeurMaat } from "@/lib/distributeur-catalogus";
import { DEALER_STAFFELS, KORTING_SHOWROOM, MIN_MARGE_SHOWROOM, MIN_MARGE_VERKOOPPUNT, brutomarge, distributeurPrijzen, staffelMetId } from "@/lib/distributeur-prijzen";
import type { prijsVoorstelInvoer } from "@/lib/distributeur-invoer";
import type { z } from "zod";
import type { T } from "@/lib/i18n";
import { formatEUR as money } from "@/lib/utils";
const formatEUR = (n: number | null | undefined) => n == null ? "—" : money(n);

export function volumeLabel(s: typeof DEALER_STAFFELS[number]) {
  const n = (v: number) => v.toLocaleString("nl-NL");
  return s.totM2 == null ? `${n(s.vanafM2)}+ m²` : `${n(s.vanafM2)}–<${n(s.totM2)} m²`;
}
const pct = (v: number | null | undefined) => v == null ? "—" : `${v.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
function Prijs({ ex, incl, m, t }: { ex: number | null; incl: number | null; m: DistributeurMaat; t: T }) {
  if (ex == null) return <span className="text-xs text-muted">{t("Op aanvraag")}</span>;
  return <div className="space-y-1 whitespace-nowrap text-right text-xs tabular-nums">
    <p className="text-sm font-semibold text-foreground">{formatEUR(ex)} <span className="text-[10px] font-normal text-muted">{t("ex. btw")}</span></p>
    <p className="text-muted">{formatEUR(incl)} {t("incl. btw")}</p>
    {m.areaM2 && <div className="border-t border-border/50 pt-1 text-muted">
      <p>{formatEUR(ex / m.areaM2)}/m² {t("ex. btw")}</p>
      <p>{formatEUR((incl ?? 0) / m.areaM2)}/m² {t("incl. btw")}</p>
    </div>}
  </div>;
}

export function DealerPricing({ items, series, invoer, t, mailForm }: {
  items: DistributeurItem[]; series: string[]; invoer: z.infer<typeof prijsVoorstelInvoer>; t: T; mailForm?: ReactNode;
}) {
  const staffel = staffelMetId(invoer.staffel);
  const zichtbaar = invoer.serie ? items.filter(i => i.groep === invoer.serie) : items;
  const maten = items.flatMap(i => i.maten);
  const verlies70 = maten.filter(m => m.geregistreerdeKost != null && m.adviesEx * .3 < m.geregistreerdeKost).length;
  const opAanvraag = maten.filter(m => m.verkooppunt == null).length;
  const showroomBegrensd = maten.filter(m => m.display.begrensd && m.showroom != null).length;
  const voorTransport = invoer.extra === 0;
  const query = new URLSearchParams({ staffel: staffel.id, extra: String(invoer.extra), serie: invoer.serie });
  const pdf = `/prijslijst/distributeur/pdf?${query}`;
  const bron: Record<string, string> = { maat: t("Kosten per maat"), basis: t("Kosten basismaat"), conservatief: t("Hoogste geregistreerde kosten"), raming: t("Alleen een m²-raming"), ontbreekt: t("Kostprijs ontbreekt") };
  return <div className="space-y-5">
    <Card className="overflow-hidden border-accent/20">
      <CardContent className="grid gap-6 py-6 md:grid-cols-[1.4fr_1fr]">
        <div><Badge tone="warning">{t("Prijsvoorstel")}</Badge>
          <h2 className="mt-3 font-display text-2xl font-semibold">{t("Een sterk verkooppunt. Een gezonde marge.")}</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{t("Elke maat heeft zijn eigen adviesprijs en kostprijs. De staffel geeft een doelkorting; de berekende paneelprijs bewaakt onze ondergrens.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-5 md:border-l md:pl-6">
          <div><p className="font-display text-3xl font-semibold text-accent">35–45%</p><p className="mt-1 text-xs text-muted">{t("Korting bij doorverkoop")}</p></div>
          <div><p className="font-display text-3xl font-semibold">≤{KORTING_SHOWROOM}%</p><p className="mt-1 text-xs text-muted">{t("Eenmalig showroommateriaal")}</p></div>
          <p className="col-span-2 text-xs leading-relaxed text-muted">{t("Adviesprijzen zijn vrijblijvend. Bestaande contracten, productprijzen en offertes wijzigen niet automatisch.")}</p>
        </div>
      </CardContent>
    </Card>

    <Card><CardContent>
      <form action="/wederverkopers/prijzen" method="GET" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1fr_auto] [&_label]:block">
        <Field label={t("Jaarstaffel")} htmlFor="dealer-staffel"><Select id="dealer-staffel" name="staffel" defaultValue={staffel.id}>
          {DEALER_STAFFELS.map(s => <option key={s.id} value={s.id}>{volumeLabel(s)} · {s.kortingPct}%</option>)}
        </Select></Field>
        <Field label={t("Extra kosten €/m² ex. btw")} htmlFor="dealer-extra" hint={t("Vervoer Valencia, opslag, breuk en service")}>
          <input id="dealer-extra" name="extra" type="number" min="0" max="1000" step="0.01" defaultValue={invoer.extra} className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("Serie")} htmlFor="dealer-serie"><Select id="dealer-serie" name="serie" defaultValue={invoer.serie}>
          <option value="">{t("Alle series")}</option>{series.map(s => <option key={s}>{s}</option>)}
        </Select></Field>
        <Button type="submit" variant="secondary" className="self-start sm:mt-6">{t("Herberekenen")}</Button>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-muted">{voorTransport ? t("Bij €0 zijn vervoer Valencia–Xàbia en verdere bedrijfskosten nog niet meegerekend. De bijdrage is dus geen nettowinst. Vul de werkelijke aanvulling in vóór een definitieve offerte.") : t("De ingevulde extra kosten worden per paneeloppervlak toegevoegd. Controleer of alle kosten hiermee zijn gedekt; vaste bedrijfskosten komen nog uit de bijdrage.")}</p>
    </CardContent></Card>

    <TabsRoot defaultTab="staffels" ids={["staffels", "prijzen", "marge", "document"]}>
      <TabsBar tabs={[{id:"staffels",label:t("Staffels & afspraken"),icon:<Layers3/>},{id:"prijzen",label:t("Paneelprijzen"),icon:<Table2/>},{id:"marge",label:t("Onze marge · intern"),icon:<Calculator/>},{id:"document",label:t("Printen & downloaden"),icon:<FileText/>}]} />
      <TabPanel id="staffels">
        <Card><CardHeader><div><CardTitle>{t("Korting groeit met aantoonbare afname")}</CardTitle><p className="mt-1 text-xs text-muted">{t("Betaalde paneelafname over 12 maanden, na retouren en creditnota’s.")}</p></div></CardHeader>
          <Table><THead><tr><Th>{t("Jaarafname")}</Th><Th className="text-right">{t("Doelkorting")}</Th><Th className="text-right">{t("Aandeel adviesprijs")}</Th><Th>{t("Toepassing")}</Th></tr></THead>
            <TBody>{DEALER_STAFFELS.map((s,i) => <Tr key={s.id} className={s.id === staffel.id ? "bg-accent/5" : ""}><Td className="font-semibold tabular-nums">{volumeLabel(s)}</Td><Td className="text-right font-semibold text-accent">{pct(s.kortingPct)}</Td><Td className="text-right tabular-nums">{pct(100 - s.kortingPct)}</Td><Td className="text-muted">{i === 0 ? t("Starttarief") : t("Na bevestigde afname")}</Td></Tr>)}</TBody>
          </Table>
          <CardContent><p className="text-xs leading-relaxed text-muted">{t("Een hoger tarief geldt pas na schriftelijke bevestiging, voor volgende orders. Geen terugwerkende korting op eerdere orders. Showroompanelen, samples, lijm en vracht tellen niet mee als verkochte paneel-m².")}</p></CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent><h3 className="font-semibold">{t("Marge vóór korting")}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{t("Verkooppunten: minimaal {dealer}% brutomarge. Showroom: minimaal {showroom}%. Waar nodig daalt de korting per maat. Zonder bruikbare kostprijs: op aanvraag.",{dealer:MIN_MARGE_VERKOOPPUNT,showroom:MIN_MARGE_SHOWROOM})}</p></CardContent></Card>
          <Card><CardContent><h3 className="font-semibold">{t("Showroom met een budget")}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{t("Maximaal 60% op vooraf afgesproken displaypanelen. Eén presentatie per locatie, met vastgelegde maten en aantallen. Geen stapeling met staffelkorting. Vervoer en montage afzonderlijk begroten.")}</p></CardContent></Card>
          <Card><CardContent><h3 className="font-semibold">{t("Architectenkoffer")}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{t("Behandel de koffer als een apart samplepakket: koffer, trays, samples, drukwerk, handling en verzending. Leg een verkoopprijs of bruikleenafspraak vast; geen automatische showroomkorting of gratis pakket.")}</p></CardContent></Card>
        </div>
      </TabPanel>

      <TabPanel id="prijzen">
        <Card><CardHeader><div><CardTitle>{invoer.serie || t("Alle series")}</CardTitle><p className="mt-1 text-xs text-muted">{t("Per paneel én per m², exclusief en inclusief de artikel-btw.")}</p></div><Badge tone="accent">{volumeLabel(staffel)} · {pct(staffel.kortingPct)}</Badge></CardHeader>
          <Table wrapperClassName="max-h-[70vh] overflow-y-auto"><THead className="sticky top-0 z-10 bg-surface"><tr><Th>{t("Paneel / maat")}</Th><Th className="text-right">{t("Adviesprijs")}</Th><Th className="text-right">{t("Verkooppunt")}</Th><Th className="text-right">{t("Showroom")}</Th></tr></THead>
            <TBody>{zichtbaar.map(item => <Fragment key={item.id}><Tr className="bg-background/60"><Td colSpan={4}><Link href={`/products/${item.id}/edit`} className="font-semibold hover:underline">{item.naam}</Link><span className="ml-2 text-xs text-muted">{item.sku}</span></Td></Tr>
              {item.maten.map((m,i) => <Tr key={`${item.id}-${i}`}><Td><p className="whitespace-nowrap font-medium">{m.dim}</p><p className="mt-1 text-xs text-muted">{m.areaM2?.toLocaleString("nl-NL")} m² · {m.sku}</p>{m.inStock && <Badge className="mt-2" tone="success">{t("Voorraad")}</Badge>}</Td>
                <Td><Prijs ex={m.adviesEx} incl={m.adviesIncl} m={m} t={t}/></Td>
                <Td><Prijs ex={m.verkooppunt} incl={m.verkooppuntIncl} m={m} t={t}/>{m.dealer.begrensd && <p className="mt-2 text-right text-xs text-warning">{t("Korting begrensd")} · {pct(m.dealer.kortingPct)}</p>}</Td>
                <Td><Prijs ex={m.showroom} incl={m.showroomIncl} m={m} t={t}/>{m.display.begrensd && <p className="mt-2 text-right text-xs text-warning">{t("Korting begrensd")} · {pct(m.display.kortingPct)}</p>}</Td></Tr>)}
            </Fragment>)}</TBody>
          </Table>
        </Card>
      </TabPanel>

      <TabPanel id="marge">
        <div className="grid gap-3 sm:grid-cols-3"><StatTile label={t("70% zou verlies geven")} value={verlies70} hint={t("maten met geregistreerde kosten")}/><StatTile label={t("Showroomkorting begrensd")} value={showroomBegrensd} hint={t("om de ondergrens te bewaken")}/><StatTile label={t("Kostprijs eerst controleren")} value={opAanvraag} hint={t("maten op aanvraag")}/></div>
        <Card><CardHeader><div><CardTitle>{t("Wat houden wij per maat over?")}</CardTitle><p className="mt-1 text-xs text-muted">{t("Intern overzicht. Kostprijzen en onze bijdrage komen niet in het verkooppuntdocument.")}</p></div></CardHeader>
          <Table wrapperClassName="max-h-[70vh] overflow-y-auto"><THead className="sticky top-0 z-10 bg-surface"><tr><Th>{t("Paneel / maat")}</Th><Th className="text-right">{t("Kosten ex. btw")}</Th><Th className="text-right">{t("Onze bijdrage dealer")}</Th><Th className="text-right">{t("Onze bijdrage showroom")}</Th><Th className="text-right">{t("Ruimte extra vervoer")}</Th><Th>{t("Kostenbron")}</Th></tr></THead>
            <TBody>{zichtbaar.flatMap(item => item.maten.map((m,i) => {
              const budget = m.verkooppunt != null && m.kostEx != null && m.areaM2 ? Math.max(0,(m.verkooppunt * (1-MIN_MARGE_VERKOOPPUNT/100) - m.kostEx)/m.areaM2) : null;
              const oud = m.geregistreerdeKost != null ? brutomarge(m.adviesEx*.3,m.geregistreerdeKost) : null;
              const raming = m.kostenbron === "raming" && m.geraamdeKost != null ? distributeurPrijzen(m.adviesEx,m.geraamdeKost+m.extraKost,{staffelId:staffel.id},m.vatRate) : null;
              return <Tr key={`${item.id}-${i}`}><Td><Link className="font-medium hover:underline" href={`/products/${item.id}/edit`}>{item.naam}</Link><p className="mt-1 whitespace-nowrap text-xs text-muted">{m.dim} · {m.sku}</p></Td>
                <Td className="text-right tabular-nums">{formatEUR(m.kostEx)}<p className="text-xs text-muted">{m.areaM2 && m.kostEx != null ? `${formatEUR(m.kostEx/m.areaM2)}/m²` : "—"}</p>{raming && <p className="mt-1 text-xs text-warning">{t("Raming")} {formatEUR(m.geraamdeKost!+m.extraKost)}</p>}</Td>
                <Td className="text-right tabular-nums"><p className="font-semibold">{formatEUR(m.dealer.bijdrage)}</p><p className="text-xs text-muted">{pct(m.dealer.margePct)}{m.areaM2 && m.dealer.bijdrage != null ? ` · ${formatEUR(m.dealer.bijdrage/m.areaM2)}/m²` : ""}</p>{m.verkooppunt != null && <p className="mt-1 text-xs text-muted">{t("Winkel bij adviesprijs")}: {formatEUR(m.adviesEx-m.verkooppunt)}</p>}{raming && <p className="mt-1 text-xs text-warning">{t("Indicatief")}: {formatEUR(raming.dealer.bijdrage)}</p>}</Td>
                <Td className="text-right tabular-nums"><p className="font-semibold">{formatEUR(m.display.bijdrage)}</p><p className="text-xs text-muted">{pct(m.display.margePct)}{m.areaM2 && m.display.bijdrage != null ? ` · ${formatEUR(m.display.bijdrage/m.areaM2)}/m²` : ""}</p>{oud && <p className={`mt-1 text-xs ${oud.eur<0?"text-danger":"text-muted"}`}>{t("Bij 70%")}: {formatEUR(oud.eur)}</p>}</Td>
                <Td className="text-right tabular-nums">{formatEUR(budget)}{budget != null && <p className="text-xs text-muted">{t("per m² vóór {n}% marge",{n:MIN_MARGE_VERKOOPPUNT})}</p>}</Td>
                <Td><p className={`text-xs ${["raming","ontbreekt","conservatief"].includes(m.kostenbron)?"text-warning":"text-muted"}`}>{bron[m.kostenbron]}</p><Link className="mt-1 block text-xs text-accent hover:underline" href={`/products/${item.id}/edit`}>{t("Kosten controleren")}</Link></Td>
              </Tr>;
            }))}</TBody>
          </Table>
          <CardContent><p className="text-xs leading-relaxed text-muted">{t("Brutomarge = (verkoopprijs − meegenomen kosten) / verkoopprijs. De bijdrage betaalt nog lonen, huur, marketing en andere overhead. Raming per m² wordt alleen intern getoond; een andere maat krijgt pas een inkoopprijs na registratie van de eigen kosten.")}</p></CardContent>
        </Card>
      </TabPanel>

      <TabPanel id="document"><Card><CardContent className="space-y-5 py-6"><div><h3 className="font-display text-xl font-semibold">{t("Een document voor je verkooppunt")}</h3><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{t("Met staffels, voorwaarden, paneelfoto’s en actuele prijzen per maat. Het document bevat de geselecteerde jaarstaffel. Onze kostprijzen en marges blijven intern.")}</p></div>
        <form action="/prijslijst/distributeur/pdf" method="GET" target="_blank" className="flex flex-wrap items-end gap-3"><input type="hidden" name="staffel" value={staffel.id}/><input type="hidden" name="extra" value={invoer.extra}/><input type="hidden" name="serie" value={invoer.serie}/><Field label={t("Taal")} htmlFor="dealer-taal"><Select id="dealer-taal" name="taal" defaultValue="es"><option value="es">Español</option><option value="en">English</option><option value="nl">Nederlands</option><option value="de">Deutsch</option></Select></Field><Button type="submit" name="download" value="1">{t("Download PDF")}</Button><Button type="submit" variant="secondary">{t("Openen om te printen")}</Button></form>
        <p className="text-xs text-muted">{t("Dit is een prijsvoorstel. Bevestig transport, afname en assortiment voordat je definitieve afspraken maakt.")}</p>
        <div className="border-t pt-4"><p className="text-sm font-medium">{t("Samples en presentatie apart vastleggen")}</p><p className="mt-2 text-sm text-muted">{t("Registreer bij het verkooppunt een presentatieafspraak met kosten en klantbijdrage. Gebruik dit ook voor een architectenkoffer wanneer het contact een verkooppuntpartner is. Architecten zonder verkooppuntafspraak krijgen de gewone zakelijke productprijzen.")}</p><LinkButton href="/wederverkopers" variant="secondary" className="mt-3">{t("Naar verkooppunten")}</LinkButton></div>
        <a className="text-xs text-accent hover:underline" href={`${pdf}&taal=nl`}>{t("Voorstel in het Nederlands bekijken")}</a>
      </CardContent></Card>{mailForm}</TabPanel>
    </TabsRoot>
  </div>;
}
