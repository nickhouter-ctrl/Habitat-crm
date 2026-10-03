/**
 * De beursmail met de presentatie- en verpakkingsconcepten.
 *
 * Hans heeft deze op 2 oktober als proef naar Nick, Hans en Teresa gestuurd
 * ("[PRUEBA / PREVIEW v2]"); het pakket lag klaar met `bulkStatus:
 * awaiting-team-review`. Dit is diezelfde mail, woord voor woord, klaar om naar
 * alle beurscontacten te gaan.
 *
 * Twee dingen zijn hier anders dan in de proef: de aanhef is een invulplek — de
 * proef zei letterlijk "Hola [nombre / name]" — en de vijf beelden zitten als
 * `cid`-bijlagen in de mail zelf, zodat ze in beeld staan zonder dat iemand op
 * "afbeeldingen tonen" hoeft te klikken.
 *
 * De tekst staat bewust hier en niet in een los bestand: hij moet precies zo
 * blijven als wat het team heeft goedgekeurd, en zo is elke wijziging zichtbaar
 * in de geschiedenis.
 *
 * Op 3 oktober 2026 is hij eenmalig naar alle 173 beurscontacten gegaan. Er is
 * bewust geen knop in het CRM: dit was een eenmalige ronde, en wat eruit is
 * staat in de mailhistorie van elke klant. Moet er iemand alsnog een exemplaar
 * krijgen, dan kan dat met deze tekst en `showroomBijlagen()`.
 */

/** Onderwerp zonder de PRUEBA-markering van de proefzending. */
export const SHOWROOM_ONDERWERP = 'Gracias por visitar nuestro stand en Valencia / Thank you for visiting our stand in Valencia';

/** De vijf conceptbeelden; de bestanden staan in public/mail/beursmail/. */
export const SHOWROOM_BEELDEN = [
  { filename: "01-Compact-Material-Display.jpg", cid: "habitat-fair-inline-v2-1@habitat-one.com" },
  { filename: "02-Compact-Showroom-Concept.jpg", cid: "habitat-fair-inline-v2-2@habitat-one.com" },
  { filename: "03-Large-Showroom-Concept.jpg", cid: "habitat-fair-inline-v2-3@habitat-one.com" },
  { filename: "04-Box-Packaging-Concept.jpg", cid: "habitat-fair-inline-v2-4@habitat-one.com" },
  { filename: "05-Transport-Crate-Concept.jpg", cid: "habitat-fair-inline-v2-5@habitat-one.com" },
]  as const;

