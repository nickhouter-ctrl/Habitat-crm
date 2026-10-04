import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Calculator, FileText, Layers3, Table2 } from "lucide-react";
import { TabPanel, TabsBar, TabsRoot } from "@/components/tabs";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, LinkButton, Select, Table, THead, TBody, Th, Td, Tr } from "@/components/ui";
import type { DistributeurItem } from "@/lib/distributeur-catalogus";
import { DEALER_STAFFELS, KORTING_SHOWROOM, MIN_MARGE_SHOWROOM, MIN_MARGE_VERKOOPPUNT, brutomarge, distributeurPrijzen, staffelMetId, type VeiligePrijs } from "@/lib/distributeur-prijzen";
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
function Prijs({ ex, incl, t }: { ex: number | null; incl: number | null; t: T }) {
  if (ex == null) return <p className="text-right text-sm font-medium text-muted">{t("Op aanvraag")}</p>;
  return <div className="ml-auto max-w-[200px] space-y-1 whitespace-nowrap text-xs tabular-nums">
    <div className="flex items-baseline justify-between gap-3"><span className="text-muted">{t("ex. btw")}</span><span className="text-base font-semibold text-foreground">{formatEUR(ex)}</span></div>
    <div className="flex items-baseline justify-between gap-3"><span className="text-muted">{t("incl. btw")}</span><span className="text-sm text-foreground/80">{formatEUR(incl)}</span></div>
  </div>;
}

function InternBedrag({ bedrag, label, accent = false }: { bedrag: number; label: string; accent?: boolean }) {
  return <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums">
    <span className="text-muted">{label}</span><span className={`whitespace-nowrap text-base font-semibold ${accent ? "text-accent" : "text-foreground"}`}>{formatEUR(bedrag)}</span>
  </div>;
}

function MargePrijs({ prijs, divisor, t, toonKorting = false }: { prijs: VeiligePrijs; divisor: number; t: T; toonKorting?: boolean }) {
  if (prijs.ex == null || prijs.bijdrage == null) return <div className="space-y-1 text-right"><p className="text-sm font-medium text-muted">{t("Op aanvraag")}</p><p className="text-xs text-muted">{t("Marge nog niet berekend")}</p></div>;
  return <div className="ml-auto max-w-[200px] space-y-2">
    <InternBedrag bedrag={prijs.ex/divisor} label={t("Onze verkoopprijs")}/>
    <InternBedrag bedrag={prijs.bijdrage/divisor} label={t("Wij houden over")} accent/>
    <p className="flex items-baseline justify-between gap-3 text-xs"><span className="text-muted">{t("Onze brutomarge")}</span><span className="font-semibold tabular-nums text-foreground">{pct(prijs.margePct)}</span></p>
    {toonKorting && prijs.begrensd && <p className="text-right text-xs text-warning">{t("Werkelijke korting")} · {pct(prijs.kortingPct)}</p>}
  </div>;
}

