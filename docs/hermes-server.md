# Hermes-server voor Habitat

Ingericht op 19 oktober 2026. Deze server is bedoeld voor één agent die het CRM, Habitat Windows (de ramen/deuren-webapp) en de gewone Habitat-website kan bedienen. De applicatiekoppelingen en codewerkwijze staan in de sectie Habitat-koppelingen.

## Server en toegang

- DigitalOcean Droplet `habitat-hermes-01`, ID `610456905`, Amsterdam AMS3.
- Ubuntu 24.04 LTS, 2 vCPU, 4 GB RAM, 80 GB SSD, $24 per maand exclusief eventuele belasting. AI-verbruik apart. Geen betaalde extra database of back-up besteld.
- Publiek IP: `188.166.112.67`.
- Mac: `ssh habitat-hermes` gebruikt beheeraccount `habitat-admin` en `~/.ssh/habitat-hermes-ed25519`.
- Privésleutel uitsluitend op de Mac, bestandsrechten 600. De publieke sleutel heet bij DigitalOcean `habitat-hermes-admin`. Geen sleutelmateriaal in deze repository.
- SSH-hostkey is bij de eerste verbinding vastgelegd en daarna verplicht gecontroleerd via `~/.ssh/habitat-hermes-known-hosts`.
- Directe root-login en wachtwoordlogin zijn uitgeschakeld. `habitat-admin` heeft sudo; applicatiegebruiker `hermes` heeft geen sudo.
- UFW weigert inkomend verkeer, behalve TCP 22 vanaf het huidige beheer-IP `62.45.101.211`. Bij een gewijzigd beheer-IP de regel via bestaande verbinding of de DigitalOcean-herstelconsole aanpassen; geen SSH voor de hele wereld openzetten.
- Automatische Ubuntu-beveiligingsupdates zijn ingeschakeld.

## Hermes

Bron: https://github.com/NousResearch/hermes-agent

Geïnstalleerde commit: `d923a5eb487a17c0a68801bba9ef0f56c81040a8`.

Hermes draait onder gebruiker `hermes`, met gegevens in `/home/hermes/.hermes`. De standaard gateway-unit en een eigen `hermes-dashboard.service` draaien als systemd-gebruikersservices. Linger zorgt voor starten bij boot en voortbestaan na uitloggen.

Het dashboard luistert uitsluitend op `127.0.0.1:9119`. Open op de Mac een tunnel:

```sh
ssh -N -L 127.0.0.1:19119:127.0.0.1:9119 habitat-hermes
```

Open daarna `http://127.0.0.1:19119` op die Mac. De tunnel moet open blijven zolang je het dashboard gebruikt. Telegram kan na configuratie onafhankelijk van de Mac werken.

Gecontroleerd: beheerderslogin met sudo, UFW-regels, uitgeschakelde root- en wachtwoordlogin, beide services actief en dashboard HTTP 200. Een volledige serverreboot is uitgevoerd; de boot-ID veranderde en beide services kwamen automatisch terug met opnieuw HTTP 200. Het dashboard is ook via de SSH-tunnel in Chrome geopend. AI-accountkoppelingen zijn hieronder vastgelegd; Telegram is gekoppeld en door Nick getest.

Servicecontrole op de server:

```sh
sudo -iu hermes env XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus systemctl --user status hermes-dashboard hermes-gateway
```

Geheimen via de Hermes-setup invoeren; geen `.env`, OAuth-tokens of CRM-credentials kopiëren naar Git of chat. Een dashboard op localhost is een beheerscherm: geen publieke poort of omgekeerde proxy toevoegen zonder authenticatie.

## AI-accountkoppelingen

Nick heeft Claude Max en een bestaand Codex-abonnement. Beide zijn op de server onder gebruiker `hermes` aangemeld en getest. Codex is de standaardprovider (`openai-codex`, model `gpt-6.1-sol`, redeneerniveau `medium`); Claude is een tweede selecteerbare optie. Lokale OAuth-credentials zijn niet gekopieerd.