const HTML = `<div style="margin:0;padding:32px 12px;background:#f3efe9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#2a2520">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8dfd0">
    <div style="height:4px;background:#b6552d"></div>
    <div style="padding:24px 28px 18px">
      <img src="https://www.habitat-one.com/logo-habitat.png" height="40" alt="Habitat One" style="display:block;height:40px;width:auto;border:0" />
    </div>
    <div style="height:1px;background:#e8dfd0;margin:0 28px"></div>
    <div style="padding:24px 28px 20px">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">ESPAÑOL</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Hola {{naam}}:</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Muchas gracias por visitar nuestro stand durante Feria Hábitat Valencia.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">¡Ha sido una feria magnífica, con una acogida muy entusiasta de nuestros materiales de piedra flexible!</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Nos gustaría dar continuidad a nuestra conversación en Valencia y concretar las posibilidades de colaboración. Por eso, compartimos algunas ideas que no pudimos comentar en detalle durante la feria.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Las imágenes que aparecen a continuación muestran cómo queremos apoyar a nuestros colaboradores, desde la presentación del material hasta la entrega:</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>Para arquitectos:</strong> un expositor compacto de materiales. Para tener la colección a mano, combinar acabados y permitir que sus clientes vean y toquen los colores y las texturas.<br/><img src="cid:habitat-fair-inline-v2-1@habitat-one.com" alt="Expositor compacto de materiales" width="360" style="display:block;width:100%;max-width:360px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Expositor compacto de materiales</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>Para puntos de venta:</strong> una presentación adaptada a su espacio. Desde un expositor compacto hasta una instalación de showroom más amplia con cajones, para presentar la colección de forma organizada y atractiva.<br/><img src="cid:habitat-fair-inline-v2-2@habitat-one.com" alt="Showroom compacto" width="544" style="display:block;width:100%;max-width:544px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Showroom compacto</span><img src="cid:habitat-fair-inline-v2-3@habitat-one.com" alt="Showroom ampliado con cajones" width="544" style="display:block;width:100%;max-width:544px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Showroom ampliado con cajones</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>Para pedidos pequeños:</strong> cajas prácticas. Como punto de venta, podrá adquirirnos estas cajas para entregar pequeñas cantidades de paneles a sus clientes de forma cuidada.<br/><img src="cid:habitat-fair-inline-v2-4@habitat-one.com" alt="Concepto de embalaje en caja" width="400" style="display:block;width:100%;max-width:400px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Concepto de embalaje en caja</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>Para empresas constructoras y proyectos de mayor envergadura:</strong> entrega en cajas de madera. Una solución de embalaje y transporte para mayores cantidades de paneles y el revestimiento de grandes superficies.<br/><img src="cid:habitat-fair-inline-v2-5@habitat-one.com" alt="Concepto de embalaje en caja de madera" width="544" style="display:block;width:100%;max-width:544px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Concepto de embalaje en caja de madera</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Las imágenes ofrecen una primera impresión. Nos gustaría definir la solución final junto con usted, teniendo en cuenta su empresa, el espacio disponible y sus proyectos.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Queremos pasar del entusiasmo de Valencia a los primeros pasos concretos juntos. Ya sea un expositor de materiales para su estudio de arquitectura, la presentación de la colección en su punto de venta o su aplicación en un proyecto de construcción, nos encantará concretar con usted lo que necesita.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Por ello, nos gustaría organizar una reunión de seguimiento o una visita a nuestro Experience Center en Jávea. Podremos hablar de la colección, la presentación, la entrega y las condiciones de colaboración, para preparar una propuesta adecuada y acordar los siguientes pasos.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Indíquenos qué día y hora le vienen bien. ¿Tiene ya un proyecto concreto o un espacio para presentar la colección? Nos ayudará saberlo para preparar nuestra reunión.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Gracias de nuevo por la agradable conversación y su entusiasmo en Valencia. ¡Esperamos empezar a trabajar juntos pronto!</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Un cordial saludo,</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Hans<br/>Habitat One<br/>Touch. Feel. Experience.<br/>+31 6 51170545 · https://www.habitat-one.com</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">──────── ENGLISH ────────</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Dear {{naam}},</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Thank you very much for visiting our stand during Feria Hábitat Valencia.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">It was a wonderful fair, with such an enthusiastic response to our flexible stone materials!</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">We would love to build on our conversation in Valencia and take the next steps towards working together. To get started, we are sharing a few ideas that we did not have the chance to discuss in detail at the fair.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">The concept images below show how we would like to support our partners, from material presentation to delivery:</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>For architects:</strong> a compact material display. Keep the collection close at hand, explore combinations, and let your clients see and feel the colours and textures for themselves.<br/><img src="cid:habitat-fair-inline-v2-1@habitat-one.com" alt="Compact material display" width="360" style="display:block;width:100%;max-width:360px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Compact material display</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>For retail partners:</strong> a presentation that fits your space. From a compact display to a larger showroom installation with drawers, helping you present the collection clearly and attractively.<br/><img src="cid:habitat-fair-inline-v2-2@habitat-one.com" alt="Compact showroom" width="544" style="display:block;width:100%;max-width:544px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Compact showroom</span><img src="cid:habitat-fair-inline-v2-3@habitat-one.com" alt="Larger showroom with drawers" width="544" style="display:block;width:100%;max-width:544px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Larger showroom with drawers</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>For smaller orders:</strong> practical box packaging. As a retail partner, you will be able to purchase these boxes from us to deliver smaller quantities of sheets neatly to your customers.<br/><img src="cid:habitat-fair-inline-v2-4@habitat-one.com" alt="Box packaging concept" width="400" style="display:block;width:100%;max-width:400px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Box packaging concept</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520"><strong>For construction companies and larger projects:</strong> delivery in wooden crates. A packaging and transport solution for larger quantities of panels and projects covering larger surfaces.<br/><img src="cid:habitat-fair-inline-v2-5@habitat-one.com" alt="Transport crate concept" width="544" style="display:block;width:100%;max-width:544px;height:auto;margin:18px auto 8px;border:0;border-radius:6px"/><span style="display:block;text-align:center;font-size:12px;line-height:1.5;color:#7a6f63;margin-bottom:10px">Transport crate concept</span></p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">These images provide an initial impression. We would be pleased to agree on the final solution with you, taking your business, available space and projects into account.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">We would love to turn the enthusiasm in Valencia into our first concrete steps together. Whether you need a material display for your architecture studio, a presentation for your retail space or materials for a construction project, we would be happy to work through what you need.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">We would therefore like to arrange a follow-up meeting or a visit to our Experience Center in Jávea. We can discuss the collection, presentation, delivery and partnership terms, then prepare a suitable proposal and agree on clear next steps.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Please let us know a day and time that suit you. Do you already have a specific project or a location for presenting the collection in mind? Sharing those details will help us prepare for our meeting.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Thank you again for the lovely conversation and your enthusiasm in Valencia. We look forward to working together!</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Kind regards,</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2a2520">Hans<br/>Habitat One<br/>Touch. Feel. Experience.<br/>+31 6 51170545 · https://www.habitat-one.com</p>
    </div>
    <div style="background:#f3efe9;padding:18px 28px;border-top:1px solid #e8dfd0;font-size:12px;line-height:1.7;color:#7a6f63">
      <span style="display:block;font-weight:700;color:#3a2a20">Habitat One &amp; One SL</span>
      Camí de la Fontana 3, Locales 2, 3 en 5, 03730 Jávea (Alicante), España<br/>
      +31 6 51170545 · <a href="mailto:hi@habitat-one.com" style="color:#7a6f63;text-decoration:none">hi@habitat-one.com</a> · habitat-one.com · NIF ESB24855603
    </div>
  </div>
</div>`;

