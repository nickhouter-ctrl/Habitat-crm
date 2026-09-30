# Beursopvolging en verkooppunten

De ingang is **Beursopvolging** in het menu, of `/beurs/opvolging`. Het oorspronkelijke beroep en beursformulier worden niet veranderd wanneer verkooppuntinteresse verandert.

## Werkwijze

1. Open een contact; leg interesse, verantwoordelijke, taal, notities en volgende actie vast. Een gedateerde volgende actie verschijnt als taak in de agenda. Wis actie/datum wanneer deze klaar is, of leg de volgende stap vast.
2. Bekijk ontvangen en verzonden mails voordat je benadert. De knop **Verzonden mails ophalen** importeert het eigen toegestane postvak; de beveiligde cron synchroniseert elke tien minuten. De eerste import kijkt 45 dagen terug. Exacte, unieke contactadressen bepalen de koppeling. Dubbele adressen of mails aan meerdere bekende contacten worden niet gegokt.
3. Laat de AI een concept voorbereiden of schrijf zelf. Bewaar, controleer en verstuur expliciet. De vaste Engelse en Spaanse technische data sheets gaan mee. Nieuwe mails geven geen contract of exclusiviteit af.
4. Open een binnengekomen mail via de dossierlink om in dezelfde mailwisseling te antwoorden. AI-context bevat het relatiedoel, bronnen en eerdere verzonden mails. Een voorstel om onze producten te verkopen is iets anders dan een leverancier die ons zijn producten aanbiedt.
5. Zet een afspraak pas in de agenda nadat datum en tijd met de klant bevestigd zijn. Het formulier verstuurt geen uitnodiging.
6. Open **Contract, exclusiviteit & afname** voor contractversies. Vul het concept aan en laat het juridisch controleren. Iedere opslag maakt een nieuwe versie. Download tekst voor verdere opmaak, laat beide partijen ondertekenen en upload de definitieve PDF met alle bijlagen (maximaal 4 MB). De medewerker controleert beide handtekeningen en bevoegdheden; dit is geen gekwalificeerde elektronische ondertekendienst.
7. Activeer een officieel verkooppunt met een geldig, gecontroleerd, ondertekend contract. Vul goedgekeurde openbare showroomgegevens en exacte coördinaten in. Overlappende exclusieve gebieden worden geblokkeerd; afwijkingen vergen eerst aangepaste afspraken. Alleen actieve, gepubliceerde partners met een lopend contract verschijnen op `/verkooppunten` en de openbare API. Stopzetten trekt activering en publicatie in; verlopen contracten worden automatisch uit de openbare selectie gehouden.

## Presentatieafspraken

Vier regelingen: volledig verrekenen bij de eerste order, gespreid via een orderpercentage, gratis, of een gedeeltelijke bijdrage. Gratis/bijdrage creëren geen extra tegoed. De pakketbetaling moet compleet geregistreerd zijn voordat tegoed gebruikt kan worden. Een eerste order moet het volledige tegoed dragen, tenzij expliciet is afgesproken het restant mee te nemen.

Een verrekening is een administratie van een korting die al op de order/factuur is verwerkt. Deze module past geen facturen aan. Boek met een unieke order-/factuurreferentie, bedrag en bevestiging. Terugdraaien behoudt de oorspronkelijke boeking en vereist een reden. Controleer de factuur apart. Afname toont gekoppelde facturen en creditnota’s; concepten en vervallen facturen tellen niet mee. Het betreft alle gefactureerde producten, niet veronderstelde verkopen aan eindklanten.

## Bewaring en toegang

- Concepten worden vooraf opgeslagen. Alleen een atomair geclaimd, ongewijzigd concept kan worden verstuurd; dubbele klikken sturen niet opnieuw. Bij een onzekere providerrespons blijft de status `unknown` of `sending` staan. Controleer eerst het postvak; geen automatische herverzending.
- Verzonden inhoud, datum, ontvangers, RFC-message-id en bijlagenamen worden bewaard. Geïmporteerde bijlagebestanden blijven in het oorspronkelijke postvak; de historie toont hun namen. Ondertekende contract-PDF’s staan in private opslag met SHA-256 en een kort geldige downloadlink.
- De niet-mailenlijst en gestopte dossiers blokkeren nieuwe persoonlijke benaderingen vanuit deze module.
- Het marketingpostvak blijft afgeschermd volgens de bestaande postvakregels. Commerciële afspraken vereisen productmoduletoegang, verzenden inboxrechten en afspraken agenda-rechten. Viewer kan niets wijzigen.
- De openbare selectie bevat uitsluitend goedgekeurde bedrijfsgegevens, geen contactnotities, contracten, afname of privé-mailhistorie.
- Migraties 0074 en 0075 voegen uitsluitend nieuwe tabellen toe en schakelen RLS in. Gebruik altijd `npm run db:migrate`.

## Validatie

Gerichte tests dekken tegoed, verval, eerste-orderrestant, gratis regelingen, persoonlijke versus automatische mail, autorisatie, niet-mailenlijst, gewijzigde concepten en concurrerende verzendpogingen. Browsercontrole omvat lijst, dossier, presentatiekeuze, contractscherm, mobiel, afgeschermde contractdownload en openbare kaartpagina. Er worden geen testmails naar klanten verstuurd.
