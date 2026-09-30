import { describe, expect, it } from 'vitest';
import { conversationState, distanceKm, profileInput } from '../partners';
import { cents, presentationAmounts, presentationSchema, redemptionLimit } from '../presentation';
describe('persoonlijke opvolging',()=>{
 it('een eerder antwoord stopt de vraag om opnieuw te antwoorden',()=>{expect(conversationState(new Date('2026-09-29'),new Date('2026-09-30'))).toBe('Wachten op klant');});
 it('een nieuw klantantwoord maakt opnieuw werk',()=>{expect(conversationState(new Date('2026-10-01'),new Date('2026-09-30'))).toBe('Antwoord nodig');});
 it('staat geen activering via de gewone profielactie toe',()=>{expect(profileInput.safeParse({contactId:'00000000-0000-4000-8000-000000000001',version:0,interest:'candidate',stage:'active',language:'en',ownerId:'',nextAction:'',nextActionOn:'',notes:''}).success).toBe(false);});
 it('geeft realistische gebiedsafstanden',()=>{expect(distanceKm({lat:40.4168,lon:-3.7038},{lat:41.3874,lon:2.1686})).toBeCloseTo(505.1,0);expect(distanceKm({lat:40,lon:0},{lat:40,lon:0})).toBe(0);});
});
describe('presentatietegoed',()=>{
 const base={mode:'first_order',credit:100000,used:0,paid:100000,charge:100000,rate:10,minimum:0,remainder:'minimum',expires:null};
 it('rekent in centen en weigert negatieve of afgeronde invoer',()=>{expect(cents('19,95')).toBe(1995);for(const bad of ['-1','1.001','1,234.56','Infinity','1e4'])expect(()=>cents(bad)).toThrow();});
 it('gratis is geen klantbetaling en geen terug te betalen tegoed',()=>{expect(presentationAmounts({mode:'free',value:100000,contribution:0})).toEqual({contribution:100000,charge:0,credit:0});expect(()=>redemptionLimit({...base,mode:'free'},200000,'2026-09-30')).toThrow();});
 it('gedeeltelijke bijdrage geeft geen dubbel voordeel',()=>{expect(presentationAmounts({mode:'contribution',value:100000,contribution:40000})).toEqual({contribution:40000,charge:60000,credit:0});});
 it('verrekent het gehele bedrag bij een voldoende eerste order',()=>{expect(redemptionLimit(base,150000,'2026-09-30')).toBe(100000);expect(()=>redemptionLimit(base,99999,'2026-09-30')).toThrow();});
 it('neemt restant alleen mee bij de gekozen afspraak',()=>{expect(redemptionLimit({...base,remainder:'carry'},40000,'2026-09-30')).toBe(40000);expect(redemptionLimit({...base,remainder:'carry',used:40000},100000,'2026-09-30')).toBe(60000);});
 it('blokkeert verlopen, onbetaald en opgebruikt tegoed',()=>{for(const patch of [{paid:0},{used:100000},{expires:'2026-09-29'}])expect(()=>redemptionLimit({...base,...patch},200000,'2026-09-30')).toThrow();});
 it('percentage kan nooit meer dan resterend tegoed afboeken',()=>{expect(redemptionLimit({...base,mode:'spread',used:95000},100000,'2026-09-30')).toBe(5000);});
 it('weigert overbetaling van een gratis pakket',()=>{expect(presentationSchema.safeParse({contactId:'00000000-0000-4000-8000-000000000001',version:0,mode:'free',title:'pakket',value:'1000',contribution:'0',cost:'',paid:'1',rate:0,minimumOrder:'0',remainder:'minimum',expires:'',terms:'Gratis afgesproken'}).success).toBe(false);});
});

import { isPersonalPartnerMail } from '../partner-mail-kind';
describe('onderscheid informatie en persoonlijke reactie',()=>{
 it('een persoonlijke eerste benadering telt ook zonder reply-header',()=>{expect(isPersonalPartnerMail('Samenwerking Flexible Stone bespreken')).toBe(true);});
 it('Engelse aanvulling telt niet als persoonlijke opvolging, ook met References',()=>{expect(isPersonalPartnerMail('English version · Our meeting on 28 September · Habitat One','<old>')).toBe(false);});
 it('een echt antwoord op die aanvulling telt wel mee',()=>{expect(isPersonalPartnerMail('Re: English version · Our meeting on 28 September · Habitat One','<reply>')).toBe(true);});
 it('de automatische beursbevestiging telt niet mee',()=>{expect(isPersonalPartnerMail('Un placer conocerte en 360 by Cevisama')).toBe(false);});
});
