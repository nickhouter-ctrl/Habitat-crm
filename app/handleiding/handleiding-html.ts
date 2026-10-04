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
    <li><a href="#rollen">Wie ziet wat</a></li>
  </ul>
  <h4>Klant &amp; contact</h4>
  <ul>
    <li><a href="#r-beurs">Beursbezoeker vastleggen</a></li>
    <li><a href="#r-opvolgen">Een klant persoonlijk mailen</a></li>
    <li><a href="#r-reactie">Een reactie opvolgen</a></li>
    <li><a href="#r-verkooppunt">Een verkooppunt opbouwen</a></li>
    <li><a href="#r-campagne">Een mailcampagne versturen</a></li>
    <li><a href="#r-aanvraag">Offerte uit een aanvraag</a></li>
    <li><a href="#r-account">Klantaccount goedkeuren</a></li>
    <li><a href="#r-afspraak">Afspraak maken</a></li>
  </ul>
  <h4>Verkoop &amp; werk</h4>
  <ul>
    <li><a href="#r-offerte">Offerte maken</a></li>
    <li><a href="#r-factuur">Factuur maken</a></li>
    <li><a href="#r-begroting">Verbouwing: begroting &amp; project</a></li>
    <li><a href="#r-urenmateriaal">Uren &amp; materiaal boeken</a></li>
    <li><a href="#r-cijfers">De cijfers begrijpen</a></li>
  </ul>
  <h4>Inkoop &amp; producten</h4>
  <ul>
    <li><a href="#r-keuren">Inkoopfactuur keuren</a></li>
    <li><a href="#r-product">Product toevoegen</a></li>
  </ul>
  <h4>Naslag</h4>
  <ul>
    <li><a href="#paginas">Elke pagina</a></li>
    <li><a href="#mail">Mail: wie leest mee</a></li>
    <li><a href="#automatisch">Wat gaat er vanzelf?</a></li>
    <li><a href="#talen">Talen</a></li>
    <li><a href="#weten">Goed om te weten</a></li>
  </ul>
</nav>

<main>
<header class="hero">
  <div class="eyebrow">Habitat One · Xàbia — Costa Blanca</div>
  <h1>Handboek voor het Habitat CRM</h1>
  <p class="lede">Wat je elke dag doet, hoe het werk stap voor stap gaat, en wat elke pagina in het menu doet. Kort en zonder vaktaal.</p>
</header>

<section id="basis">
  <h2>Zo zit het in elkaar</h2>
  <p>Het CRM is het programma waarin al het dagelijkse werk gebeurt: klanten, offertes, facturen, projecten, voorraad, inkoop, beurscontacten en marketing. De boekhouding zelf zit in <strong>Holded</strong>.</p>
  <p>Vier dingen om te onthouden:</p>
  <ul>
    <li><strong>De zijbalk is gegroepeerd en inklapbaar.</strong> Klanten, Projecten, Verkoop, Producten, Inkoop, Kozijnen, Marketing en Cijfers. De groep waar je in zit staat altijd open; de rest klap je weg. Bovenaan staat zonder kop wat je elke dag als eerste opendoet.</li>
    <li><strong>De rode cijfertjes in de zijbalk zijn je takenlijst.</strong> Staan die op nul, dan ben je bij. Een ingeklapte groep telt de cijfers van zijn onderdelen bij elkaar op, zodat je niets mist.</li>
    <li><strong>Betalingen registreert de boekhouder in Holded.</strong> Het CRM haalt de betaalstatus vanzelf op — jij hoeft daar niets voor te doen.</li>
    <li><strong>Veel gaat automatisch.</strong> Mail ophalen, herinneringen sturen, voorraad afboeken bij een factuur — zie <a href="#automatisch">Wat gaat er vanzelf?</a></li>
  </ul>
  <p>De <strong>startpagina</strong> is van jou: je kunt tegels vastpinnen, verbergen en op volgorde zetten. Wat je vastpint staat groot bovenaan.</p>
  <p>Inloggen kan met e-mail + wachtwoord, of met de knop in een meldingsmail. Die link is persoonlijk — niet doorsturen.</p>
  <div class="callout">Iets kwijt? Gebruik <strong>Zoeken</strong> (minimaal twee tekens). Dat doorzoekt contacten, offertes, facturen, projecten en producten tegelijk.</div>
</section>

