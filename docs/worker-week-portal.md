# Weekstaten en leveranciersfacturen via het urenportaal

Medewerkers openen hun bestaande projectspecifieke link. `?lang=nl`, `?lang=es` en `?lang=en` kiezen de taal zonder de arbeiderinstelling te veranderen.

## Gebruik

1. Op het project staan aparte kopieerknoppen voor NL en Spaans. De medewerker kiest het ISO-weeknummer met jaartal en datumbereik.
2. Per dag: gewerkt/niet gewerkt, aantal mensen, namen, uren per persoon exclusief pauzes, werkplek en concrete werkzaamheden/resultaat. Verschillende uren: meerdere regels. Het systeem berekent persoonsuren, maximaal 16 uur per genoemde persoon per dag.
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

- Dagelijks **Concept opslaan** bewaart de weekstaat; alleen expliciet indienen geeft een melding.
- Een melding bovenin het CRM opent `/projects/weekstaten`, met alle ingediende weekstaten ter controle. De teller blijft tot goedkeuren of terugsturen en vernieuwt bij focus of na maximaal één minuut.
- Nick ontvangt via zijn bestaande CRM-account een persoonlijke e-mail met weeknummer, medewerker, project, persoonsuren en een link naar de controle. Geen openbare medewerkerslink of gedeelde BCC.
- De melding wordt in dezelfde database-transactie klaargezet. Dubbel klikken geeft geen dubbele mail; opnieuw indienen na een correctie geeft een nieuwe melding. Achterhaalde meldingen worden overgeslagen.
- Verwerking probeert direct na de inzending te bezorgen; de bestaande notificatiecron verwerkt veilig achtergebleven jobs. Een onzekere SMTP-uitkomst wordt niet blind opnieuw verzonden.
