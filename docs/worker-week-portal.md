# Weekstaten en leveranciersfacturen via het urenportaal

Medewerkers openen hun bestaande projectspecifieke link. `?lang=nl`, `?lang=es` en `?lang=en` kiezen de taal zonder de arbeiderinstelling te veranderen.

## Gebruik

1. Op het project staan aparte kopieerknoppen voor NL en Spaans. De medewerker kiest het ISO-weeknummer met jaartal en datumbereik.
2. Per dag: gewerkt/niet gewerkt, aantal mensen, namen, uren per persoon exclusief pauzes, één verplichte beschrijving van de werkzaamheden en het resultaat (de plek kan daarin). Verschillende uren: meerdere regels. Het systeem berekent persoonsuren, maximaal 16 uur per genoemde persoon per dag.
3. Tussentijds een concept opslaan. Pas de complete week indienen; toekomstige dagen kunnen alleen expliciet als niet gewerkt worden aangemerkt. Een ingediende weekstaat staat vast.
4. Onder Uren op het project controleert kantoor de weekstaat. Terugsturen vereist een reden. Alleen goedkeuring maakt de urenregels en projectkosten aan. Bestaande losse uren van dezelfde arbeider/project/week blokkeren goedkeuring totdat kantoor die heeft vergeleken.
5. Op de medewerkerkaart: **Eigen facturen via het urenportaal toestaan**. Standaard uit. Alleen voor zelfstandigen/onderaannemers die zelf factureren. Aan zetten gebruikt het factuurtarief voor nieuwe ingediende weekstaten.
6. Na goedkeuring vult de leverancier eigen wettelijke naam, fiscale identificatie, adres, e-mail, eventueel IBAN, eigen nummer/serie, datum, IVA, IRPF en eventuele fiscale vermelding in. Tarief en uren komen uit de goedgekeurde weekstaat. Habitat One is uitsluitend de klant op de neutrale PDF.
7. De factuur verschijnt bij **Inkoop** en **Te verwerken** ter controle. Pas na goedkeuring ontstaat een inkoopfactuur; bestaande uren worden daaraan gekoppeld en nooit opnieuw aangemaakt. Btw en IRPF worden expliciet gekozen, niet fiscaal afgeleid door het systeem.

## Controle en beveiliging

- Project en arbeider volgen uitsluitend uit de persoonlijke link. Inactieve arbeider, gearchiveerd project of ingetrokken link weigert toegang.
- Concepten en ingediende weekstaten staan buiten de kosten; facturen in beoordeling staan buiten `purchase_orders`.
- Versienummers, transacties en unieke sleutels voorkomen dubbele weekstaten, herhaalde goedkeuring en hetzelfde fiscale nummer/factuurnummer.
- Goedkeuring houdt naam en tijd bij. Ingediende versies en terugstuurredenen blijven in de historie.
- Goedgekeurde weekregels en de gekoppelde factuur zijn beschermd tegen generiek wijzigen, opnieuw koppelen of verwijderen. Financiële correcties moeten als afzonderlijk document worden verwerkt.
- Lange werkdagen en late invoer zijn zichtbaar bij controle. Inzendingen verschijnen in de navigatietellers.
- De PDF-route controleert eigendom of CRM-moduletoegang en geeft private/no-store/noindex mee. Geen Habitat-logo of rekening als afzender.

## Validatie

- `npm test -- lib/__tests__/worker-week.test.ts lib/__tests__/project-cost-streams.test.ts`
- Opt-in echte SQL-test: `WORKER_WEEK_DB_TEST=1` met lokaal geladen databaseconfiguratie, `lib/__tests__/worker-week-rollback.test.ts`. Alle fixtures gaan via een verplichte rollback; geen mails.
- Browsercontrole: Spaanse mobiele invoer, foutvalidatie met behoud van invoer, concept, indienen, kantoorcontrole, leveranciersfactuur, PDF-download, inkoopgoedkeuring en weigeren van ongeauthenticeerde exports.

Mogelijke vervolgstappen: dagfoto's per werkplek, vergelijking met begrote uren en steekproefsgewijze bevestiging door de uitvoerder. Een ingevoerde beschrijving alleen bewijst de aanwezigheid niet.

## Meldingen bij indienen

