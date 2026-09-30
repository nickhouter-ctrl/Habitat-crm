/** Exacte systeemonderwerpen; echte antwoorden beginnen met Re: en blijven persoonlijk. */
export function isPersonalPartnerMail(subject:string, inReplyTo?:string|null){
 if (/^(English version · Our meeting on 28 September · Habitat One|The films from our stand · Los vídeos de nuestro stand|Leuk je te ontmoeten op |Great to meet you at |Un placer conocerte en )/i.test(subject.trim())) return false;
 return !!inReplyTo || !/^(factuur|invoice|proforma|offerte|quotation|recordatorio|reminder)\b/i.test(subject.trim());
}