<section id="dagelijks">
  <h2>Wat moet er elke dag gebeuren?</h2>
  <div class="daggrid">
    <div class="dagkaart">
      <div class="tijd">Elke ochtend · ±15 min</div>
      <h3>Het koffierondje</h3>
      <ul>
        <li>Open <strong>Start</strong> en werk het lijstje <em>"Wat moet er gebeuren"</em> van boven naar beneden af.</li>
        <li><strong>Facturen keuren</strong> — het cijfertje, of de knop in de ochtendmail.</li>
        <li><strong>Aanvragen</strong> beantwoorden.</li>
        <li><strong>Opvolging</strong>: staat er een cijfertje, dan heeft een klant geantwoord. Oppakken.</li>
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
        <li>Beurs- en websitecontacten <strong>persoonlijk mailen</strong> vanaf Opvolging.</li>
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
        <li><strong>Rapporten → Data-gezondheid</strong>: de lijstjes leegwerken.</li>
      </ul>
    </div>
    <div class="dagkaart">
      <div class="tijd">Maandelijks</div>
      <h3>De grote knoppen</h3>
      <ul>
        <li><strong>Sync Holded</strong> (in Instellingen).</li>
        <li><strong>Rapporten → BTW</strong> vóór de aangifte.</li>
        <li><strong>Bestellen</strong>: alles onder de voorraaddrempel bijbestellen.</li>
        <li><strong>Rapporten → Inkoop-aandacht</strong>: waar de inkoopprijs te hoog is.</li>
      </ul>
    </div>
  </div>
</section>

<section id="rollen">
  <h2>Wie ziet wat</h2>
  <p>Niet iedereen ziet hetzelfde. Er zijn vier rollen; je rol staat bij <strong>Instellingen → Medewerkers</strong>.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Rol</th><th>Mag</th></tr></thead>
    <tbody>
      <tr><td class="menu">Beheerder</td><td>Alles, plus medewerkers toevoegen en rollen wijzigen.</td></tr>
      <tr><td class="menu">Medewerker</td><td>Alles behalve het beheer van medewerkers.</td></tr>
      <tr><td class="menu">Marketing en klantcontact</td><td>Start, zoeken, mail, contacten, aanvragen, beursstand, opvolging, leads, broadcast, assistent en agenda. <strong>Geen</strong> projecten, offertes, facturen, inkoop, prijzen, producten, panden, kozijnen of rapporten — en geen bedragen.</td></tr>
      <tr><td class="menu">Alleen lezen</td><td>Alles bekijken, niets wijzigen.</td></tr>
    </tbody>
  </table></div>
  <p>Zie je een pagina niet in het menu, dan mag je er ook niet komen via de adresbalk — dat wordt tegengehouden. Mis je iets wat je wél nodig hebt, vraag dan om een andere rol.</p>
</section>

