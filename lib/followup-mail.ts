export const FOLLOWUP_MAILS = {
  professional: 'Architecten, bouwbedrijven & andere zakelijke klanten',
  reseller: 'Verkooppunten — winkel of showroom',
  custom: 'Eigen mail / AI-concept',
} as const;
export type FollowupMailKind = keyof typeof FOLLOWUP_MAILS;
export const CUSTOM_STONE_SOURCE = 'crm:flexible-stone-custom-v1';

const SOURCES = {
  professional: 'crm:professional-display-v1',
  reseller: 'crm:reseller-display-v1',
  custom: 'crm',
} as const;

export function followupMailSource(kind: FollowupMailKind): string { return SOURCES[kind]; }
export function followupMailKind(source: string | null | undefined): FollowupMailKind {
  if (source === SOURCES.professional) return 'professional';
  if (source === SOURCES.reseller) return 'reseller';
  return 'custom';
}

/** Interesse staat los van beroep. Een expliciete afwijzing gaat vóór oude importtags. */
export function hasResellerInterest(
  contact: { type?: string; tags?: string[] | null },
  profile?: { interest: string; active?: boolean } | null,
): boolean {
  if (profile?.interest === 'not_interested') return false;
  return !!profile?.active || profile?.interest === 'interested' || profile?.interest === 'candidate'
    || contact.type === 'reseller' || !!contact.tags?.includes('rol:wederverkoper');
}

export function recommendedFollowupMail(
  contact: { type?: string; tags?: string[] | null },
  profile?: { interest: string; active?: boolean } | null,
): FollowupMailKind {
  if (hasResellerInterest(contact, profile)) return 'reseller';
  if (contact.type === 'supplier' || contact.tags?.includes('rol:particulier')) return 'custom';
  return 'professional';
}

/** Alleen een expliciet vastgelegde gespreksdatum; nooit de registratiedatum. */
export function confirmedFairDate(tags: string[] | null): string {
  const dates = [...new Set((tags ?? []).filter(t => /^beurs:gesproken:\d{4}-\d{2}-\d{2}$/.test(t)).map(t => t.slice('beurs:gesproken:'.length)))];
  if (dates.length !== 1) return '';
  const date = dates[0];
  return !isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : '';
}

export const FOLLOWUP_DESIGNS = {
  professional: [{ filename: 'habitat-one-compact-display-v1.jpg', label: 'Compact presentatieconcept', width: 1024, height: 1536 }],
  reseller: [
    { filename: 'habitat-one-showroom-compact-v1.jpg', label: 'Compact showroomconcept', width: 1448, height: 1086 },
    { filename: 'habitat-one-showroom-large-v1.jpg', label: 'Uitgebreid showroomconcept', width: 1774, height: 887 },
  ],
  custom: [],
} as const;
export function followupDesigns(kind: FollowupMailKind) { return FOLLOWUP_DESIGNS[kind]; }
export function followupDesignUrl(filename: string) { return `/mail/followup/${filename}`; }

export type FollowupMailContext = { name: string; isFair: boolean; meetingDate: string; company?: string | null; interests?: string[] };