const TEKST = `ESPAÑOL

Hola {{naam}}:

Muchas gracias por visitar nuestro stand durante Feria Hábitat Valencia.

¡Ha sido una feria magnífica, con una acogida muy entusiasta de nuestros materiales de piedra flexible!

Nos gustaría dar continuidad a nuestra conversación en Valencia y concretar las posibilidades de colaboración. Por eso, compartimos algunas ideas que no pudimos comentar en detalle durante la feria.

Las imágenes que aparecen a continuación muestran cómo queremos apoyar a nuestros colaboradores, desde la presentación del material hasta la entrega:

Para arquitectos: un expositor compacto de materiales. Para tener la colección a mano, combinar acabados y permitir que sus clientes vean y toquen los colores y las texturas.
(Imagen 01: expositor compacto)

Para puntos de venta: una presentación adaptada a su espacio. Desde un expositor compacto hasta una instalación de showroom más amplia con cajones, para presentar la colección de forma organizada y atractiva.
(Imágenes 02 y 03: conceptos de showroom)

Para pedidos pequeños: cajas prácticas. Como punto de venta, podrá adquirirnos estas cajas para entregar pequeñas cantidades de paneles a sus clientes de forma cuidada.
(Imagen 04: concepto de embalaje en caja)

Para empresas constructoras y proyectos de mayor envergadura: entrega en cajas de madera. Una solución de embalaje y transporte para mayores cantidades de paneles y el revestimiento de grandes superficies.
(Imagen 05: concepto de embalaje en caja de madera)

Las imágenes ofrecen una primera impresión. Nos gustaría definir la solución final junto con usted, teniendo en cuenta su empresa, el espacio disponible y sus proyectos.

Queremos pasar del entusiasmo de Valencia a los primeros pasos concretos juntos. Ya sea un expositor de materiales para su estudio de arquitectura, la presentación de la colección en su punto de venta o su aplicación en un proyecto de construcción, nos encantará concretar con usted lo que necesita.

Por ello, nos gustaría organizar una reunión de seguimiento o una visita a nuestro Experience Center en Jávea. Podremos hablar de la colección, la presentación, la entrega y las condiciones de colaboración, para preparar una propuesta adecuada y acordar los siguientes pasos.

Indíquenos qué día y hora le vienen bien. ¿Tiene ya un proyecto concreto o un espacio para presentar la colección? Nos ayudará saberlo para preparar nuestra reunión.

Gracias de nuevo por la agradable conversación y su entusiasmo en Valencia. ¡Esperamos empezar a trabajar juntos pronto!

Un cordial saludo,

Hans
Habitat One
Touch. Feel. Experience.
+31 6 51170545 · https://www.habitat-one.com

──────── ENGLISH ────────

Dear {{naam}},

Thank you very much for visiting our stand during Feria Hábitat Valencia.

It was a wonderful fair, with such an enthusiastic response to our flexible stone materials!

We would love to build on our conversation in Valencia and take the next steps towards working together. To get started, we are sharing a few ideas that we did not have the chance to discuss in detail at the fair.

The concept images below show how we would like to support our partners, from material presentation to delivery:

For architects: a compact material display. Keep the collection close at hand, explore combinations, and let your clients see and feel the colours and textures for themselves.
(Image 01: compact material display)

For retail partners: a presentation that fits your space. From a compact display to a larger showroom installation with drawers, helping you present the collection clearly and attractively.
(Images 02 and 03: showroom concepts)

For smaller orders: practical box packaging. As a retail partner, you will be able to purchase these boxes from us to deliver smaller quantities of sheets neatly to your customers.
(Image 04: box packaging concept)

For construction companies and larger projects: delivery in wooden crates. A packaging and transport solution for larger quantities of panels and projects covering larger surfaces.
(Image 05: transport crate concept)

These images provide an initial impression. We would be pleased to agree on the final solution with you, taking your business, available space and projects into account.

We would love to turn the enthusiasm in Valencia into our first concrete steps together. Whether you need a material display for your architecture studio, a presentation for your retail space or materials for a construction project, we would be happy to work through what you need.

We would therefore like to arrange a follow-up meeting or a visit to our Experience Center in Jávea. We can discuss the collection, presentation, delivery and partnership terms, then prepare a suitable proposal and agree on clear next steps.

Please let us know a day and time that suit you. Do you already have a specific project or a location for presenting the collection in mind? Sharing those details will help us prepare for our meeting.

Thank you again for the lovely conversation and your enthusiasm in Valencia. We look forward to working together!

Kind regards,

Hans
Habitat One
Touch. Feel. Experience.
+31 6 51170545 · https://www.habitat-one.com`;