<section id="howto">
  <h2>Zo doe je het — stap voor stap</h2>

  <div class="recipe" id="r-beurs">
    <h3>Een beursbezoeker vastleggen</h3>
    <p class="waar"><strong>Waar:</strong> Klanten → <strong>Beursstand</strong> tijdens de beurs, daarna Klanten → <strong>Beurscontacten</strong>.</p>
    <p>De standpagina is gemaakt voor één hand: links invoeren, rechts een QR-code die de bezoeker naar ons eigen formulier op de website stuurt, eronder wie er vandaag al langs is geweest.</p>
    <ol>
      <li>Vul naam, bedrijf, e-mail en plaats in. <strong>Stad en land apart</strong> — raden ging mis.</li>
      <li>Vink aan wat hij wil: stalen, prijzen, beeldmateriaal, showroombezoek. Dat bepaalt later de tekst van de opvolgmail.</li>
      <li>Vink aan of hij <em>onze panelen wil verkopen</em> (verkooppunt) of gewoon klant is. Dat is het belangrijkste onderscheid.</li>
      <li>Opslaan. De bezoeker krijgt meteen een bevestigingsmail met de films, en er wordt zo nodig een account op de website aangemaakt.</li>
    </ol>
    <p>Op <strong>Beurscontacten</strong> staat daarna iedereen bij elkaar, met een kaart waarop je ziet waar ze zitten (kleur per soort bezoeker), filters per herkomst, en een knop om dubbele invoeren in één keer op te ruimen. Dubbel aantikken levert nooit een tweede mail op.</p>
  </div>

  <div class="recipe" id="r-opvolgen">
    <h3>Een klant persoonlijk mailen</h3>
    <p class="waar"><strong>Waar:</strong> Klanten → <strong>Opvolging</strong>. Klik op een naam om het dossier te openen.</p>
    <p>Dit is de werklijst voor alles wat na een eerste contact komt. Per klant zie je de herkomst, wanneer je hem voor het laatst mailde, of hij geantwoord heeft, en wat de volgende stap is.</p>
    <ol>
      <li>Open de klant. Het systeem stelt een <strong>mailsoort</strong> voor: <em>verkooppunt</em>, <em>zakelijke klant</em> of <em>eigen mail</em>. De voorgestelde tekst is tweetalig (Spaans en Engels) en past zich aan op wat hij op de beurs aangaf.</li>
      <li>Pas de tekst aan waar je dat wilt. Bijlagen (beelden, technische datasheets) gaan automatisch mee; je ziet welke.</li>
      <li>Klik <strong>Controleren en versturen</strong>. Er opent een venster met de mail <em>precies zoals de klant hem krijgt</em>: ontvanger, onderwerp, tekst, bijlagen.</li>
      <li>Vink <em>"Ik heb ontvanger, mailtekst en afspraken gecontroleerd"</em> aan en klik <strong>Dit concept versturen</strong>. Eén knop, geen verrassingen.</li>
      <li>Is de opvolging klaar? Zet het vinkje <strong>Afvinken</strong> op de lijst. De klant verdwijnt naar <em>Afgehandeld</em> en alles blijft bewaard.</li>
    </ol>
    <p>In het dossier staat de hele mailwisseling als één tijdlijn, nieuwste bovenaan — verstuurd en ontvangen door elkaar heen, zoals een gesprek loopt.</p>
    <div class="callout">Een voorstel bewaren zonder te versturen kan altijd. Het blijft als <em>Concept</em> staan tot jij op versturen drukt.</div>
  </div>

  <div class="recipe" id="r-reactie">
    <h3>Een reactie van een klant opvolgen</h3>
    <p class="waar"><strong>Waar:</strong> Opvolging, filter <strong>Antwoord nodig</strong> — of de melding in je mail.</p>
    <p>Zodra een klant antwoordt op een mail die wij stuurden, gebeurt er drie dingen vanzelf:</p>
    <ul>
      <li>Hij komt <strong>terug op "Nog opvolgen"</strong>, ook als je hem al had afgevinkt. Een nieuw antwoord wint altijd van een vinkje.</li>
      <li>Op de lijst verschijnt een gemarkeerd blokje met <strong>datum, onderwerp en de eerste regels</strong> van zijn antwoord, zodat je zonder klikken ziet waar het over gaat.</li>
      <li>Het team krijgt een <strong>meldingsmail</strong> met wie er reageerde en waarop, met een link naar het dossier. Reageren er meerdere klanten tegelijk, dan is dat één mail met alles erin.</li>
    </ul>
    <p>Het cijfertje bij <strong>Opvolging</strong> in de zijbalk telt precies deze klanten: ze hebben geantwoord en wachten op ons.</p>
    <p>Antwoorden doe je het liefst in het CRM zelf — dan blijft het antwoord bij de klant in het dossier staan.</p>
  </div>

  <div class="recipe" id="r-verkooppunt">
    <h3>Een verkooppunt opbouwen</h3>
    <p class="waar"><strong>Waar:</strong> Klanten → <strong>Verkooppunten</strong>. De prijzen staan onder <em>Staffels &amp; marges</em>.</p>
    <p>Dit is de route van "heeft interesse" naar "verkoopt onze panelen". Het scherm werkt met tabbladen, zodat je per klant één ding tegelijk doet.</p>
    <ol>
      <li><strong>Relatie en volgende stap</strong> — interesse, fase, eigenaar en wat er moet gebeuren.</li>
      <li><strong>Presentatiepakket</strong> — de prijslijst en het materiaal dat je meestuurt. Je kunt per collectie een nette prijslijst-PDF maken in vier talen.</li>
      <li><strong>Contract, exclusiviteit en afname</strong> — gebied, looptijd en afspraken. De klant tekent online.</li>
    </ol>
    <p>De prijzen lopen in staffels: hoe meer vierkante meter per jaar, hoe hoger de korting. Het systeem bewaakt daarbij een <strong>ondergrens op onze marge</strong> — zakt een staffelprijs daaronder, dan corrigeert hij naar boven en zie je dat staan. Adviesprijzen blijven vrijblijvend; bestaande contracten veranderen niet.</p>
  </div>

  <div class="recipe" id="r-campagne">
    <h3>Een mailcampagne naar bedrijven versturen</h3>
    <p class="waar"><strong>Waar:</strong> Marketing → <strong>Leads</strong> (de lijst) en <strong>Broadcast</strong> (het versturen).</p>
    <p>Dit gaat over koude acquisitie naar bedrijven, los van je gewone contactenlijst. Prospects staan apart, zodat de contactenlijst schoon blijft.</p>
    <ol>
      <li><strong>Leads → Lijst importeren</strong>: upload een Excel of CSV. Je krijgt eerst een voorbeeld te zien — hoeveel nieuw, hoeveel dubbel, hoeveel ongeldig — en pas daarna schrijft hij weg.</li>
      <li>Loop de lijst na op <strong>Prospects</strong>: zoeken, filteren, rommel eruit.</li>
      <li>Ga naar <strong>Broadcast</strong>, stel de campagne op en verstuur. Elke mail krijgt automatisch de wettelijke voettekst en een werkende afmeldlink.</li>
      <li>Er geldt een <strong>dagcap</strong> en een <strong>noodrem</strong>: loopt het aantal bounces of klachten op, dan stopt de campagne vanzelf.</li>
      <li><strong>Broadcast → Nabellen</strong> geeft de bedrijven met een telefoonnummer, langst geleden gemaild eerst.</li>
    </ol>
    <div class="callout warn">Afmeldingen gelden over campagnes heen. Wie zich afmeldt, krijgt nooit meer iets — ook niet uit een volgende lijst.</div>
  </div>

  <div class="recipe" id="r-aanvraag">
    <h3>Een offerte maken uit een website-aanvraag</h3>
    <p class="waar"><strong>Waar:</strong> Klanten → <strong>Aanvragen</strong>.</p>
    <ol>
      <li>Open de aanvraag. Je ziet de klantgegevens, het bericht en de aangevraagde producten.</li>
      <li>Klik <strong>✓ Accepteren</strong>. Het contact wordt automatisch aangemaakt of gekoppeld.</li>
      <li>Klik <strong>+ Offerte opstellen</strong>. De offerte opent met de klant en de producten al ingevuld.</li>
      <li>Prijzen en aantallen aanvullen, marge checken, versturen. Klaar.</li>
    </ol>
    <p>Eerst iets vragen? Gebruik het blok <em>Mail de klant</em> op de aanvraag zelf.</p>
  </div>

  <div class="recipe" id="r-account">
    <h3>Een klantaccount goedkeuren</h3>
    <p class="waar"><strong>Waar:</strong> de mail "Accepteren of weigeren →", of Klanten → <strong>Website-accounts</strong>.</p>
    <p>Klanten vragen op de website een account aan om prijzen te kunnen zien.</p>
    <ol>
      <li>Klik de knop in de mail — de aanvraag staat bovenaan bij <em>Openstaande aanvragen</em>.</li>
      <li>Kies het prijsniveau: <strong>Particulier</strong> (showroomprijzen) of <strong>Aannemer</strong> (−20%). Zakelijk mét btw-nummer = meestal aannemer.</li>
      <li>Klik <strong>Accepteren</strong>. De klant krijgt een activatiemail en kiest een wachtwoord. Klaar.</li>
    </ol>
    <p>Later aanpassen kan altijd: prijsniveau wijzigen, blokkeren, of de activatiemail opnieuw sturen. Accounts voor het kozijnenplatform staan apart onder <strong>Windows-accounts</strong>.</p>
  </div>

  <div class="recipe" id="r-afspraak">
    <h3>Een afspraak maken</h3>
    <p class="waar"><strong>Waar:</strong> <strong>Agenda</strong>, of vanuit een afspraakaanvraag van de website, of vanuit een opvolgdossier.</p>
    <ol>
      <li><strong>Zelf plannen:</strong> Agenda → <em>Nieuwe afspraak</em>: titel, datum, tijd, locatie (standaard de showroom). Taken met een deadline maak je op dezelfde pagina.</li>
      <li><strong>Vanuit een aanvraag:</strong> de voorkeursdatum van de klant staat al ingevuld. Klik <em>Inplannen + klant bevestigen</em> — de klant krijgt meteen een bevestigingsmail.</li>
      <li><strong>Past het niet?</strong> Stel tot vier andere momenten voor. De klant kiest zelf via een link en de afspraak wordt automatisch ingepland.</li>
      <li><strong>Vanuit opvolging:</strong> in het dossier kun je een bevestigde afspraak direct in de agenda zetten.</li>
    </ol>
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
    <p>Twijfel je of de eenheidsprijzen nog kloppen? <strong>Calculator → Prijscontrole</strong> zet ze naast elkaar.</p>
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

  <div class="recipe" id="r-keuren">
    <h3>Een inkoopfactuur keuren</h3>
    <p class="waar"><strong>Waar:</strong> Inkoop → <strong>Facturen keuren</strong>, of de knop in de ochtendmail (werkt zonder inloggen).</p>
    <p>Facturen die op <strong>purchase@</strong> binnenkomen staan hier automatisch klaar, al uitgelezen. Zolang een factuur hier staat, telt hij nog nergens mee.</p>
    <ol>
      <li>Lees het oordeel op de kaart: <em>Compleet</em>, <em>Let op</em> of <em>Incompleet</em> — met erbij wat er ontbreekt.</li>
      <li>Controleer en verbeter zo nodig: leverancier, bedrag, <strong>soort</strong> (uren of materiaal) en <strong>project</strong>. Hoort de factuur bij geen project (energie, telefoon)? Vink <em>Algemene kosten</em> aan. Loopt hij over meerdere werven? Vink dat aan en verdeel de bedragen. Staat er geen btw op de bon, dan kun je dat aangeven in plaats van een bedrag te verzinnen.</li>
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

  <div class="recipe" id="r-product">
    <h3>Een nieuw product toevoegen</h3>
    <p class="waar"><strong>Waar:</strong> Producten → <strong>Nieuw product</strong>. Sneller: op een inkooporder de knop <em>+ Maak product</em>.</p>
    <ol>
      <li>Vul naam, collectie en eenheid in. Hoort het bij een merk, kies dat dan — het merk bepaalt het logo, de dealerkorting en de brochures.</li>
      <li>Zet de <strong>showroomprijs</strong> (ex. btw). De aannemersprijs mag leeg — dan rekent het systeem automatisch −20%.</li>
      <li>Vul de <strong>kostenopbouw</strong> in: inkoop, vracht, transport, invoerrecht. De kostprijs en de marge rollen er vanzelf uit — zo zie je meteen hoeveel korting er maximaal kan.</li>
      <li>Zet voorraad en <strong>minimumvoorraad</strong> (daaronder komt het product op de bijbestel-lijst).</li>
      <li>Klik <strong>Barcode genereren</strong> en print het label — nu is het product scanbaar.</li>
      <li>Foto uploaden en eventueel <strong>"op de website tonen"</strong> aanvinken → <em>Push naar website</em>. De tekst wordt automatisch in vier talen vertaald.</li>
    </ol>
    <p>Daarna loopt de voorraad vanzelf mee: facturen boeken af, inkooporders boeken bij. Iets kwijt zonder verkoop (breuk, showroommodel, monster)? <strong>Producten → Voorraad afboeken</strong> — met reden, datum en kostprijs van dat moment.</p>
  </div>
