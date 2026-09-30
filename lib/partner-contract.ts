import { z } from 'zod';

export const DEFAULT_PARTNER_ASSORTMENT = 'Flexible Stone panelen, lijm en bijbehorende toebehoren';
const term = (max: number) => z.string().trim().max(max).transform(v => v.replace(/[\r\n]+/g, ' '));
export const contractDetailsInput = z.object({
  brandName: term(120),
  assortment: term(2000).refine(v => !!v, 'Vul de producten in.'),
  area: term(500),
  minimumPurchases: term(500),
  service: term(2000),
  exceptions: term(6000),
});
export type ContractDetails = z.infer<typeof contractDetailsInput>;
const labels = {
  brandName: 'Merknaam', assortment: 'Producten', area: 'Gebied / locatie',
  minimumPurchases: 'Minimumafname', service: 'Showroom en service', exceptions: 'Uitzonderingen en aanvullende afspraken',
} as const;

/** A readable appendix, also used to reopen these fields without changing old contracts. */
export function contractTerms(details: ContractDetails): string {
  const d = contractDetailsInput.parse(details);
  return ['Afspraken voor het verkooppunt', ...Object.entries(labels).map(([key, label]) =>
    `${label}: ${d[key as keyof ContractDetails] || 'Nog overeen te komen'}`,
  )].join('\n');
}

export function readContractDetails(terms: string | null | undefined): ContractDetails | null {
  const lines = terms?.split('\n');
  if (lines?.[0] !== 'Afspraken voor het verkooppunt' || lines.length !== 7) return null;
  const values: Record<string, string> = {};
  for (const [i, [key, label]] of Object.entries(labels).entries()) {
    const prefix = `${label}: `;
    if (!lines[i + 1].startsWith(prefix)) return null;
    const value = lines[i + 1].slice(prefix.length);
    values[key] = value === 'Nog overeen te komen' ? '' : value;
  }
  const result = contractDetailsInput.safeParse(values);
  return result.success ? result.data : null;
}

export function contractBrand(body: string, brandName: string) {
  return body.split('[MERKNAAM]').join(brandName.trim() || '[MERKNAAM]');
}

export function partnerContractDocument(c: {
  body: string; territoryTerms: string; validFrom: string; validUntil: string; exclusive: boolean;
  latitude?: string | null; longitude?: string | null; radiusKm?: string | null; version?: number;
}) {
  const brandName = readContractDetails(c.territoryTerms)?.brandName ?? '';
  return `${contractBrand(c.body, brandName)}\n\nBijlage — producten en gebied${c.version ? ` · versie ${c.version}` : ''}\nGeldigheid: ${c.validFrom || 'Nog bepalen'} tot ${c.validUntil || 'Nog bepalen'}\nExclusiviteit: ${c.exclusive ? 'Ja, uitsluitend volgens deze bijlage en de overeenkomst' : 'Niet toegezegd'}${c.exclusive ? `\nMiddelpunt: ${c.latitude || 'Nog bepalen'}, ${c.longitude || 'Nog bepalen'}; straal ${c.radiusKm || 'Nog bepalen'} km` : ''}\n${c.territoryTerms}`;
}

