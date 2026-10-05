/**
 * Is een verzonden mail persoonlijke opvolging, of iets wat het systeem stuurt?
 *
 * Alleen persoonlijke mail telt op de opvolglijst als "gemaild" en maakt van een
 * contact een opvolgklant. Een factuur, een herinnering of een accountmail is
 * dat niet — anders belandt iedere klant die een factuur krijgt in Opvolging,
 * en ook leveranciers en collega's die toevallig als contact bestaan.
 *
 * Onderwerpen staan hier in alle talen waarin het CRM ze verstuurt. Een echt
 * antwoord in zo'n draad ("Re: Presupuesto …") blijft wél persoonlijk.
 */
const BEURS_AUTOMATISCH = /^(English version · Our meeting on 28 September · Habitat One|The films from our stand · Los vídeos de nuestro stand|Leuk je te ontmoeten op |Great to meet you at |Un placer conocerte en )/i;

const ANTWOORD = /^(re|antw|aw|sv)\s*:/i;

const SYSTEEM = new RegExp(
  "^(?:" + [
    // Documenten
    "(?:factuur|factura|facture|rechnung|invoice|proforma|offerte|presupuesto|quotation|angebot|calculatie|creditnota|abono)\\b",
    // Herinneringen en leveringen
    "(?:recordatorio|reminder|herinnering|erinnerung)\\b",
    "(?:su|uw|your|ihre)\\s+(?:entrega|instalación|pedido|enlace|levering|montage|bestelling|delivery|installation|order|lieferung|bestellung)\\b",
    // Bevestigingen en ontvangstberichten
    "(?:confirmación|bevestiging|confirmation|bestätigung)\\b",
    "hemos recibido su solicitud",
    // Accounts en het klantportaal
    "(?:je habitat one|tu cuenta de habitat one|dein habitat one|your habitat one)",
    "habitat windows\\s+—",
    "(?:je inloglink|your login link|tu enlace de acceso)",
    // Rekeningoverzichten en reviewverzoeken
    "(?:overzicht van uw openstaande|overview of your outstanding|resumen de sus facturas|übersicht ihrer offenen)",
    "(?:tevreden\\?|happy with your purchase|¿contento con su compra)",
    // Interne meldingen aan collega's
    "\\d+\\s+inkoopfactu",
    "bericht van\\s",
    // Automatische tijdvoorstellen voor de showroom
    "(?:a new time for your showroom|een nieuw moment voor je showroom|ein neuer termin für deinen showroom)",
  ].join("|") + ")",
  "i",
);

export function isPersonalPartnerMail(subject: string, _inReplyTo?: string | null) {
  const s = subject.trim();
  if (BEURS_AUTOMATISCH.test(s)) return false;
  if (ANTWOORD.test(s)) return true;
  return !SYSTEEM.test(s);
}