</section>

<section id="paginas">
  <h2>Elke pagina</h2>
  <p>Alles in het menu, in dezelfde volgorde als de zijbalk. Zie je een onderdeel niet staan, dan hoort het niet bij jouw rol — zie <a href="#rollen">Wie ziet wat</a>.</p>

  <h3>Bovenaan — elke dag</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Start</td><td>Je eigen beginscherm: wat er vandaag moet gebeuren, plus tegels naar alles. Pin vast wat je vaak gebruikt, verberg de rest.</td></tr>
      <tr><td class="menu">Assistent</td><td>Concepten, meldingen en controles die klaarstaan. Het systeem bereidt voor, jij beslist wat wordt verstuurd, aangepast of weggegooid.</td></tr>
      <tr><td class="menu">Mail-inbox</td><td>Binnengekomen mail lezen, beantwoorden, aan een klant of factuur koppelen en archiveren. Bijlagen worden automatisch bewaard.</td></tr>
      <tr><td class="menu">Agenda</td><td>Afspraken en taken van het team.</td></tr>
      <tr><td class="menu">Scannen</td><td>Barcode scannen: prijs opzoeken, voorraad bij- of afboeken, een pakbon afleveren.</td></tr>
    </tbody>
  </table></div>

  <h3>Klanten</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Contacten</td><td>Alle klanten, leveranciers en relaties — alles hangt hieraan. Per klant: gegevens, mailhistorie, offertes, facturen en notities.</td></tr>
      <tr><td class="menu">Beurscontacten</td><td>Iedereen die we op een beurs spraken, met een kaart (kleur per soort bezoeker), filters per herkomst en een knop om dubbelen op te ruimen.</td></tr>
      <tr><td class="menu">Opvolging</td><td>De werklijst na het eerste contact: mailvoorstel, gesprek, afspraak en de volgende stap per klant. Het cijfertje telt wie er geantwoord heeft.</td></tr>
      <tr><td class="menu">Verkooppunten</td><td>Van interesse naar een officiële samenwerking: contract, exclusiviteit, presentatiepakket en afname per klant.</td></tr>
      <tr><td class="menu">Aanvragen</td><td>Offerte-aanvragen via de website — bekijken, accepteren of afwijzen, en meteen omzetten naar een offerte.</td></tr>
      <tr><td class="menu">Beursstand</td><td>Bezoekers vastleggen tijdens de beurs. Eén scherm: invoeren, QR-code voor de bezoeker, en wie er vandaag al langs is geweest.</td></tr>
      <tr><td class="menu">Website-accounts</td><td>Wie mag prijzen zien op de website en tegen welk niveau. Accepteren, blokkeren, activatiemail opnieuw sturen.</td></tr>
    </tbody>
  </table></div>

  <h3>Projecten</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Projecten</td><td>Per verbouwing: begroting, uren, kosten, facturen, betalingen en resultaat.</td></tr>
      <tr><td class="menu">Ploeg</td><td>De eigen jongens en onderaannemers. Klik op een naam voor zijn uren, werven en facturen. Hier staat ook het uurtarief en de taal van zijn urenportaal.</td></tr>
      <tr><td class="menu">Panden</td><td>Vastgoed te koop: villa's, appartementen, bouwgrond en renovatieprojecten. Gepubliceerde panden staan op de website.</td></tr>
    </tbody>
  </table></div>

  <h3>Verkoop</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Offerte-calculator</td><td>Maten van de woning in → complete verbouwingsofferte uit. Stel het werk samen, controleer de opbouw, maak een conceptofferte. Onder <em>Prijscontrole</em> zie je of de eenheidsprijzen nog kloppen.</td></tr>
      <tr><td class="menu">Offertes</td><td>Alle uitgebrachte offertes, gemaakt in het CRM of gesynct vanuit Holded.</td></tr>
      <tr><td class="menu">Voorschotten</td><td>Proforma's en provisiones de fondos. Betaalde voorschotten verrekenen automatisch op de eindfactuur.</td></tr>
      <tr><td class="menu">Facturen</td><td>Verkoopfacturen en creditnota's, uit het CRM of uit Holded. Herinneringen stuur je hiervandaan.</td></tr>
      <tr><td class="menu">Commissies</td><td>Aanbreng-relaties: wie bracht wie, en wat verdient de aanbrenger. Loopt vanzelf mee met de facturen.</td></tr>
      <tr><td class="menu">Prijslijst</td><td>Nette prijslijst-PDF's maken of mailen per collectie of categorie, in vier talen.</td></tr>
      <tr><td class="menu">Prijzenboek</td><td>De eenheidsprijzen waar de calculator mee rekent. Alles ex. btw; de marge zit al in de prijs.</td></tr>
    </tbody>
  </table></div>

  <h3>Producten</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Producten</td><td>De artikelcatalogus: voorraad, prijzen, marges, barcodes, foto's en wat er op de website staat. Hier zit ook <em>Voorraad afboeken</em>.</td></tr>
      <tr><td class="menu">Merken</td><td>Logo, dealerkorting en brochures per merk. De productimport gebruikt deze gegevens.</td></tr>
      <tr><td class="menu">Samples</td><td>Staaltjes de deur uit, € 5 borg per stuk — uitgifte en retour.</td></tr>
      <tr><td class="menu">Samplecatalogus</td><td>Welke kleuren en maten bestaan er bij de leverancier. Referentie, telt niet mee in de voorraad. Onder <em>Beheer</em> en <em>Koppelen</em> onderhoud je collecties en koppel je ze aan eigen producten.</td></tr>
      <tr><td class="menu">Catalogi</td><td>PDF-brochures van leveranciers, om snel met een klant te delen.</td></tr>
    </tbody>
  </table></div>

  <h3>Inkoop &amp; logistiek</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Bestellen</td><td>Bestelbonnen samenstellen voor producten en catalogus-samples. De regels worden automatisch per leverancier gegroepeerd. Onder <em>Bijbestellen</em> staat alles wat onder de voorraaddrempel zit.</td></tr>
      <tr><td class="menu">Inkooporders</td><td>Alle inkoop: bestellingen en gekeurde facturen, gekoppeld aan projecten.</td></tr>
      <tr><td class="menu">Facturen keuren</td><td>De wachtrij met binnengekomen inkoopfacturen. Elke dag leegwerken.</td></tr>
      <tr><td class="menu">Leveranciers</td><td>Per leverancier: wat we hebben ingekocht en waar het op geboekt is.</td></tr>
      <tr><td class="menu">Shipments</td><td>Per container: is de papierwinkel compleet en wat kost de import extra.</td></tr>
      <tr><td class="menu">Pakbonnen</td><td>Leverbonnen (albaranes): wat er geleverd is naar een klant of project. Maken, printen, mailen.</td></tr>
      <tr><td class="menu">Leveringen</td><td>Geplande en uitgevoerde leveringen, ophalingen en montages.</td></tr>
    </tbody>
  </table></div>

  <h3>Kozijnen</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Kozijnen</td><td>Offertes, orders en betalingen van Habitat One Windows — een eigen platform naast de rest.</td></tr>
      <tr><td class="menu">Windows-accounts</td><td>Klanttoegang voor dat platform, los van de website-accounts.</td></tr>
    </tbody>
  </table></div>

  <h3>Marketing</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Leads</td><td>Bedrijven vinden en de prospectlijst schoonhouden. Hier importeer je lijsten (Excel of CSV) en beheer je <em>Prospects</em>. Versturen gebeurt bij Broadcast.</td></tr>
      <tr><td class="menu">Broadcast</td><td>E-mailcampagnes naar bedrijven: met dagcap, afmeldlink en noodrem. Onder <em>Nabellen</em> staan de bedrijven met telefoonnummer, langst geleden gemaild eerst.</td></tr>
      <tr><td class="menu">Campagnes</td><td>Meta-campagnes (Facebook en Instagram) beheren.</td></tr>
      <tr><td class="menu">Creatives</td><td>Advertentiebeelden maken, los of als carrousel.</td></tr>
      <tr><td class="menu">Beeldbibliotheek</td><td>Foto's en video's die je in campagnes gebruikt.</td></tr>
      <tr><td class="menu">Wat werkt</td><td>Welke advertenties presteren en welke niet.</td></tr>
      <tr><td class="menu">Concurrenten</td><td>Wat de concurrentie adverteert.</td></tr>
    </tbody>
  </table></div>

  <h3>Cijfers</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Dashboard</td><td>Overzicht van de pijplijn, facturen en activiteit.</td></tr>
      <tr><td class="menu">Rapporten</td><td>Omzet en marge over de laatste twaalf maanden, alles ex. btw. Hieronder vallen ook <em>BTW-overzicht</em> (vóór de aangifte), <em>Data-gezondheid</em> (klopt alles met elkaar) en <em>Inkoop-aandacht</em> (producten met een te krappe marge).</td></tr>
      <tr><td class="menu">Analytics</td><td>Websitebezoek en gedrag, uit Google Analytics.</td></tr>
      <tr><td class="menu">SEO</td><td>Vindbaarheid van de website, uit Google Search Console.</td></tr>
      <tr><td class="menu">Bedrijfsprofiel</td><td>Het Google Business Profile: hoe we in Maps en in de zoekresultaten staan.</td></tr>
      <tr><td class="menu">Archief</td><td>Alle bewaarde documenten en mailbijlagen.</td></tr>
      <tr><td class="menu">Logboek</td><td>Wie deed wat: goedkeuringen, verstuurde post, voorraadmutaties en instellingen.</td></tr>
    </tbody>
  </table></div>

  <h3>Niet in het menu, wel bereikbaar</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Pagina</th><th>Wat je er doet</th></tr></thead>
    <tbody>
      <tr><td class="menu">Zoeken</td><td>Alles tegelijk doorzoeken. Minimaal twee tekens.</td></tr>
      <tr><td class="menu">Instellingen</td><td>Medewerkers en rollen, je eigen account en wachtwoord, de Holded-koppeling en de klanttoegang.</td></tr>
      <tr><td class="menu">Handboek</td><td>Deze pagina. De link mag je delen; de inhoud is alleen zichtbaar als je ingelogd bent.</td></tr>
      <tr><td class="menu">Staffels &amp; marges</td><td>De prijzen voor verkooppunten, met de bewaakte ondergrens op onze marge. Te vinden via Verkooppunten.</td></tr>
      <tr><td class="menu">Draairichtingen</td><td>Per factuur de deuren over de draairichtingen S1–S4 verdelen.</td></tr>
    </tbody>
  </table></div>