- Codex is aangemeld via `hermes auth add openai-codex --browser --no-browser`, met een tijdelijke SSH-tunnel van lokale poort 1455 naar serverpoort 1455. Apparaatcode-aanmelding was niet ingeschakeld op het account; de gewone browserroute werkte zonder die instelling te wijzigen. De tijdelijke aanmeldtunnel is daarna gesloten. Nieuwe aanmeldingen eveneens als gebruiker `hermes` uitvoeren.
- Claude Code native `2.1.303` is geïnstalleerd in `/home/hermes/.local/bin/claude` via de gecontroleerde officiële installer, inclusief SHA256-controle van de download.
- De officiële Nous-plugin `claude-subscription-directsdk-experimental` is via de catalogus geïnstalleerd en ingeschakeld, catalogusrevisie `6dacaadd`. Deze abonnementsroute is experimenteel en gebruikt de officiële Claude Code CLI. Aanmelding via `sudo -iu hermes /home/hermes/.local/bin/claude auth login --claudeai` is afgerond; `claude auth status` bevestigt `loggedIn: true`, `authMethod: claude.ai`, `subscriptionType: max`.
- Geen API-sleutels of automatische betaalde fallback ingesteld. Abonnementsquota en eventuele extra-usage-instellingen van de accounts blijven bepalend.
- Beide providers zijn getest met een korte tekstaanvraag en zonder gevraagde toolacties: Codex antwoordde `HERMES_CODEX_OK`, Claude via modelalias `sonnet` antwoordde `HERMES_CLAUDE_OK`.

## Telegram

Telegram is afgerond: bot `@hermes_wrsye5vwl7z26j2o_bot`, weergavenaam `Habitat-one`. De eigenaar is via de QR-onboarding vastgesteld; de allowlist bevat uitsluitend die eigenaar. Geen platform- of globale allow-all-vlag ingesteld. Gateway meldde op 19 oktober 2026 om 09:35:56 UTC `telegram: connected`, zonder fout. Het dashboard bevestigt `Connected`. Nick heeft met een nieuw bericht getest en bevestigd dat de bot antwoordt. Bij eerste start werden Telegram-dependencies automatisch geïnstalleerd en eerdere berichten overgeslagen (`drop_pending_on_cold_boot: true`); dit was de oorzaak van de aanvankelijke stilte.

## Habitat-koppelingen

- MCP-server `habitat` draait via stdio onder de bestaande Hermes-runtime (MCP 2.0.0). Bestanden in `/home/hermes/habitat/`; bron en werkinstructies in `integrations/hermes/`.
- CRM-endpoint `/api/hermes` geeft beperkte functies voor CRM en het `windows`-schema in dezelfde database: zoeken, opvolgtaak, contactnotitie, mailconcept, projectvoorstel bij een te keuren factuur en interne Windows-ordernotitie.
- Alleen namens `nick@habitat-one.com`, zolang dat account admin is. Telegram blijft beperkt tot de bestaande eigenaar. De marketingmailbox volgt dezelfde zichtbaarheid als in het CRM.
- Token op de server in `bridge-token` (600); alleen SHA256-digest in Vercel `HERMES_AGENT_TOKEN_SHA256`. `HERMES_AGENT_OWNER_EMAIL` bepaalt de eigenaar. Niet opnemen in Git/logs/Telegram. Rotatie: server-token vervangen en digest bijwerken, daarna nieuwe deployment.
- Schrijfacties hebben UUID-idempotentiesleutels, transacties en auditnotities. Mailconcepten en factuurprojecten gebruiken een vergelijking met de eerder gelezen waarde tegen gelijktijdig overschrijven.
- Geen generieke SQL, databasecredential, mailverzending, factuurboeking, betaling of eindgoedkeuring via de bridge. De factuurfunctie wijzigt het projectvoorstel; goedkeuring blijft in de bestaande CRM-flow.
- Git-checkouts: `/home/hermes/habitat/repos/{crm,windows,website}`. Drie afzonderlijke SSH-deploykeys met schrijfrecht; geregistreerd bij uitsluitend hun eigen repository. Privésleutels staan op de server in `.ssh/habitat-{naam}` (600). GitHub-hostsleutels gepind op de officiële `/meta`-response.
- Alle drie GitHub-repositories zijn gekoppeld aan hun Vercel-project; `main` is de productiebranch. Featurebranches voor previews; productiepush alleen bij een concrete publicatieopdracht. Geen algemeen GitHub- of Vercel-accounttoken op de agentserver.
- Skill `habitat-systems` beschrijft opdrachtgrenzen, codebranches, controles, commits, deploymentcontrole en omgaan met onbetrouwbare mail/inhoud. Een geslaagde push is niet automatisch een geslaagde deployment.
- Vercel CLI 64.5.0 gebruikt via `npx --yes vercel@64.5.0`; globale oudere CLI niet vervangen.

## Validatie

Negen tests voor authenticatie, autorisatie, invoer, bodylimiet, foutafscherming en cachebeleid. Typecheck en gerichte lintcontrole. Acht leesqueries gecontroleerd op de echte database. `integrations/hermes/verify-db.ts` test schrijftaken, idempotentie, conceptconflicten en ontbrekende records in een transactie die altijd wordt teruggedraaid; geen testmails verstuurd.

## Beheerpunten

Gebruiksbudget/monitoring en back-upbeleid/hersteltest zijn nog niet ingericht. Deze inrichting voegt geen betaalde fallback, extra database of back-upabonnement toe.
