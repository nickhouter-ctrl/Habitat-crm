# lib/meta — Meta Marketing API-koppeling (marketingmodule, fase 3)

Server-side client voor de Graph API, gespiegeld aan `lib/holded/client.ts`.

## Bestanden

- `client.ts` — transport + rate-limiting: `Authorization: Bearer` uit
  `META_ACCESS_TOKEN` (alleen env, nooit db), leest bij elk antwoord
  `X-Business-Use-Case-Usage` en remt zichzelf af boven 80% benutting;
  `withMetaRetry` doet exponentiële backoff bij foutcode 17;
  `metaErrorMessage` vertaalt elke fout naar een NL-boodschap mét
  vervolgactie; `eurToCents` rekent db-`numeric`-strings zonder floats om.
- `publish.ts` — de publicatieketen PNG → `adimages` (image_hash) →
  `adcreatives` (object_story_spec met Instagram-plaatsing) → `ads`, altijd
  `status: PAUSED` (activeren gebeurt in Ads Manager, brief §3.4). Elke stap
  wordt op de `ads`-rij vastgelegd zodat een halve keten hervatbaar is; een
  fout komt vertaald in `reviewFeedback.publishError`. Ook:
  `validateAdSetScheduling` — dagdelen vereisen een lifetime-budget.
- `sync.ts` — statussync: batched (`/?ids=…`) `effective_status` +
  `ad_review_feedback` terugschrijven; `syncSingleAd` voor direct-na-publish.
- `types.ts` — alleen de Graph-API-typen die we echt gebruiken.

## Routes

- `POST /api/meta/publish` — spec + adset → gepauzeerde Meta-ad (ingelogd,
  geen viewer); pakt de nieuwste render, hergebruikt een niet-gepubliceerde
  ad-rij (geen duplicaten bij een herhaalde klik) en synct de status direct.
- `GET/POST /api/meta/sync` — cron (Bearer `CRON_SECRET`) resp. handmatig.

## Env (zie `.env.example`)

`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (zonder `act_`), `META_PAGE_ID`,
`IG_USER_ID`, optioneel `META_GRAPH_VERSION`.

Let op: Meta plant in de tijdzone van het advertentieaccount — controleer die
in Business Manager (hoort Europe/Madrid te zijn) vóór start-/eindtijden en
dagdelen worden gebruikt (brief §9).

## Concurrentiemonitor (fase 5) — `ads-archive.ts`

Leest het publieke DSA-advertentiearchief (`/ads_archive`,
`ad_reached_countries=['ES']`, `search_page_ids`) — geen scraping. Wekelijkse
pull via `GET /api/competitors/sync` (cron, ma 04:45); upsert in
`competitor_ads`: nieuw = first_seen, bestaand = last_seen + verversen, en een
gestopte advertentie krijgt `delivery_stop` maar verdwijnt nooit. Alleen
tekstvelden en de `ad_snapshot_url` als verwijzing — nooit media van
concurrenten naar onze Storage. Het kernsignaal is looptijd
(`days_running`); dashboard op `/marketing/competitors`. Token:
`META_ADS_ARCHIVE_TOKEN` (verloopt ±60 dagen; `/debug_token`-check toont een
verloopwaarschuwing in het dashboard in plaats van stil te falen).

Tests: `npx vitest run lib/meta` — pure logica (centen, BUC-parsing, backoff,
foutvertaling, planningsvalidatie, object_story_spec, looptijd/mapping/
aggregatie van de concurrentiemonitor).