</section>

<section id="mail">
  <h2>Mail: wie leest mee</h2>
  <p>Er zijn drie postvakken en één regel: klantcontact leest het team mee, kantoorwerk niet.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Postvak</th><th>Waarvoor</th><th>Wie ziet het</th></tr></thead>
    <tbody>
      <tr><td class="menu">hi@</td><td>Alle gewone klantmail. Hier gaat ook alles vandaan wat je vanuit het CRM verstuurt.</td><td>Het hele team, in de Mail-inbox.</td></tr>
      <tr><td class="menu">purchase@</td><td>Inkoopfacturen van leveranciers.</td><td>Het hele team; facturen gaan automatisch naar de keuren-wachtrij.</td></tr>
      <tr><td class="menu">Marketingpostvak</td><td>Het eigen klantcontact van de e-mailmarketing.</td><td>Alleen die persoon zelf. De rest van het team ziet die mail niet, ook niet in de tellers.</td></tr>
    </tbody>
  </table></div>
  <p>Bij een persoonlijke klantmail staan Nick, Frederique, Mourad en Teresa zichtbaar in de <strong>CC</strong> — plus degene die op versturen drukte, ook als die niet in dat rijtje staat. Antwoordt de klant met "allen beantwoorden", dan komt dat antwoord dus rechtstreeks bij de afzender binnen en niet alleen in het gedeelde postvak.</p>
  <p>Interne controlemails (de dagelijkse datacheck, de weekcontrole) gaan bewust <em>niet</em> naar die bredere kring: dat is kantoorwerk, geen klantcontact.</p>
  <div class="callout">Mails met een <strong>persoonlijke inloglink</strong> — zoals de ochtendmail om facturen te keuren — krijgen geen kopie naar het gedeelde postvak. Anders kon een collega met jouw link inloggen en stond zijn goedkeuring op jouw naam.</div>