export function followupProposal(kind: Exclude<FollowupMailKind, 'custom'>, context: FollowupMailContext) {
  const name = context.name.trim() || 'there';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(context.meetingDate) ? new Date(`${context.meetingDate}T12:00:00Z`) : null;
  const validDate = date && !isNaN(+date) && date.toISOString().slice(0, 10) === context.meetingDate;
  const esDate = validDate ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const enDate = validDate ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const introEs = context.isFair
    ? `Fue un placer recibiros en nuestro stand de Habitat One en Feria Hábitat${esDate ? ` el ${esDate}` : ''}. ¡Muchas gracias por vuestro interés y entusiasmo!`
    : '¡Muchas gracias por vuestro interés en los paneles Flexible Stone de Habitat One! Nos gustaría comentar cómo podemos colaborar.';
  const introEn = context.isFair
    ? `It was a pleasure to welcome you to our Habitat One stand at Feria Hábitat${enDate ? ` on ${enDate}` : ''}. Thank you for your interest and enthusiasm!`
    : 'Thank you for your interest in Habitat One’s Flexible Stone panels. We’d love to explore how we can work together.';
  const proposalEs = 'Nos gustaría preparar una propuesta que creemos que se adapta mejor a vuestro negocio.';
  const proposalEn = 'We’d be happy to prepare a proposal that we believe best suits your business.';
  const interests={stalen:{es:'muestras',en:'samples'},prijzen:{es:'precios',en:'pricing'},content:{es:'imágenes y documentación',en:'images and product information'},showroom:{es:'una visita a nuestro showroom en Jávea',en:'a visit to our showroom in Jávea'}};
  const selected=Object.entries(interests).filter(([key])=>context.interests?.includes(key)).map(([,value])=>value);
  const interestEs=selected.length?`\n\nNos habéis indicado vuestro interés en ${selected.map(i=>i.es).join(', ')}. Nos gustaría comentar qué necesitáis y cómo podemos ayudaros.`:'';
  const interestEn=selected.length?`\n\nYou expressed an interest in ${selected.map(i=>i.en).join(', ')}. We’d love to discuss what you need and how we can help.`:'';
  const link = 'https://www.habitat-one.com/beurs/films';
  const signature = 'Hans\nHabitat One\nTouch. Feel. Experience.';
  const es = kind === 'professional' ? `Hola ${name}:\n\n${introEs}\n\nNos gustaría dar el siguiente paso con vosotros. Hemos diseñado un expositor compacto para profesionales, con muestras para ver y tocar y una pantalla que muestra cómo se trabaja con nuestros paneles Flexible Stone. Encontraréis el diseño conceptual adjunto.\n\nPorque una foto está bien, pero tocar y doblar el material suele provocar la misma reacción: «Un momento… ¿esto es realmente piedra?» 😉\n\nNos encantaría comentar cómo adaptar el expositor con las muestras, los vídeos y la información de producto más adecuados para vuestro equipo y vuestros proyectos. Así podréis presentar nuestros materiales a vuestros clientes y ayudarles a descubrir todas sus posibilidades.\n\n¿Os interesa la idea? Responded a este correo y le damos forma juntos.`
    : `Hola ${name}:\n\n${introEs}\n\nNos gustaría dar el siguiente paso con vosotros. Hemos diseñado una propuesta de exposición para puntos de venta, con paneles, muestras y espacio para una pequeña colección de producto. Encontraréis los diseños conceptuales adjuntos.\n\nVuestros clientes podrán ver, tocar y doblar el material, y probablemente se preguntarán: «Un momento… ¿esto es realmente piedra?» 😉\n\nNuestra propuesta es invertir juntos en una colaboración duradera. Vosotros asumiríais inicialmente el coste del expositor, los materiales de presentación y la entrega. La inversión de presentación que acordemos se descontará de futuros pedidos de producto. Definiremos juntos el importe y cómo se realizará esa compensación.\n\nPara empezar, os proponemos una selección de productos que compraríais directamente a Habitat One para vuestra tienda o showroom. Acordaremos juntos el surtido, las cantidades y las condiciones de compra, y podremos ampliar la colección a medida que crezca la demanda.\n\nNos encantaría comentar cómo adaptar la exposición y la colección a vuestro negocio y construir una colaboración fructífera a largo plazo.\n\n¿Os interesa la idea? Responded a este correo y estudiamos juntos las posibilidades.`;
  const en = kind === 'professional' ? `Hi ${name},\n\n${introEn}\n\nWe’d love to take the next step with you. We’ve designed a compact inspiration display for professionals, with samples to see and touch and a screen showing how our Flexible Stone panels can be used. You’ll find the concept design attached.\n\nBecause a photo is great, but touching and bending the material usually gets the same reaction: “Wait a minute… is this really stone?” 😉\n\nWe’d love to discuss how we can tailor the display with the right samples, videos and product information for your team and projects. This will help you present our materials to your clients and show them what’s possible.\n\nInterested in the idea? Simply reply to this email, and we can develop it together.`
    : `Hi ${name},\n\n${introEn}\n\nWe’d love to take the next step with you. We’ve designed a showroom concept for retail partners, with material displays, samples and space for a small stock collection. You’ll find the concept designs attached.\n\nYour customers can see, touch and bend the material—and probably ask: “Wait… is this really stone?” 😉\n\nOur proposal is to invest in a lasting partnership together. You would initially cover the cost of the display, its presentation materials and delivery. The agreed presentation investment will be credited against future product orders. We’ll agree on the amount and how those credits are applied together.\n\nTo get started, we propose a suitable collection that you purchase directly from Habitat One for your shop or showroom. Together, we’ll agree on the products, quantities and purchasing terms, and expand the collection as demand grows.\n\nWe’d love to discuss how we can tailor the showroom setting and collection to your business and build a fruitful, lasting partnership.\n\nInterested? Simply reply to this email, and we can work out the possibilities together.`;
  return {
    subject: kind === 'professional'
      ? 'Una idea flexible para vuestros proyectos / A flexible idea for your projects'
      : 'Una idea flexible para vuestra tienda / A flexible idea for your shop or showroom',
    body: `${es.replace(introEs,`${introEs}\n\n${proposalEs}${interestEs}`)}\n\nAquí tenéis los vídeos y las fichas técnicas:\n${link}\n\nUn cordial saludo,\n${signature}\n\n──────── English ────────\n\n${en.replace(introEn,`${introEn}\n\n${proposalEn}${interestEn}`)}\n\nYou can find our videos and technical data sheets here:\n${link}\n\nWarm regards,\n${signature}`,
  };
}
