# Gedeelde actielijst

Eén interne lijst voor alles wat binnen Habitat One moet worden opgevolgd:
showroom, magazijn, logistiek, social media. Gevraagd door het team
(18-11-2026), met het voorbeeld uit `Habitat-One-CRM-actielijst.pdf` als
uitgangspunt: groep, subgroep, actiepunt, wie, deadline, opmerking, klaar.

Twee ingangen, dezelfde lijst:

| | Waar | Voor wie |
|---|---|---|
| **`/lijst/<token>`** | persoonlijke link, zonder inloggen, gemaakt voor de telefoon | de vier leden, ook onderweg |
| **`/actielijst`** | in het CRM, met de persoonlijke links erbij | dezelfde vier, achter de login |

Het lezen en schrijven zit voor beide in `lib/actielijst-db.ts`; de twee
`actions.ts` doen alleen de authenticatie. Zo kan de ene ingang niet
vooruitlopen op de andere.

## Wie erbij mag

Module `actielijst` in `lib/auth/modules.ts`, met een **ledenlijst** op
e-mailadres: `nick@`, `frederique@`, `hans@` en `hi@habitat-one.com` (Elles).
Rollen alleen waren niet genoeg — Teresa, Daan en Mourad horen er niet bij,
en Teresa en Daan zijn beheerder, dus die mogen normaal overal bij.

`LEDENLIJSTEN` werkt daarom als extra zeef bovenop `ROLE_MODULES`:
`isLid()`, `magModuleAls()` en `magPadAls()`. De harde grenzen lopen via
`lib/auth/access.ts` (guards en pagina's), `app/(app)/layout.tsx` (ook voor
rollen die overal mogen komen) en het token zelf. Zijbalk, starttegels en
badges filteren mee, zodat er geen dode links in het menu staan. Iemand van de
lijst halen maakt zijn persoonlijke link direct ongeldig.

Alleen-lezen accounts kunnen niets wijzigen en worden ook niet als
verantwoordelijke geaccepteerd: een mail over een punt dat je niet kunt
afvinken heeft geen zin.

Toewijzen kan alleen aan die vier (keuze Nick 18-11-2026: Teresa, Mourad en
Daan horen er niet in). Naast de namen staat **Hele team** in de keuzelijst:
dan hangt het punt aan niemand in het bijzonder, krijgt iedereen die de lijst
bijhoudt de herinnering, en staat het bij iedereen onder "alleen van mij".
In de database is dat `action_items.teamwide`; `assignee_id` blijft dan leeg.

## De persoonlijke link

- Eén rij per medewerker in `action_list_links` met een token van 32
  willekeurige bytes. Een nieuwe link maken overschrijft het token, dus de oude
  link is op datzelfde moment dood.
- De pagina is `noindex` en stuurt geen referrer; `/lijst` staat als publiek pad
  in `auth.config.ts` en wordt altijd in de lichte modus getoond.
- Opzet voor de telefoon: één kolom, afvinken met een knop van 48 px, een punt
  openen is een `<details>`, en alles gaat via gewone formulieren met een
  redirect erna. Geen modals, geen client-side state — werkt dus ook op een
  slechte verbinding en zonder JavaScript.
- Nederlands, want de lijst is van vier Nederlandstalige collega's. Komt er
  iemand bij die Spaans leest, dan gaan die teksten naar `lib/i18n`.
- Beheer staat op `/actielijst`: link kopiëren, nieuwe link maken, en of de link
  al eens geopend is (`last_seen_at`).

## Kleuren

Rood = deadline verstreken en nog niet afgevinkt. Oranje = status *Bezig*.
Groen = klaar. Leeg = neutraal. De kleur staat **niet** in de database maar komt
uit `lib/actielijst.ts` (`actieKleur` / `isAchterstallig`), zodat de twee
pagina's, de badge in het menu en de herinneringsmail niet uit elkaar kunnen
lopen. De dag van de deadline zelf is nog op tijd.

## In de agenda

Een punt met een deadline krijgt een gewone taak in `activities`
(`type = "task"`, deadline om 17:00 Madrid, bij de verantwoordelijke — zonder
verantwoordelijke, en bij een punt van het hele team, bij degene die het punt
aanmaakte). Daardoor staat het punt
vanzelf in `/agenda`, in het ochtendoverzicht van 08:00 én in de Apple-agenda
van die medewerker, via de bestaande sync (`lib/apple-calendar/sync.ts` pakt elke
open taak met een deadline op). In de taak staat de groep en een link terug naar
het punt.

`stemTaakAf()` in `lib/actielijst-db.ts` houdt dat bij na elke wijziging:

- geen deadline (meer) → geen taak, en een bestaande taak verdwijnt;
- afgevinkt of uit de lijst gehaald → de taak is afgerond, niet verwijderd, dus
  de agenda toont hem niet meer en de historie blijft staan;
- titel, groep, deadline of verantwoordelijke gewijzigd → de taak gaat mee.

## Mail bij een gemiste deadline

- Aparte mail, los van het ochtendoverzicht. Onderwerp:
  *Actie nodig – \[taak] is nog niet uitgevoerd*, met de gemiste deadline en een
  directe link. Die link is de **persoonlijke link**, dus hij opent op de
  telefoon zonder inloggen; is er geen link, dan de pagina in het CRM.
- Klaargezet door `queueOverdueActionItems()` in `lib/staff-notifications.ts`,
  aangeroepen door de bestaande cron `/api/cron/staff-notifications` (elke tien
  minuten; de functie doet alleen iets om 08:00 Madrid). Geen extra cron in
  `vercel.json`.
- Sleutel: `actie:<id>:<deadline>:w<week>:<ontvanger>`. De mail komt één keer de
  dag na de deadline en daarna één keer per week zolang het punt openstaat. Een
  verzette deadline is een nieuwe sleutel en mag opnieuw melden; bij een punt
  van het hele team heeft iedereen zijn eigen sleutel, anders zou de eerste
  melding de rest van het team wegdrukken.
- Vlak voor verzenden wordt het punt opnieuw gelezen: afgevinkt, gearchiveerd,
  aan iemand anders gegeven of met een andere deadline → de melding vervalt.
- **Zonder verantwoordelijke gaat er geen mail uit.** Dat staat ook bij het punt
  op het scherm. Een alleen-lezen account krijgt niets: dat kan niets afvinken.
- Systeemmeldingen gaan uitsluitend naar de adressen in
  `SYSTEM_MAIL_RECIPIENTS` (`lib/mail-bcc.ts`). `hi@habitat-one.com` (Elles)
  staat daar niet in: zij ziet de punten in de lijst en in de agenda, maar krijgt
  geen herinneringsmail. Eén regel erbij verandert dat.

## Tabellen

- `action_items` — groep, subgroep, titel, toelichting, verantwoordelijke of
  `teamwide`, samen met, deadline, status (`open` / `in_progress` / `done`),
  afgevinkt door/op, aangemaakt door, gearchiveerd op, en `task_id` naar de
  agendataak.
- `action_item_comments` — punt, auteur, tekst.
- `action_list_links` — medewerker, token, laatst geopend.

Migraties `drizzle/0098_oval_tony_stark.sql` (de drie tabellen; breidt ook de
`kind`-check van `staff_notifications` uit met `action_overdue`) en
`drizzle/0099_*.sql` (`teamwide`).