</section>

<section id="automatisch">
  <h2>Wat gaat er vanzelf?</h2>
  <p>Dit doet het systeem zonder dat iemand iets hoeft te doen:</p>
  <ul>
    <li><strong>Elk kwartier:</strong> mail ophalen, bijlagen archiveren, inkoopfacturen uitlezen en in de keuren-wachtrij zetten.</li>
    <li><strong>Elk kwartier:</strong> antwoordt een klant op een mail die wij stuurden, dan komt hij terug op "Nog opvolgen" en krijgt het team één melding met wie er reageerde en waarop.</li>
    <li><strong>Elke nacht:</strong> betaalstatussen uit Holded halen, vervallen facturen markeren, en een controle-mail sturen als er iets niet klopt.</li>
    <li><strong>Elke ochtend:</strong> de inkoop-ochtendmail (wat wacht op goedkeuring) en een herinnering aan klanten die morgen een levering krijgen.</li>
    <li><strong>Elke maandag:</strong> de weekcontrole-mail — komt óók als alles in orde is.</li>
    <li><strong>Bij het versturen van een factuur:</strong> voorraad afboeken, naar Holded pushen, commissies bijwerken.</li>
    <li><strong>Bij ondertekening van een offerte:</strong> het project inrichten met aanneemsom, begroting en termijnfacturen.</li>
    <li><strong>Bij een nieuwe beursbezoeker:</strong> bevestigingsmail met de films, en zo nodig een account op de website.</li>
    <li><strong>±3 weken na een levering:</strong> een Google-reviewverzoek (als dat aanstaat).</li>
  </ul>
