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

## Video-ads (U7)

De creative-editor is en blijft **image-only** — video's krijgen geen
CreativeSpec. Een video-ad verwijst rechtstreeks naar het asset
(`ads.assetId`, XOR met `specId`) en krijgt zijn copy uit `copy_blocks` in de
publish-flow (bv. via `getCopySuggestion` uit lib/marketing/copy-suggest.ts,
altijd door een mens bevestigd). Keten (`publishVideoAdToMeta`): publieke
Storage-URL → `POST /act/advideos` met `file_url` (Meta haalt de video zelf
op — geen multipart), wachten tot de verwerking klaar is, adcreative met
`video_data` (video-id + posterframe `image_url`), advertentie **PAUSED**.
Zelfde stapsgewijze vastlegging, retries en NL-foutafhandeling als de
beeldketen; het Meta-video-id wordt op de ad-rij bewaard zodat een halve
keten hervatbaar is.

## Carrousel-advertenties

Meerdere goedgekeurde creatives als één advertentie (2–10 kaartjes, elk met
eigen kop/ondertitel uit de spec-copy). `buildCarouselStorySpec` bouwt de
`object_story_spec` met `child_attachments` (`multi_share_optimized: false`
— wij bepalen de volgorde); `publishCarouselAdToMeta` draait dezelfde
PAUSED-keten als de beeldketen. De ad-rij draagt `carouselSpecIds` (alle
kaartjes, in volgorde) naast `specId` (het eerste kaartje, voor de
xor-check). UI: het publicatieformulier op de campagnepagina heeft een
carrouselmodus met aanvinkvolgorde = kaartvolgorde.

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