- Een apart werkplekveld is niet nodig; de medewerker neemt de plek op in de beschrijving. Dagelijks **Concept opslaan** bewaart de weekstaat; alleen expliciet indienen geeft een melding.
- Een melding bovenin het CRM opent `/projects/weekstaten`, met alle ingediende weekstaten ter controle. De teller blijft tot goedkeuren of terugsturen en vernieuwt bij focus of na maximaal één minuut.
- Nick ontvangt via zijn bestaande CRM-account een persoonlijke e-mail met weeknummer, medewerker, project, persoonsuren en een link naar de controle. Geen openbare medewerkerslink of gedeelde BCC.
- De melding wordt in dezelfde database-transactie klaargezet. Dubbel klikken geeft geen dubbele mail; opnieuw indienen na een correctie geeft een nieuwe melding. Achterhaalde meldingen worden overgeslagen.
- Verwerking probeert direct na de inzending te bezorgen; de bestaande notificatiecron verwerkt veilig achtergebleven jobs. Een onzekere SMTP-uitkomst wordt niet blind opnieuw verzonden.

## Persoonlijk dashboard per klus

- Een geldige persoonlijke link opent Overzicht, Weekstaten en Facturen voor uitsluitend die medewerker op dat project. De lijsten zijn gepagineerd; oude facturen verdwijnen niet na acht weken.
- Facturen hebben een leesbare detailpagina, PDF bekijken en opnieuw downloaden. Het archief blijft beschikbaar als kantoor nieuwe facturen voor de medewerker uitschakelt.
- Bij afgeronde projecten is alleen terugkijken/downloaden mogelijk. Inactieve medewerkers, gearchiveerde projecten en ingetrokken links blijven afgesloten.
- Naam/bedrijfsnaam, NIF/CIF/NIE, adres, e-mail en IBAN worden uit de laatste ingediende factuur van dezelfde medewerker overgenomen. Alleen deze eigen identificatiegegevens worden hergebruikt; weekstaten en facturen van andere projecten blijven verborgen. Een nieuwe factuur vraagt altijd om een eigen nieuw nummer en bewuste btw/IRPF-keuze.
- Niet ingediende factuurformulieren slaan de bedrijfsgegevens nog niet op; ingediende facturen bewaren een eigen snapshot zodat latere wijzigingen eerdere documenten niet veranderen.

## Vereenvoudigde daginvoer en automatische Holded-verwerking

- De persoonlijke link opent direct de werkweek. Namen worden eenmaal toegevoegd en als team bewaard; de volgende week neemt alleen de namen over, nooit uren.
- Een dag openklappen toont uren achter elke naam. Leeg/0 betekent afwezig binnen een ingevulde werkdag. Een volledig vrije dag wordt expliciet als niet gewerkt gemarkeerd. Verschillende uren per persoon blijven behouden.
- Eén werkbeschrijving per gewerkte dag is verplicht bij doorsturen. **Opslaan en later verder** bewaart ook een onvolledig concept. De knop blijft onderin bereikbaar. Een waarschuwing beschermt niet opgeslagen wijzigingen bij verlaten van de pagina.
- **Week doorsturen** opent eerst een controle en bevestiging. De factuursectie verschijnt pas na goedkeuring van de uren. Inkoop blijft een afzonderlijke goedkeuring.
- Factuurgoedkeuring zet in dezelfde transactie een Holded-taak klaar. De bestaande notificatiecron probeert achtergebleven taken opnieuw; een eerste poging volgt meteen na goedkeuring. Afzender/NIF, eigen nummer, uren/tarief, IVA en IRPF komen uit de goedgekeurde snapshot. De oorspronkelijke PDF blijft via de inkoopfactuur beschikbaar.
- `purchase_orders.holded_id` koppelt de inkoopfactuur. Leveranciers worden op fiscale identiteit gevonden, niet alleen op naam. Een eigen CRM-tag herkent een eerder aangemaakt document.
- De status is zichtbaar bij de weekstaat en de inkoopfactuur. Bij een onzekere POST-uitkomst wordt uitsluitend gezocht naar het aangemaakte document; er volgt geen blinde tweede boeking. Handmatige controle is nodig als de uitkomst onzeker blijft.
- Tests gebruiken mocks voor Holded, een verplichte SQL-rollback voor de workflow, en lokale bestanden voor mobiele UI-tests. Gebruik nooit de echte factuurnummering voor browserfixtures.