</section>

<section id="talen">
  <h2>Talen</h2>
  <p>Het CRM zelf kun je in het Nederlands, Engels of Spaans zetten; de keuze staat bij je account. De vertaling is nog niet overal doorgevoerd — schermen die nog niet vertaald zijn, blijven Nederlands.</p>
  <p>Los daarvan staat de <strong>taal van de klant</strong>. Die zet je op het contact, en hij bepaalt alle mails en documenten die naar hem toe gaan. Product- en website-teksten worden automatisch in vier talen vertaald. De opvolgmails naar beurscontacten zijn standaard tweetalig: Spaans en Engels onder elkaar.</p>
</section>

<section id="weten">
  <h2>Goed om te weten</h2>
  <ul>
    <li><strong>Betaald of niet?</strong> Dat bepaalt Holded. In het CRM kijk je alleen; de boekhouder registreert daar.</li>
    <li><strong>Een voorschot is geen factuur.</strong> Geen btw, buiten Holded, en eerst langs de boekhouder.</li>
    <li><strong>Getekende offertes staan op slot.</strong> Bewerken kan alleen na ontgrendelen mét reden — en het getekende exemplaar blijft altijd bewaard.</li>
    <li><strong>Prijzen:</strong> aannemers −20%, verkooppunten volgens de staffel (meer afname, meer korting), en de marge op een product is meteen de maximale korting zonder verlies.</li>
    <li><strong>Projectnorm:</strong> minimaal 15% marge. Het kostenplafond is 85% van de aanneemsom.</li>
    <li><strong>Klant-links verlopen:</strong> offerte 45 dagen, inloglink 30 dagen, keuren-link 2 weken.</li>
    <li><strong>Meerwerk</strong> altijd boeken mét het vinkje "akkoord van de klant" — anders piept de weekcontrole.</li>
    <li><strong>Afvinken is niet definitief.</strong> Een afgevinkte opvolging komt vanzelf terug zodra de klant weer iets stuurt, of zodra de opvolgdatum verstrijkt.</li>
    <li><strong>Dubbel kan niet:</strong> het systeem herkent dubbele facturen, dubbele voorraad-afboekingen, dubbele uren en dubbele beursinvoer, en houdt ze tegen.</li>
  </ul>

  <footer class="slot">
    Bijgewerkt op 4 oktober 2026 naar de actuele stand van het systeem. Verandert er iets wezenlijks, laat het handboek dan bijwerken — de link blijft dezelfde.
  </footer>
</section>
</main>
</div>
</div>
`;