/**
 * Woorden die geen naam zijn: zo heet niemand, dus daar spreek je niemand mee
 * aan. Komen uit het invoerscherm als er geen naam bekend was.
 */
const GEEN_NAAM = new Set(["beursbezoeker", "bezoeker", "visitor", "visita", "klant", "cliente", "test", "prueba"]);

/**
 * De naam waarmee we iemand aanspreken.
 *
 * Op een beursvloer wordt getypt zoals het uitkomt: "paula calado", "MIRIAM
 * NAVARRO", "V. Manuel Cuenca de Tena", of helemaal niets. Een mail die begint
 * met "Hola paula:" of "Hola V.:" leest als automatisch verstuurd, en dat is
 * precies wat deze mail niet moet zijn.
 *
 * Dus: initialen overslaan, hoofdletters normaliseren, en een ingevuld
 * verzamelwoord als "Beursbezoeker" behandelen als géén naam.
 */
export function aanhefNaam(naam: string | null | undefined): string {
  const woorden = (naam ?? "").trim().split(/\s+/).filter(Boolean);
  // "V. Manuel" → Manuel: een initiaal is geen aanspreeknaam.
  const eerste = woorden.find((w) => w.replace(/[^\p{L}]/gu, "").length >= 2);
  if (!eerste) return "";
  const schoon = eerste.replace(/[^\p{L}'’-]/gu, "");
  if (!schoon || GEEN_NAAM.has(schoon.toLowerCase())) return "";
  // Alleen bijsturen waar het mis is: "paula" en "MIRIAM" wél, "JesoBruno" en
  // "AJ" niet — die zijn met opzet zo geschreven.
  const heeftKlein = /\p{Ll}/u.test(schoon);
  const heeftGroot = /\p{Lu}/u.test(schoon);
  if (heeftKlein && heeftGroot) return schoon;
  if (schoon.length <= 3 && !heeftKlein) return schoon; // initialen als "AJ"
  return schoon[0].toUpperCase() + schoon.slice(1).toLowerCase();
}

/**
 * De aanhef invullen. Zonder bruikbare naam vervalt hij netjes naar "Hola:" en
 * "Hello," — een mail die met "Hola :" of "Dear ," begint ziet eruit alsof er
 * iets kapot is, en dat is precies de indruk die je niet wilt maken bij iemand
 * die je één keer op een beurs sprak.
 */
function metNaam(sjabloon: string, naam: string): string {
  const voornaam = aanhefNaam(naam);
  if (voornaam) return sjabloon.replaceAll("{{naam}}", voornaam);
  return sjabloon.replaceAll("Hola {{naam}}:", "Hola:").replaceAll("Dear {{naam}},", "Hello,");
}

export function showroomMailHtml(naam: string): string {
  return metNaam(HTML, naam);
}

export function showroomMailTekst(naam: string): string {
  return metNaam(TEKST, naam);
}