export function partnerContractTemplate(name: string) {
  return `CONCEPT — door beide partijen en juridisch adviseur te controleren vóór ondertekening

Partijen
Habitat One & One S.L. (hierna Habitat One) en ${name} (hierna Verkooppunt).
Vul volledige juridische namen, btw-nummers, adressen en bevoegde vertegenwoordigers in. De definitieve eigen merknaam is [MERKNAAM] (hierna het Merk).

1. Samenwerking onder het eigen merk
Habitat One levert de in de assortimentsbijlage opgenomen producten onder het Merk. Het Verkooppunt presenteert en verkoopt deze als producten van het Merk, met de door Habitat One verstrekte merknaam, productnamen en merkuitingen. Het Verkooppunt koopt en verkoopt als zelfstandige onderneming voor eigen rekening; de identiteit van het Verkooppunt als verkoper aan de eindklant blijft duidelijk. Het mag zonder schriftelijke volmacht geen toezeggingen of contracten namens Habitat One aangaan.

2. Panelen, lijm, toebehoren en toekomstige producten
Het assortiment omvat de overeengekomen Flexible Stone panelen, lijm en bijbehorende toebehoren die Habitat One onder het Merk levert. Nieuwe producten onder het Merk kunnen schriftelijk aan de assortimentsbijlage worden toegevoegd. Leg per toevoeging vast of bestaande prijs-, garantie-, presentatie- en gebiedsafspraken ook daarvoor gelden. Er ontstaat geen automatische verplichting om onbekende toekomstige producten af te nemen.
Producten, verpakkingen en merkuitingen mogen niet zonder schriftelijke toestemming worden hernoemd, omgepakt of onder een eigen of ander merk aangeboden. Wettelijk verplichte veiligheidsinformatie, etiketten en traceerbaarheidsgegevens blijven intact. Leg verantwoordelijkheden voor productdocumentatie, veiligheid en claims per productgroep vast.

3. Bestelling, inkoop en betaling
Leg in een ondertekende bijlage inkoopprijzen, orderminimum, betaling, levering, retouren, garantie en klachtenprocedure vast. De reguliere zakelijke korting is niet automatisch de verkooppuntprijs.

4. Adviesprijzen, kortingen en acties
Habitat One kan een uniforme adviesprijslijst voor het Merk verstrekken. Deze adviesprijzen zijn niet bindend. Het Verkooppunt bepaalt zelfstandig zijn verkoopprijzen, kortingen en acties. Er geldt geen verplichte minimumprijs, minimum geadverteerde prijs of maximale korting. Afwijking van een adviesprijs leidt niet tot een boete, leveringsstop, verlies van exclusiviteit of verlies van presentatieverrekening.
Productinformatie, prijscommunicatie en acties moeten correct en niet misleidend zijn. Kwaliteits- en merkpresentatie-eisen mogen niet worden gebruikt om zelfstandig gekozen verkoopprijzen te beperken.

5. Merkgebruik en aangeleverde websitecontent
Habitat One levert goedgekeurde productfoto’s, video’s, beschrijvingen, technische data sheets en andere beschikbare merkcontent waarvoor zij de benodigde gebruiksrechten heeft. Het Verkooppunt krijgt gedurende de overeenkomst een niet-exclusief en niet-overdraagbaar gebruiksrecht om deze content op zijn eigen website, sociale media en in zijn eigen verkoop- en presentatiemateriaal te gebruiken voor de overeengekomen producten.
De rechten op merk en content blijven bij de rechthebbenden. Het Verkooppunt volgt de aangeleverde huisstijl en gebruikt actuele productinformatie. Normale aanpassing aan formaat en lay-out is toegestaan zolang productkenmerken en merkherkenning behouden blijven. Nieuwe technische claims, wijzigingen aan het logo en inhoudelijke wijzigingen vereisen voorafgaande schriftelijke toestemming; dit betreft geen goedkeuring van verkoopprijzen of kortingshoogtes.
Zonder schriftelijke toestemming mag het Verkooppunt geen merkrechten, domeinnamen of accounts met het Merk registreren, materiaal aan derden licentiëren of het gebruiken voor andere producten. Bij beëindiging vervalt het gebruiksrecht en verwijdert het Verkooppunt de aanduiding ‘officieel verkooppunt’. Leg een redelijke termijn en eventueel beperkt merkgebruik voor rechtmatige verkoop van resterende originele voorraad afzonderlijk vast.

6. Showroom, presentatie en service
Leg de overeengekomen showroompresentatie, samples, productadvies, training, opvolging van klantvragen en onderhoud van de presentatie vast in de bijlage. Deze objectieve afspraken dienen de kwaliteit van het Merk en staan los van de gekozen verkoopprijzen.
Neem pakketinhoud, installatie, vervoer, eigendom, betaling en eventuele volledige verrekening bij de eerste order of gespreide verrekening op in de presentatiebijlage. Bij gratis verstrekking ontstaat geen extra verrekenbaar tegoed. Vermeld ook de afspraken bij beëindiging.

7. Gebied en exclusiviteit
Exclusiviteit ontstaat uitsluitend door een uitdrukkelijke, door beide partijen ondertekende gebiedsbijlage. Deze vermeldt middelpunt, straal of gebiedsgrenzen, showroomlocatie, looptijd, betrokken producten, uitzonderingen en eventuele minimumafname en servicevoorwaarden.
Binnen die overeengekomen grenzen stelt Habitat One tijdens de afgesproken exclusiviteit geen ander fysiek officieel verkooppunt aan voor de betreffende producten, behoudens expliciete uitzonderingen in de bijlage. Leg bestaande verkooppunten, directe verkoop door Habitat One, online aanvragen en verdeling van leads uitdrukkelijk vast.
Het behoud en de beoordeling van exclusiviteit worden gekoppeld aan de overeengekomen showroom-, service- en afnameafspraken, niet aan het volgen van adviesprijzen of beperken van kortingen. Leg evaluatie, hersteltermijn en gevolgen van niet-nakoming vooraf vast.
Dit geeft geen absoluut verbod op verkoop buiten het eigen gebied. Beperkingen op actieve benadering van andere exclusieve gebieden moeten afzonderlijk juridisch worden beoordeeld; rechtmatig toegestane passieve verkopen en ongevraagde online bestellingen worden niet algemeen uitgesloten.

8. Vertrouwelijkheid en bescherming tegen omzeiling
Identificeer concreet welke niet-openbare leveranciersgegevens, inkoopprijzen, productinformatie en werkwijzen vertrouwelijk zijn. Leg toegestaan gebruik, beveiliging, uitzonderingen (zoals openbare of al bekende informatie), duur en teruggave vast.
Werk een proportionele afspraak uit over het niet omzeilen van Habitat One bij door Habitat One vertrouwelijk geïntroduceerde leveranciers voor de overeengekomen producten. Bescherm concrete merkrechten, ontwerpen, content en bedrijfsgeheimen; een algemeen idee of concept is niet automatisch exclusief eigendom. Wettelijk verplichte informatieverstrekking blijft toegestaan.

9. Officiële status en publicatie
Gebruik van de aanduiding ‘officieel verkooppunt’ vereist afzonderlijke activering door Habitat One na goedkeuring en ondertekening. Publicatie op de website vereist goedgekeurde bedrijfsgegevens en een afzonderlijke publicatieafspraak.

10. Duur, beëindiging en geschillen
Vul begin- en einddatum, evaluatiemomenten, hersteltermijnen, opzegging en afwikkeling van voorraad en presentatie in. Laat toepasselijk recht, bevoegde rechter, proportionele remedies en aansprakelijkheid beoordelen door een juridisch adviseur. Een korting of afwijking van de adviesprijs vormt op zichzelf geen grond voor beëindiging.

Bijlagen
De producten- en gebiedsbijlage, inkoop- en leveringsvoorwaarden, presentatieafspraak en merk-/contentrichtlijnen maken deel uit van de door beide partijen ondertekende versie. Alleen daadwerkelijk overeengekomen bijlagen en wijzigingen gelden; open punten in dit concept zijn geen toezeggingen.

Ondertekend voor Habitat One: naam, functie, datum, handtekening
Ondertekend voor het Verkooppunt: naam, functie, datum, handtekening`;
}
