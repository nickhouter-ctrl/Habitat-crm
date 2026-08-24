/**
 * De inhoud van het handboek als kant-en-klare HTML, in de Habitat One
 * huisstijl (cream/brown/terracotta, Sora via de root-layout-fontvariabele).
 *
 * Bewust één statische string in plaats van JSX: de tekst is het product,
 * er zit geen interactie in, en zo blijft hij makkelijk in één keer te
 * vervangen wanneer de werkwijze verandert. Alle tokens zijn met `--hb-`
 * geprefixt zodat ze niet botsen met de globale design-tokens.
 */
export const handleidingHtml = `
<style>
  .hb {
    --hb-bg: #faf7f1;
    --hb-surface: #ffffff;
    --hb-ink: #2a2520;
    --hb-ink-soft: #7a6f63;
    --hb-line: #e8dfd0;
    --hb-accent: #b6552d;
    --hb-accent-ink: #ffffff;
    --hb-accent-soft: #f7e9e1;
    --hb-gold: #a98a4b;
    --hb-gold-soft: #f4eddc;
    --hb-shadow: 0 1px 2px rgba(42, 37, 32, .06), 0 8px 24px rgba(42, 37, 32, .05);

    background: var(--hb-bg);
    color: var(--hb-ink);
    font-size: 17px;
    line-height: 1.7;
  }
  .hb a { color: var(--hb-accent); text-decoration: none; }
  .hb a:hover, .hb a:focus-visible { text-decoration: underline; }
  .hb a:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; border-radius: 2px; }

  .hb .shell { display: flex; max-width: 1150px; margin: 0 auto; }

  .hb nav.toc {
    width: 235px;
    flex: none;
    position: sticky;
    top: 0;
    align-self: flex-start;
    max-height: 100vh;
    overflow-y: auto;
    padding: 2rem 1.25rem 3rem 1.5rem;
    font-size: .85rem;
  }
  .hb nav.toc .brand { font-weight: 700; font-size: 1.05rem; margin-bottom: 1.2rem; }
  .hb nav.toc .brand span { color: var(--hb-accent); }
  .hb nav.toc h4 {
    margin: 1rem 0 .25rem;
    font-size: .68rem;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--hb-ink-soft);
    font-weight: 600;
  }
  .hb nav.toc ul { list-style: none; margin: 0; padding: 0; }
  .hb nav.toc a { display: block; padding: .16rem 0; color: var(--hb-ink); opacity: .85; }
  .hb nav.toc a:hover { opacity: 1; color: var(--hb-accent); text-decoration: none; }

  .hb main {
    flex: 1;
    min-width: 0;
    padding: 2.5rem 2.5rem 5rem;
    border-left: 1px solid var(--hb-line);
  }
  @media (max-width: 900px) {
    .hb .shell { display: block; }
    .hb nav.toc { position: static; width: auto; max-height: none; border-bottom: 1px solid var(--hb-line); padding-bottom: 1.4rem; }
    .hb main { border-left: none; padding: 1.5rem 1.1rem 4rem; }
  }

  .hb header.hero { max-width: 44rem; margin-bottom: 3rem; }
  .hb .eyebrow {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .12em;
    font-weight: 600;
    color: var(--hb-gold);
    margin-bottom: .6rem;
  }
  .hb h1 {
    font-size: clamp(2rem, 4.5vw, 2.8rem);
    line-height: 1.08;
    font-weight: 700;
    margin: 0 0 1rem;
    text-wrap: balance;
  }
  .hb header.hero p.lede { font-size: 1.1rem; color: var(--hb-ink-soft); margin: 0; }

  .hb h2 {
    font-size: 1.65rem;
    font-weight: 700;
    margin: 3.5rem 0 .5rem;
    padding-top: 1.4rem;
    border-top: 2px solid var(--hb-ink);
    text-wrap: balance;
  }
  .hb h3 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 2rem 0 .4rem;
    text-wrap: balance;
  }
  .hb p, .hb ul, .hb ol { max-width: 44rem; }
  .hb ul, .hb ol { padding-left: 1.3rem; }
  .hb li { margin: .3rem 0; }
  .hb li::marker { color: var(--hb-accent); }

  .hb .callout {
    max-width: 44rem;
    background: var(--hb-accent-soft);
    border-left: 3px solid var(--hb-accent);
    border-radius: 0 8px 8px 0;
    padding: .8rem 1.1rem;
    margin: 1.2rem 0;
    font-size: .95rem;
  }
  .hb .callout.warn { background: var(--hb-gold-soft); border-left-color: var(--hb-gold); }

  .hb table {
    border-collapse: collapse;
    width: 100%;
    font-size: .9rem;
    margin: 1rem 0 1.5rem;
  }
  .hb .table-wrap { overflow-x: auto; max-width: 54rem; }
  .hb th, .hb td { text-align: left; padding: .5rem .7rem; border-bottom: 1px solid var(--hb-line); vertical-align: top; }
  .hb th {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--hb-ink-soft);
    font-weight: 600;
    border-bottom: 2px solid var(--hb-ink);
  }
  .hb td.menu { white-space: nowrap; font-weight: 600; }

  .hb .recipe {
    background: var(--hb-surface);
    border: 1px solid var(--hb-line);
    border-left: 4px solid var(--hb-accent);
    border-radius: 10px;
    box-shadow: var(--hb-shadow);
    padding: 1.3rem 1.5rem 1rem;
    margin: 1.4rem 0;
    max-width: 50rem;
  }
  .hb .recipe > h3 { margin-top: 0; }
  .hb .recipe p, .hb .recipe ul, .hb .recipe ol { max-width: none; }
  .hb .recipe .waar { font-size: .84rem; color: var(--hb-ink-soft); margin: -.2rem 0 .8rem; }
  .hb .recipe .waar strong { color: var(--hb-ink); }
  .hb .recipe ol { counter-reset: stap; list-style: none; padding: 0; }
  .hb .recipe ol > li {
    counter-increment: stap;
    position: relative;
    padding-left: 2.6rem;
    margin: .55rem 0;
  }
  .hb .recipe ol > li::before {
    content: counter(stap);
    position: absolute;
    left: 0; top: .12rem;
    width: 1.7rem; height: 1.7rem;
    border-radius: 50%;
    background: var(--hb-accent);
    color: var(--hb-accent-ink);
    font-weight: 700;
    font-size: .82rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .hb .recipe ol ul { list-style: disc; padding-left: 1.2rem; margin-top: .3rem; }

  .hb .daggrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    max-width: 54rem;
    margin: 1.4rem 0 1rem;
  }
  .hb .dagkaart {
    background: var(--hb-surface);
    border: 1px solid var(--hb-line);
    border-radius: 10px;
    box-shadow: var(--hb-shadow);
    padding: 1.1rem 1.25rem;
  }
  .hb .dagkaart h3 { margin: 0 0 .1rem; font-size: 1.05rem; }
  .hb .dagkaart .tijd { font-size: .74rem; color: var(--hb-gold); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .hb .dagkaart ul { margin: .6rem 0 0; padding-left: 1.15rem; font-size: .92rem; }

  .hb footer.slot {
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--hb-line);
    color: var(--hb-ink-soft);
    font-size: .84rem;
    max-width: 44rem;
  }
</style>

<div class="hb">
<div class="shell">
<nav class="toc" aria-label="Inhoud">
  <div class="brand">Habitat <span>CRM</span> Handboek</div>
  <h4>Start</h4>
  <ul>
    <li><a href="#basis">Zo zit het in elkaar</a></li>
    <li><a href="#dagelijks">Wat moet er elke dag?</a></li>
  </ul>
  <h4>Zo doe je het</h4>
  <ul>
    <li><a href="#r-keuren">Inkoopfactuur keuren</a></li>
    <li><a href="#r-offerte">Offerte maken</a></li>
    <li><a href="#r-aanvraag">Offerte uit een aanvraag</a></li>
    <li><a href="#r-factuur">Factuur maken</a></li>
    <li><a href="#r-begroting">Verbouwing: begroting &amp; project</a></li>
    <li><a href="#r-urenmateriaal">Uren &amp; materiaal boeken</a></li>
    <li><a href="#r-cijfers">De cijfers begrijpen</a></li>
    <li><a href="#r-product">Product toevoegen</a></li>
    <li><a href="#r-account">Klantaccount goedkeuren</a></li>
    <li><a href="#r-afspraak">Afspraak maken</a></li>
  </ul>
  <h4>Naslag</h4>
  <ul>
    <li><a href="#waarvind">Waar vind ik wat?</a></li>
    <li><a href="#automatisch">Wat gaat er vanzelf?</a></li>
    <li><a href="#weten">Goed om te weten</a></li>
  </ul>
</nav>

<main>
<header class="hero">
  <div class="eyebrow">Habitat One · Xàbia — Costa Blanca</div>
  <h1>Handboek voor het Habitat CRM</h1>
  <p class="lede">Wat je elke dag doet, hoe de tien belangrijkste taken werken, en waar je alles vindt. Kort en zonder vaktaal.</p>
</header>

<section id="basis">
  <h2>Zo zit het in elkaar</h2>
  <p>Het CRM is het programma waarin al het dagelijkse werk gebeurt: klanten, offertes, facturen, projecten, voorraad en inkoop. De boekhouding zelf zit in <strong>Holded</strong>.</p>
  <p>Drie dingen om te onthouden:</p>
  <ul>
    <li><strong>De rode badges in de zijbalk zijn je takenlijst.</strong> Staan die op nul, dan ben je bij.</li>
    <li><strong>Betalingen registreert de boekhouder in Holded.</strong> Het CRM haalt de betaalstatus vanzelf op — jij hoeft daar niets voor te doen.</li>
    <li><strong>Veel gaat automatisch.</strong> Mail ophalen, herinneringen sturen, voorraad afboeken bij een factuur — zie <a href="#automatisch">Wat gaat er vanzelf?</a></li>
  </ul>
  <p>Inloggen kan met e-mail + wachtwoord, of met de knop in een meldingsmail. Die link is persoonlijk — niet doorsturen.</p>
</section>

<section id="dagelijks">
  <h2>Wat moet er elke dag gebeuren?</h2>
  <div class="daggrid">
    <div class="dagkaart">
      <div class="tijd">Elke ochtend · ±15 min</div>
      <h3>Het koffierondje</h3>
      <ul>
        <li>Open het <strong>Dashboard</strong> en werk het lijstje <em>"Wat moet er gebeuren"</em> van boven naar beneden af.</li>
        <li><strong>Facturen keuren</strong> — de rode badge, of de knop in de ochtendmail.</li>
        <li><strong>Aanvragen</strong> beantwoorden (rode badge).</li>
        <li><strong>Mail-inbox</strong> doorlopen: koppelen of archiveren.</li>
        <li>Ligt er een "⏱ Uren te controleren"-mail? <strong>Uren goedkeuren</strong> op het project.</li>
      </ul>
    </div>
    <div class="dagkaart">
      <div class="tijd">Door de dag heen</div>
      <h3>Het lopende werk</h3>
      <ul>
        <li>Offertes maken en versturen.</li>
        <li>Geaccepteerde offertes <strong>factureren</strong> (staan klaar op het dashboard).</li>
        <li>Leveringen plannen; bij uitlevering de pakbon <strong>afscannen</strong>.</li>
        <li>Nieuwe klantaccounts goedkeuren zodra de mail binnenkomt.</li>
      </ul>
    </div>
    <div class="dagkaart">
      <div class="tijd">Elke maandag</div>
      <h3>De weekcontrole</h3>
      <ul>
        <li>De <strong>weekcontrole-mail</strong> doorlopen en elk signaal oppakken. Die mail komt óók als alles goed is.</li>
        <li>Openstaande facturen → <strong>herinnering sturen</strong>.</li>
        <li><strong>Rapporten → Data-check</strong>: de lijstjes leegwerken.</li>
      </ul>
    </div>
    <div class="dagkaart">
      <div class="tijd">Maandelijks</div>
      <h3>De grote knoppen</h3>
      <ul>
        <li><strong>Sync Holded</strong> (in Instellingen).</li>
        <li><strong>Rapporten → BTW</strong> vóór de aangifte.</li>
        <li><strong>Inkooporders → Bijbestellen</strong>: alles onder de voorraaddrempel bestellen.</li>
      </ul>
    </div>
  </div>
</section>

<section id="howto">
  <h2>Zo doe je het — stap voor stap</h2>

  <div class="recipe" id="r-keuren">
    <h3>Een inkoopfactuur keuren</h3>
    <p class="waar"><strong>Waar:</strong> zijbalk → <strong>Facturen keuren</strong>, of de knop in de ochtendmail (werkt zonder inloggen).</p>
    <p>Facturen die op <strong>purchase@</strong> binnenkomen staan hier automatisch klaar, al uitgelezen. Zolang een factuur hier staat, telt hij nog nergens mee.</p>
    <ol>
      <li>Lees het oordeel op de kaart: <em>Compleet</em>, <em>Let op</em> of <em>Incompleet</em> — met erbij wat er ontbreekt.</li>
      <li>Controleer en verbeter zo nodig: leverancier, bedrag, <strong>soort</strong> (uren of materiaal) en <strong>project</strong>. Hoort de factuur bij geen project (energie, telefoon)? Vink <em>Algemene kosten</em> aan. Loopt hij over meerdere werven? Vink dat aan en verdeel de bedragen.</li>
      <li>Kies een knop:
        <ul>
          <li><strong>Goedkeuren</strong> — de factuur wordt geboekt en de kosten komen op het project.</li>
          <li><strong>Afkeuren</strong> — er wordt niets geboekt. Het systeem kan meteen een nette mail aan de leverancier opstellen met wat er mis is; jij leest hem na en bevestigt vóór verzending.</li>
          <li><strong>Bijlage bij…</strong> — dit is geen factuur maar een specificatie; hij wordt bijlage bij de andere factuur uit dezelfde mail.</li>
          <li><strong>Negeren</strong> — geen echte factuur (bv. reclame).</li>
        </ul>
      </li>
    </ol>
    <p>Dubbel boeken kan niet: staat de factuur er al, dan koppelt het systeem de mail aan de bestaande boeking.</p>
  </div>

  <div class="recipe" id="r-offerte">
    <h3>Een offerte maken en versturen</h3>
    <p class="waar"><strong>Waar:</strong> Verkoop → Offertes → <strong>Nieuwe offerte</strong>. Voor een hele verbouwing: zie <a href="#r-begroting">het verbouwings-recept</a>.</p>
    <ol>
      <li>Kies de klant, of maak er ter plekke één aan. Zet meteen e-mail en <strong>taal</strong> goed — de taal bepaalt alle mails en documenten.</li>
      <li>Geef de offerte een duidelijke titel en voeg regels toe: zoek producten op naam of SKU, of typ vrije regels. Kies per regel showroomprijs of aannemersprijs (−20%). Bezorgen? Vul het adres in — de bezorgkosten worden automatisch berekend.</li>
      <li>Kijk naar de <strong>marge</strong> die live meeloopt (de klant ziet die niet). Rood = onder de kostprijs → prijs of korting aanpassen.</li>
      <li>Hele verbouwing? Zet na het aanmaken <strong>Contract vereisen</strong> aan — de klant tekent dan online een aannemingsovereenkomst.</li>
      <li>Klik <strong>Versturen naar klant</strong>, lees de voorgestelde mail na en verstuur. De klant krijgt een link die 45 dagen werkt; de PDF gaat automatisch mee.</li>
    </ol>
    <p>De reactie (geaccepteerd, afgewezen of ondertekend) komt vanzelf terug — op het document én per mail.</p>
  </div>

  <div class="recipe" id="r-aanvraag">
    <h3>Een offerte maken uit een website-aanvraag</h3>
    <p class="waar"><strong>Waar:</strong> zijbalk → <strong>Aanvragen</strong> (rode badge).</p>
    <ol>
      <li>Open de aanvraag. Je ziet de klantgegevens, het bericht en de aangevraagde producten.</li>
      <li>Klik <strong>✓ Accepteren</strong>. Het contact wordt automatisch aangemaakt of gekoppeld.</li>
      <li>Klik <strong>+ Offerte opstellen</strong>. De offerte opent met de klant en de producten al ingevuld.</li>
      <li>Prijzen en aantallen aanvullen, marge checken, versturen. Klaar.</li>
    </ol>
    <p>Eerst iets vragen? Gebruik het blok <em>Mail de klant</em> op de aanvraag zelf.</p>
  </div>

  <div class="recipe" id="r-factuur">
    <h3>Een factuur maken</h3>
    <p class="waar"><strong>Waar:</strong> vanaf de geaccepteerde offerte. Het dashboard laat zien welke offertes klaarstaan om te factureren.</p>
    <ol>
      <li>Open de geaccepteerde offerte en kies:
        <ul>
          <li><strong>Factuur maken van deze offerte</strong> + een percentage — bv. 50 voor een aanbetaling. Het systeem onthoudt hoeveel al gefactureerd is.</li>
          <li><strong>Factureren per fase</strong> — een factuur met precies de regels van één bouwfase.</li>
          <li><strong>Factureren per termijn</strong> — volgens het betalingsschema uit de calculator.</li>
        </ul>
      </li>
      <li>Verstuur de factuur zoals een offerte. Bij het versturen wordt de <strong>voorraad automatisch afgeboekt</strong> en gaat de factuur naar Holded. Onvolledige klantgegevens (NIF, adres)? Dan blokkeert het systeem tot je ze aanvult.</li>
      <li>De <strong>eindfactuur</strong> maak je op het project met de knop <em>Eindafrekening opstellen</em> — betaalde voorschotten worden er automatisch op verrekend.</li>
      <li>Blijft een factuur openstaan? Knop <strong>Herinnering</strong> — het niveau loopt vanzelf op: 1e, 2e, aanmaning.</li>
    </ol>
    <div class="callout warn"><strong>Voorschot (provisión de fondos):</strong> dat is géén factuur — geen btw, blijft buiten Holded, en gaat <strong>eerst ter controle naar de boekhouder</strong> voordat hij naar de klant gaat.</div>
  </div>

  <div class="recipe" id="r-begroting">
    <h3>Een verbouwing: begroting, offerte en project</h3>
    <p class="waar"><strong>Waar:</strong> bijna altijd via Verkoop → <strong>Offerte-calculator</strong>.</p>
    <ol>
      <li>Vul de klant in en <strong>typ een nieuwe projectnaam</strong> — het project wordt automatisch aangemaakt.</li>
      <li>Vul de <strong>maten van de woning</strong> in: oppervlaktes, badkamers, techniek, buitenruimte. Wat leeg blijft, telt niet mee.</li>
      <li>Klik <strong>Bereken voorbeeld</strong> en loop de regels na. Elk aantal is aanpasbaar; 0 laat de regel vervallen. Onder 15% marge kleurt het rood.</li>
      <li>Klik <strong>Offerte aanmaken</strong> en verstuur hem. De klant tekent online de aannemingsovereenkomst.</li>
      <li>Bij ondertekening richt het systeem het project vanzelf in: aanneemsom, begroting per fase en de termijnfacturen staan klaar.</li>
    </ol>
    <p><strong>Liever handmatig?</strong> Maak eerst het project (Projecten → Nieuw project), open <em>Begroting</em>, bouw de fases op en klik daar <strong>→ Offerte maken</strong>. Zelfde resultaat.</p>
  </div>

  <div class="recipe" id="r-urenmateriaal">
    <h3>Uren en materiaal op een project boeken</h3>
    <p class="waar"><strong>Waar:</strong> project → tabblad <strong>Uren &amp; kosten</strong>. Veel gaat vanzelf via het keuren van inkoopfacturen.</p>
    <p><strong>Uren van de jongens:</strong></p>
    <ol>
      <li>Maak op het project onder <em>Urenportaal</em> een persoonlijke link per arbeider en stuur die via WhatsApp.</li>
      <li>De arbeider vult zelf zijn uren in op zijn telefoon, in zijn eigen taal.</li>
      <li>Jij krijgt een mail en keurt de uren goed. <strong>Pas dan tellen ze mee</strong> in de kosten.</li>
      <li>Komt later de weekfactuur van de bouwer binnen? Keur die als <em>uren</em> op het project — het systeem hangt de portaal-uren eraan, zodat niets dubbel telt.</li>
    </ol>
    <p><strong>Materiaal en kosten:</strong></p>
    <ul>
      <li>Inkoopfacturen: bij het <a href="#r-keuren">keuren</a> kies je het project → klaar.</li>
      <li>Eigen producten uit de voorraad: blok <em>Producten geleverd op dit project</em> — boeken zet de voorraad eraf.</li>
      <li>Losse kosten zonder factuur: gewoon een regel toevoegen.</li>
      <li><strong>Meerwerk</strong> boek je apart, mét het vinkje <em>akkoord van de klant</em>. Het komt bovenop de eindafrekening.</li>
    </ul>
  </div>

  <div class="recipe" id="r-cijfers">
    <h3>De cijfers op het project begrijpen</h3>
    <p class="waar"><strong>Waar:</strong> project → tabblad Overzicht, blok <em>"Resultaat — zitten we goed?"</em>.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Cijfer</th><th>Betekent</th></tr></thead>
      <tbody>
        <tr><td><strong>Doel</strong></td><td>Wat de klant betaalt (de aanneemprijs).</td></tr>
        <tr><td><strong>Kostenplafond</strong></td><td>Wat het project máximaal mag kosten om 15% marge over te houden (85% van het doel).</td></tr>
        <tr><td><strong>Kosten tot nu toe</strong></td><td>Goedgekeurde uren + inkoop + losse kosten + de kostprijs van eigen geleverde producten.</td></tr>
        <tr><td><strong>Resultaat tot nu toe</strong></td><td>Doel min kosten. De badge kleurt: ✓ op koers, ⚠ onder 15%, ⚠ verlies.</td></tr>
        <tr><td><strong>Gefactureerd / ontvangen</strong></td><td>Wat er aan facturen uitstaat en wat er echt binnen is.</td></tr>
        <tr><td><strong>Nog te factureren</strong></td><td>Wat er nog naar de klant moet. Dit is het getal om in de gaten te houden.</td></tr>
      </tbody>
    </table></div>
    <p>Simpel gezegd: <strong>blijven de kosten onder het plafond en gaat "nog te factureren" richting nul, dan zit het goed.</strong> De weekcontrole-mail waarschuwt als een project erdoorheen schiet.</p>
  </div>

  <div class="recipe" id="r-product">
    <h3>Een nieuw product toevoegen</h3>
    <p class="waar"><strong>Waar:</strong> Producten → <strong>Nieuw product</strong>. Sneller: op een inkooporder de knop <em>+ Maak product</em>.</p>
    <ol>
      <li>Vul naam, collectie en eenheid in.</li>
      <li>Zet de <strong>showroomprijs</strong> (ex. btw). De aannemersprijs mag leeg — dan rekent het systeem automatisch −20%.</li>
      <li>Vul de <strong>kostenopbouw</strong> in: inkoop, vracht, transport, invoerrecht. De kostprijs en de marge rollen er vanzelf uit — zo zie je meteen hoeveel korting er maximaal kan.</li>
      <li>Zet voorraad en <strong>minimumvoorraad</strong> (daaronder komt het product op de bijbestel-lijst).</li>
      <li>Klik <strong>Barcode genereren</strong> en print het label — nu is het product scanbaar.</li>
      <li>Foto uploaden en eventueel <strong>"op de website tonen"</strong> aanvinken → <em>Push naar website</em>. De tekst wordt automatisch in vier talen vertaald.</li>
    </ol>
    <p>Daarna loopt de voorraad vanzelf mee: facturen boeken af, inkooporders boeken bij. Iets kwijt zonder verkoop (breuk, showroommodel)? <strong>Producten → Voorraad afboeken</strong>.</p>
  </div>

  <div class="recipe" id="r-account">
    <h3>Een klantaccount goedkeuren</h3>
    <p class="waar"><strong>Waar:</strong> de mail "Accepteren of weigeren →", of zijbalk → <strong>Klant-accounts</strong>.</p>
    <p>Klanten vragen op de website een account aan om prijzen te kunnen zien.</p>
    <ol>
      <li>Klik de knop in de mail — de aanvraag staat bovenaan bij <em>Openstaande aanvragen</em>.</li>
      <li>Kies het prijsniveau: <strong>Particulier</strong> (showroomprijzen) of <strong>Aannemer</strong> (−20%). Zakelijk mét btw-nummer = meestal aannemer.</li>
      <li>Klik <strong>Accepteren</strong>. De klant krijgt een activatiemail en kiest een wachtwoord. Klaar.</li>
    </ol>
    <p>Later aanpassen kan altijd: prijsniveau wijzigen, blokkeren, of de activatiemail opnieuw sturen.</p>
  </div>

  <div class="recipe" id="r-afspraak">
    <h3>Een afspraak maken</h3>
    <p class="waar"><strong>Waar:</strong> <strong>Agenda</strong>, of vanuit een afspraakaanvraag van de website.</p>
    <ol>
      <li><strong>Zelf plannen:</strong> Agenda → <em>Nieuwe afspraak</em>: titel, datum, tijd, locatie (standaard de showroom). Taken met een deadline maak je op dezelfde pagina.</li>
      <li><strong>Vanuit een aanvraag:</strong> de voorkeursdatum van de klant staat al ingevuld. Klik <em>Inplannen + klant bevestigen</em> — de klant krijgt meteen een bevestigingsmail.</li>
      <li><strong>Past het niet?</strong> Stel tot vier andere momenten voor. De klant kiest zelf via een link en de afspraak wordt automatisch ingepland.</li>
    </ol>
  </div>
</section>

<section id="waarvind">
  <h2>Waar vind ik wat?</h2>
  <p>Elk menu-item in één zin.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Menu</th><th>Wat het is</th></tr></thead>
    <tbody>
      <tr><td class="menu">Dashboard</td><td>Je takenlijst en de belangrijkste cijfers. Hier begint elke dag.</td></tr>
      <tr><td class="menu">Scannen</td><td>Barcode scannen: prijs opzoeken, pakbon afleveren, voorraad bijwerken.</td></tr>
      <tr><td class="menu">Agenda</td><td>Afspraken en taken.</td></tr>
      <tr><td class="menu">Contacten</td><td>Alle klanten, leveranciers en partners — alles hangt hieraan.</td></tr>
      <tr><td class="menu">Klant-accounts</td><td>Wie mag prijzen zien op de website, en tegen welk niveau.</td></tr>
      <tr><td class="menu">Aanvragen</td><td>Alles wat via de website binnenkomt: offertes, afspraken, berichten.</td></tr>
      <tr><td class="menu">Leads</td><td>Koude acquisitie: bedrijven verzamelen en mailcampagnes sturen.</td></tr>
      <tr><td class="menu">Commissies</td><td>Wie bracht welke klant aan en wat krijgt die ervoor. Loopt vanzelf mee met de facturen.</td></tr>
      <tr><td class="menu">Projecten</td><td>Per verbouwing: begroting, uren, kosten, betalingen en resultaat.</td></tr>
      <tr><td class="menu">Ploeg</td><td>De arbeiders met hun uurtarief en de taal van hun urenportaal.</td></tr>
      <tr><td class="menu">Panden</td><td>Het vastgoed in de verkoop; gepubliceerde panden staan op de website.</td></tr>
      <tr><td class="menu">Offertes / Facturen / Voorschotten</td><td>Alle verkoopdocumenten. Zelfde scherm, ander filter.</td></tr>
      <tr><td class="menu">Offerte-calculator</td><td>Maten van de woning in → complete verbouwingsofferte uit.</td></tr>
      <tr><td class="menu">Prijzenboek</td><td>De eenheidsprijzen waar de calculator mee rekent.</td></tr>
      <tr><td class="menu">Prijslijst</td><td>Nette prijslijst-PDF's maken of mailen, in vier talen.</td></tr>
      <tr><td class="menu">Catalogi</td><td>PDF-brochures om snel met een klant te delen.</td></tr>
      <tr><td class="menu">Producten</td><td>De artikelcatalogus: voorraad, prijzen, marges, barcodes, website.</td></tr>
      <tr><td class="menu">Samples</td><td>Staaltjes de deur uit, € 5 borg per stuk.</td></tr>
      <tr><td class="menu">Samplecatalogus</td><td>Welke kleuren en maten bestaan er bij de leverancier — geen voorraad.</td></tr>
      <tr><td class="menu">Wederverkopers</td><td>Producten die bij dealers in de winkel liggen (consignatie, −25%).</td></tr>
      <tr><td class="menu">Bestellen</td><td>Bestelbonnen naar leveranciers klaarzetten en versturen.</td></tr>
      <tr><td class="menu">Leveranciers &amp; ploeg</td><td>Per leverancier: wat is er ingekocht en waar ging het geld naartoe.</td></tr>
      <tr><td class="menu">Inkooporders</td><td>Alle inkoop: bestellingen en gekeurde facturen, gekoppeld aan projecten.</td></tr>
      <tr><td class="menu">Facturen keuren</td><td>De wachtrij met binnengekomen inkoopfacturen. Elke dag leegwerken.</td></tr>
      <tr><td class="menu">Shipments</td><td>Per container: is alle papierwinkel compleet en wat kost de import extra.</td></tr>
      <tr><td class="menu">Pakbonnen / Leveringen</td><td>Wat er naar de klant gaat: plannen, mailen, afscannen, afleveren.</td></tr>
      <tr><td class="menu">Marketing</td><td>Beelden, advertenties en campagnes voor Facebook/Instagram.</td></tr>
      <tr><td class="menu">Mail-inbox / Archief</td><td>Binnengekomen mail en alle bijlagen, automatisch gesorteerd.</td></tr>
      <tr><td class="menu">Rapporten</td><td>Omzet, marge, btw, websitecijfers en de data-check.</td></tr>
      <tr><td class="menu">Instellingen</td><td>Medewerkers, wachtwoorden en de Holded-koppeling.</td></tr>
    </tbody>
  </table></div>
</section>

<section id="automatisch">
  <h2>Wat gaat er vanzelf?</h2>
  <p>Dit doet het systeem zonder dat iemand iets hoeft te doen:</p>
  <ul>
    <li><strong>Elk kwartier:</strong> mail ophalen, bijlagen archiveren, inkoopfacturen uitlezen en in de keuren-wachtrij zetten.</li>
    <li><strong>Elke nacht:</strong> betaalstatussen uit Holded halen, vervallen facturen markeren, en een controle-mail sturen als er iets niet klopt.</li>
    <li><strong>Elke ochtend:</strong> de inkoop-ochtendmail (wat wacht op goedkeuring) en een herinnering aan klanten die morgen een levering krijgen.</li>
    <li><strong>Elke maandag:</strong> de weekcontrole-mail — komt óók als alles in orde is.</li>
    <li><strong>Bij het versturen van een factuur:</strong> voorraad afboeken, naar Holded pushen, commissies bijwerken.</li>
    <li><strong>Bij ondertekening van een offerte:</strong> het project inrichten met aanneemsom, begroting en termijnfacturen.</li>
    <li><strong>±3 weken na een levering:</strong> een Google-reviewverzoek (als dat aanstaat).</li>
  </ul>
</section>

<section id="weten">
  <h2>Goed om te weten</h2>
  <ul>
    <li><strong>Betaald of niet?</strong> Dat bepaalt Holded. In het CRM kijk je alleen; de boekhouder registreert daar.</li>
    <li><strong>Een voorschot is geen factuur.</strong> Geen btw, buiten Holded, en eerst langs de boekhouder.</li>
    <li><strong>Getekende offertes staan op slot.</strong> Bewerken kan alleen na ontgrendelen mét reden — en het getekende exemplaar blijft altijd bewaard.</li>
    <li><strong>Prijzen:</strong> aannemers −20%, dealers −25%, en de marge op een product is meteen de maximale korting zonder verlies.</li>
    <li><strong>Projectnorm:</strong> minimaal 15% marge. Het kostenplafond is 85% van de aanneemsom.</li>
    <li><strong>Klant-links verlopen:</strong> offerte 45 dagen, inloglink 30 dagen, keuren-link 2 weken.</li>
    <li><strong>Meerwerk</strong> altijd boeken mét het vinkje "akkoord van de klant" — anders piept de weekcontrole.</li>
    <li><strong>Dubbel boeken kan niet:</strong> het systeem herkent dubbele facturen, dubbele voorraad-afboekingen en dubbele uren, en houdt ze tegen.</li>
  </ul>

  <footer class="slot">
    Samengesteld op 24 augustus 2026 uit de actuele stand van het systeem. Verandert er iets wezenlijks, laat de handleiding dan bijwerken — de link blijft dezelfde.
  </footer>
</section>
</main>
</div>
</div>
`;