export function DealerPricing({ items, series, invoer, t, mailForm }: {
  items: DistributeurItem[]; series: string[]; invoer: z.infer<typeof prijsVoorstelInvoer>; t: T; mailForm?: ReactNode;
}) {
  const staffel = staffelMetId(invoer.staffel);
  const zichtbaar = invoer.serie ? items.filter(i => i.groep === invoer.serie) : items;
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
          <div><p className="font-display text-3xl font-semibold text-accent">{DEALER_STAFFELS[0].kortingPct}–{DEALER_STAFFELS.at(-1)!.kortingPct}%</p><p className="mt-1 text-xs text-muted">{t("Korting bij doorverkoop")}</p></div>
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
          <Table className="min-w-[1000px] table-fixed" wrapperClassName="max-h-[70vh] overflow-y-auto"><THead className="sticky top-0 z-10 bg-surface"><tr><Th className="w-[28%]">{t("Paneel / maat")}</Th><Th className="w-[12%]">{t("Eenheid")}</Th><Th className="w-[20%] text-right">{t("Adviesverkoopprijs")}</Th><Th className="w-[20%] text-right">{t("Inkoopprijs verkooppunt")}<span className="mt-1 block normal-case font-normal tracking-normal text-accent">{t("Doelkorting {n}%",{n:pct(staffel.kortingPct).replace("%","")})}</span></Th><Th className="w-[20%] text-right">{t("Showroom")}<span className="mt-1 block normal-case font-normal tracking-normal text-muted">{t("Maximaal {n}% korting",{n:KORTING_SHOWROOM})}</span></Th></tr></THead>
            <TBody>{zichtbaar.map(item => <Fragment key={item.id}><Tr className="bg-accent/5"><Td colSpan={5}><div className="flex flex-wrap items-baseline justify-between gap-2"><Link href={`/products/${item.id}/edit`} className="font-semibold text-foreground hover:underline">{item.naam}</Link><span className="text-xs text-muted">{item.sku}</span></div></Td></Tr>
              {item.maten.map((m,i) => <Fragment key={`${item.id}-${i}`}><Tr><Td rowSpan={m.areaM2 ? 2 : 1} className="border-r border-border/50 align-top"><p className="whitespace-nowrap font-semibold text-foreground">{m.dim}</p><p className="mt-1 text-xs text-muted">{m.areaM2 != null && `${m.areaM2.toLocaleString("nl-NL")} m² · `}{m.sku}</p>{m.inStock && <Badge className="mt-2" tone="success">{t("Voorraad")}</Badge>}{(m.verkooppunt == null || m.showroom == null) && <p className="mt-3 max-w-[230px] text-xs leading-relaxed text-warning">{m.kostEx == null ? t("Kostprijs voor deze maat controleren") : t("Prijs past niet binnen de margegrens")}</p>}</Td>
                <Td className="text-xs font-medium text-foreground/80">{t("Per paneel")}</Td>
                <Td><Prijs ex={m.adviesEx} incl={m.adviesIncl} t={t}/></Td>
                <Td rowSpan={m.verkooppunt == null && m.areaM2 ? 2 : 1}><Prijs ex={m.verkooppunt} incl={m.verkooppuntIncl} t={t}/>{m.dealer.begrensd && <p className="mt-2 text-right text-xs text-warning">{t("Werkelijke korting")} · {pct(m.dealer.kortingPct)}</p>}</Td>
                <Td rowSpan={m.showroom == null && m.areaM2 ? 2 : 1}><Prijs ex={m.showroom} incl={m.showroomIncl} t={t}/>{m.display.begrensd && <p className="mt-2 text-right text-xs text-warning">{t("Werkelijke korting")} · {pct(m.display.kortingPct)}</p>}</Td></Tr>
                {m.areaM2 && <Tr><Td className="text-xs font-medium text-muted">{t("Per m²")}</Td><Td><Prijs ex={m.adviesEx/m.areaM2} incl={m.adviesIncl/m.areaM2} t={t}/></Td>{m.verkooppunt != null && <Td><Prijs ex={m.verkooppunt/m.areaM2} incl={m.verkooppuntIncl != null ? m.verkooppuntIncl/m.areaM2 : null} t={t}/></Td>}{m.showroom != null && <Td><Prijs ex={m.showroom/m.areaM2} incl={m.showroomIncl != null ? m.showroomIncl/m.areaM2 : null} t={t}/></Td>}</Tr>}
              </Fragment>)}
            </Fragment>)}</TBody>
          </Table>
          <CardContent><p className="text-xs leading-relaxed text-muted">{t("De jaarstaffel geldt voor de inkoopprijs van het verkooppunt. Showroompanelen hebben een afzonderlijke korting. Bij een begrensde prijs staat de werkelijke korting vermeld.")}</p></CardContent>
        </Card>
      </TabPanel>

      <TabPanel id="marge">
        <Card><CardHeader><div><CardTitle>{invoer.serie || t("Alle series")}</CardTitle><p className="mt-1 text-xs text-muted">{t("Per paneel én per m². Kosten, verkoopprijs en onze bijdrage exclusief btw.")}</p></div><Badge tone="accent">{volumeLabel(staffel)} · {pct(staffel.kortingPct)}</Badge></CardHeader>
          <Table className="min-w-[1000px] table-fixed" wrapperClassName="max-h-[70vh] overflow-y-auto"><THead className="sticky top-0 z-10 bg-surface"><tr><Th className="w-[28%]">{t("Paneel / maat")}</Th><Th className="w-[12%]">{t("Eenheid")}</Th><Th className="w-[20%] text-right">{t("Onze kosten")}<span className="mt-1 block normal-case font-normal tracking-normal text-muted">{t("Inclusief ingevulde extra kosten")}</span></Th><Th className="w-[20%] text-right">{t("Verkooppunt")}<span className="mt-1 block normal-case font-normal tracking-normal text-accent">{t("Doelkorting {n}%",{n:pct(staffel.kortingPct).replace("%","")})}</span></Th><Th className="w-[20%] text-right">{t("Showroom")}<span className="mt-1 block normal-case font-normal tracking-normal text-muted">{t("Maximaal {n}% korting",{n:KORTING_SHOWROOM})}</span></Th></tr></THead>
            <TBody>{zichtbaar.map(item => <Fragment key={item.id}><Tr className="bg-accent/5"><Td colSpan={5}><div className="flex flex-wrap items-baseline justify-between gap-2"><Link className="font-semibold text-foreground hover:underline" href={`/products/${item.id}/edit`}>{item.naam}</Link><span className="text-xs text-muted">{item.sku}</span></div></Td></Tr>{item.maten.map((m,i) => {
              const budget = m.verkooppunt != null && m.kostEx != null && m.areaM2 ? Math.max(0,(m.verkooppunt * (1-MIN_MARGE_VERKOOPPUNT/100) - m.kostEx)/m.areaM2) : null;
              const oud = m.kostEx != null ? brutomarge(m.adviesEx*.3,m.kostEx) : null;
              const raming = m.kostenbron === "raming" && m.geraamdeKost != null ? distributeurPrijzen(m.adviesEx,m.geraamdeKost+m.extraKost,{staffelId:staffel.id},m.vatRate) : null;
              const kosten = m.kostEx ?? (m.geraamdeKost != null ? m.geraamdeKost+m.extraKost : null);
              return <Fragment key={`${item.id}-${i}`}><Tr><Td rowSpan={m.areaM2 ? 2 : 1} className="border-r border-border/50 align-top"><p className="whitespace-nowrap font-semibold text-foreground">{m.dim}</p><p className="mt-1 text-xs text-muted">{m.areaM2 != null && `${m.areaM2.toLocaleString("nl-NL")} m² · `}{m.sku}</p>{m.inStock && <Badge className="mt-2" tone="success">{t("Voorraad")}</Badge>}{m.kostEx == null && <p className="mt-3 max-w-[230px] text-xs leading-relaxed text-warning">{t("Voor deze maat eerst de eigen kostprijs vastleggen.")}</p>}
                  <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer hover:text-foreground">{t("Kosten & toelichting")}</summary><div className="mt-2 space-y-2 leading-relaxed"><p className={["raming","ontbreekt","conservatief"].includes(m.kostenbron)?"text-warning":""}>{bron[m.kostenbron]}</p><Link className="block text-accent hover:underline" href={`/products/${item.id}/edit`}>{t("Kosten controleren")}</Link>
                    {m.kostEx != null && <><p>{t("Geregistreerde kostprijs")}: {formatEUR(m.geregistreerdeKost)}</p><p>{t("Ingevulde extra kosten")}: {formatEUR(m.extraKost)}</p></>}
                    {budget != null && <p>{t("Extra kostenruimte")}: {formatEUR(budget)} / m². {t("Bij dezelfde dealerprijs blijft minimaal {n}% brutomarge over.",{n:MIN_MARGE_VERKOOPPUNT})}</p>}
                    {m.verkooppunt != null && <p>{t("Marge van het verkooppunt")}. {t("Bij doorverkoop tegen adviesprijs: {bedrag} per paneel ({marge}% brutomarge).",{bedrag:formatEUR(m.adviesEx-m.verkooppunt),marge:pct((m.adviesEx-m.verkooppunt)/m.adviesEx*100).replace("%","")})}</p>}
                    {oud && <p className={oud.eur<0?"text-danger":""}>{t("Bij 70% korting houden wij {bedrag} per paneel over, vóór vaste bedrijfskosten.",{bedrag:formatEUR(oud.eur)})}</p>}
                    {raming && <p className="text-warning">{t("Geen offerteprijs. Bij de geraamde kosten zouden wij {bedrag} per paneel overhouden bij doorverkoop.",{bedrag:formatEUR(raming.dealer.bijdrage)})}</p>}
                  </div></details>
                </Td><Td className="text-xs font-medium text-foreground/80">{t("Per paneel")}</Td>
                <Td rowSpan={kosten == null && m.areaM2 ? 2 : 1}>{kosten != null ? <div className="ml-auto max-w-[200px] space-y-1">{m.kostEx == null && <p className="text-right text-xs text-warning">{t("Onbevestigde raming")}</p>}<InternBedrag bedrag={kosten} label={t("ex. btw")}/></div> : <p className="text-right text-xs text-warning">{t("Kostprijs ontbreekt")}</p>}</Td>
                <Td rowSpan={m.verkooppunt == null && m.areaM2 ? 2 : 1}><MargePrijs prijs={m.dealer} divisor={1} t={t} toonKorting/></Td>
                <Td rowSpan={m.showroom == null && m.areaM2 ? 2 : 1}><MargePrijs prijs={m.display} divisor={1} t={t} toonKorting/></Td></Tr>
                {m.areaM2 && <Tr><Td className="text-xs font-medium text-muted">{t("Per m²")}</Td>{kosten != null && <Td><div className="ml-auto max-w-[200px] space-y-1">{m.kostEx == null && <p className="text-right text-xs text-warning">{t("Onbevestigde raming")}</p>}<InternBedrag bedrag={kosten/m.areaM2} label={t("ex. btw")}/></div></Td>}{m.verkooppunt != null && <Td><MargePrijs prijs={m.dealer} divisor={m.areaM2} t={t}/></Td>}{m.showroom != null && <Td><MargePrijs prijs={m.display} divisor={m.areaM2} t={t}/></Td>}</Tr>}
              </Fragment>;
            })}</Fragment>)}</TBody>
          </Table>
          <CardContent><p className="text-xs leading-relaxed text-muted">{t("Intern overzicht. Kostprijzen en onze bijdrage komen niet in het verkooppuntdocument.")} {t("Wij houden over = onze verkoopprijs min de meegenomen kosten. Dit bedrag betaalt nog onze vaste bedrijfskosten; het is geen nettowinst.")}</p><p className="mt-2 text-xs leading-relaxed text-muted">{t("Extra kostenruimte is de aanvulling per m² die nog mogelijk is bij dezelfde dealerprijs, tot onze margegrens van {n}%. Vul de werkelijke kosten bovenaan in om de prijzen opnieuw te berekenen.",{n:MIN_MARGE_VERKOOPPUNT})}</p></CardContent>
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
