import { tekst as uiTranslation } from '@/lib/i18n/server';
import { loadCalculatorData } from "@/lib/calculator-data";
import { emptyConfig, OLD_BATHROOM_PRODUCTS, pricePost } from "@/lib/calculator";
import { PageHeader, LinkButton } from "@/components/ui";
import { formatEUR } from "@/lib/utils";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Prijscontrole calculator") };
}
export default async function CalculatorPricesPage() {
  const uiT = await uiTranslation();
  const data = await loadCalculatorData();
  const config = emptyConfig();
  return <>
    <PageHeader title={uiT("Prijscontrole calculator")} subtitle={uiT("Bedragen per eenheid, exclusief btw. Dit zijn de standaardprijzen die de nieuwe calculator nu gebruikt.")} actions={<LinkButton href="/calculator">{uiT("Naar calculator")}</LinkButton>} />
    <div className="mb-5 space-y-2 rounded-xl border bg-surface p-5 text-sm">
      <p>{uiT("Arbeid en bouwmaterialen: kostprijs plus 15% opslag. Materiaalverlies wordt alleen over materiaal berekend. Eigen assortiment en Brauer: de catalogusverkoopprijs, zonder extra opslag.")}</p>
      <p>{uiT("De bestaande kostprijzen zijn ramingen. Een nieuwe rekenregel bewijst niet dat een aannemer voor dit bedrag levert. Controleer posten met de aanduiding ‘Tarief bevestigen’ bij de uitvoerder. Afmetingen, ondergrond, bereikbaarheid en inbegrepen werk bepalen de werkelijke prijs.")}</p>
      <p>{uiT("Badkamers gebruiken gekozen productvarianten en complete Core-sets; de oude vaste sanitairbundels vervallen. Het oude prijzenboek blijft de bron voor bewerkbare kostprijzen.")}</p>
    </div>
    <div className="overflow-x-auto rounded-xl border bg-surface"><table className="w-full text-left text-sm">
      <thead><tr className="border-b"><th className="p-3">{uiT("Werkzaamheid")}</th><th className="p-3">{uiT("Eenheid")}</th><th className="p-3">{uiT("Oude verkoopprijs")}</th><th className="p-3">{uiT("Nieuwe calculator")}</th><th className="p-3">{uiT("Controle")}</th></tr></thead>
      <tbody>{data.posts.map(post => {
        const replaced = OLD_BATHROOM_PRODUCTS.includes(post.name);
        const line = replaced ? null : pricePost(post, 1, config, data.products);
        return <tr key={post.id} className="border-b last:border-0"><td className="p-3"><span className="block text-xs text-muted">{post.chapter}</span>{post.name}</td><td className="p-3">{post.unit}</td><td className="p-3 whitespace-nowrap">{post.price == null ? "—" : formatEUR(post.price)}</td><td className="p-3 whitespace-nowrap">{replaced ? uiT("Per gekozen product") : line ? formatEUR(line.price) : uiT("Keuze nodig")}</td><td className="p-3">{replaced ? uiT("Vervangen door productsamenstelling") : line?.allowance ? uiT("Stelpost op catalogusprijs") : post.review ? uiT("Tarief bevestigen") : uiT("Kostprijs + 15%")}</td></tr>;
      })}</tbody>
    </table></div>
  </>;
}
