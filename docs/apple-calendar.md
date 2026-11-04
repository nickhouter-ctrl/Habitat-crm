# Gedeelde Apple Agenda

Het CRM synchroniseert losse afspraken in twee richtingen met één aparte iCloud-agenda, **Habitat One CRM**. De eigenaar nodigt collega's via Apple Agenda uit en geeft desgewenst bewerkingsrechten. iCloud-deling en CRM-rollen zijn afzonderlijke toegangsgrenzen: een uitgenodigde Apple-bewerker ziet de gehele werkagenda.

## Activeren

1. Pas migratie `0089_apple_calendar_sync` toe met `npm run db:migrate`, na de reeds bestaande migraties. Migreer nooit met `db:push`.
2. Deploy de code inclusief de vijfminuten-cron in `vercel.json`. `AUTH_SECRET` moet minstens 32 tekens lang zijn; `CRON_SECRET` moet zijn ingesteld. De cronroute weigert zonder correcte bearer-token, ook buiten productie.
3. Open als CRM-beheerder **Agenda → Apple Agenda koppelen**. Gebruik het Apple Account dat eigenaar van de werkagenda wordt. Maak via https://account.apple.com een app-specifiek wachtwoord (Apple vereist tweefactorauthenticatie). Voer dit alleen in het beveiligde CRM-formulier in.
4. Bevestig dat CRM-teamafspraken, locaties en notities worden gedeeld. De koppeling maakt een aparte agenda aan. Agenda's worden voor discovery opgesomd; alleen de inhoud van de eigen werkagenda wordt opgehaald.
5. Start eventueel **Nu synchroniseren**. Anders begint de vijfminuten-cron. De iPhone bepaalt daarnaast zijn eigen verversing.
6. De eigenaar opent Apple Agenda → Agenda's → informatieknop naast Habitat One CRM → Voeg persoon toe. Nodig collega's uit op hun Apple Account en activeer **Sta bewerking toe**. De collega accepteert de uitnodiging en kiest deze agenda bij werkafspraken.

Bronnen: [Apple app-specifieke wachtwoorden](https://support.apple.com/nl-nl/102654), [Apple iCloud-agenda delen](https://support.apple.com/nl-nl/guide/iphone/iph7613c4fb/ios).

## Gedrag

- Export: CRM-afspraken vanaf 90 dagen terug en alle toekomstige afspraken. Bestaande gekoppelde afspraken blijven gevolgd, ook buiten dat venster. Geen taken, dagelijkse controles of andere iCloud-agenda's.
- Titel, begin/einde, hele dag, locatie, notities en annulering worden uitgewisseld. Klantkoppelingen, verantwoordelijke en CRM-afronding worden bij Apple-wijzigingen behouden. Nieuwe Apple-afspraken worden toegewezen aan de beheerder die de koppeling heeft ingesteld; Apple biedt hier geen betrouwbare CRM-gebruikersidentiteit per bewerker.
- CRM-verwijdering verwijdert het gekoppelde Apple-item. Apple-verwijdering annuleert de CRM-afspraak, zodat het dossier bewaard blijft. Bij een wijziging tegenover een verwijdering wordt eerst een conflict gemeld.
- Bij gelijktijdige inhoudelijke wijzigingen kiest een beheerder op de koppelpagina welke versie geldt. Beide agenda's blijven tot die keuze ongewijzigd door de synchronisatie.
- Herhalingen, reeksexcepties, vergaderuitnodigingen, onbekende tijdzones en ongeldige/te grote items worden niet vervormd of overschreven. De pagina meldt aandachtspunten; gekoppelde items krijgen een individuele melding.
- Maximaal 2.000 items per volledige synchronisatie. Grotere collecties falen gesloten. Een run heeft een tijdslimiet; de volgende run begint met de minst recent gecontroleerde koppelingen.
- **Koppeling stoppen** verwijdert het opgeslagen wachtwoord. Het verwijdert geen agenda's of afspraken. Hervatten vereist hetzelfde Apple Account. Verander het account niet zonder expliciete migratie van de bestaande mappings.

## Beveiliging en retries

Alle configuratie- en conflictacties controleren de actuele adminrol; afspraakwijzigingen volgen de bestaande module- en eigendomscontroles. De cron controleert dat de eigenaar nog beheerder is. App-wachtwoorden staan uitsluitend AES-256-GCM-versleuteld in Postgres, met AAD gebonden aan het account en een aparte HKDF-sleutel afgeleid van `AUTH_SECRET`. Sleutelrotatie vereist opnieuw verbinden. RLS op beide nieuwe tabellen sluit de publieke PostgREST-laag af. De server gebruikt de bestaande DB-eigenaarsverbinding.

DAV-verkeer mag uitsluitend via HTTPS naar `caldav.icloud.com` en `pNN-caldav.icloud.com`, inclusief redirects en servergeretourneerde links. Event-URL's moeten binnen exact de opgeslagen werkagenda vallen. Verzoeken hebben deadlines en maximale responsgroottes. Credentials en Apple-responseinhoud worden niet gelogd of teruggestuurd in fouten.

Een databaselease voorkomt overlappende runs en wijzigen van credentials tijdens synchronisatie. PUT gebruikt `If-None-Match: *` bij aanmaken en `If-Match` bij aanpassen; DELETE vereist een ETag. Een stabiele UID/URL en DB-uniqueness voorkomen dubbele export. Import en mapping worden samen gecommit. Als een REPORT een item mist, controleert de client dat item met GET; een ontbrekende collectie of netwerkfout geldt nooit als massaverwijdering. CRM-updates controleren de gelezen `updatedAt` om tussentijdse edits niet te verliezen. Mappings blijven als tombstones bewaard wanneer een afspraak wordt verwijderd.

## Verificatie

Unit tests: `npx vitest run lib/__tests__/apple-calendar.test.ts`. Deze gebruiken geen Apple-account en doen geen externe writes. `CRM_EXTERNAL_EFFECTS=disabled` blokkeert ook de Apple-client en synchronisatie.

Aanvullend: `apple-calendar-access.test.ts` controleert adminrechten, expliciete toestemming en cron-authenticatie. `APPLE_CALENDAR_DB_TEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/__tests__/apple-calendar-rollback.test.ts` controleert het volledige proces met echte SQL in een verplicht teruggedraaide transactie en nagebootst Apple-verkeer. Dit werkt alleen zolang er geen echte Apple-koppeling is ingesteld; de test weigert anders. Er worden geen mails of Apple-verzoeken verstuurd.

Voor vrijgave: typecheck/build, migratiereview, UI-controle en een echte ronde met een door de eigenaar gekoppeld Apple-testaccount: CRM → Apple, Apple → CRM, tijdzone/hele dag, verwijderen in beide richtingen, een conflict en opnieuw proberen zonder duplicaten. Zonder Apple-autorisatie kan die laatste ronde niet als geslaagd worden aangemerkt.
