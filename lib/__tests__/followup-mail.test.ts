import { describe, expect, it, vi } from 'vitest';
import { confirmedFairDate, followupMailKind, followupMailSource, followupProposal, hasResellerInterest, recommendedFollowupMail } from '../followup-mail';
vi.mock('server-only',()=>({}));
import { followupAttachments } from '../followup-mail-attachments';

describe('passend voorstel zonder beroepen te veranderen',()=>{
  it('een architect wordt pas als verkooppunt benaderd bij vastgelegde interesse',()=>{
    const architect={type:'lead',tags:['rol:architect']};
    expect(hasResellerInterest(architect)).toBe(false);
    expect(hasResellerInterest(architect,{interest:'interested'})).toBe(true);
    expect(architect.tags).toEqual(['rol:architect']);
  });
  it('respecteert een afwijzing boven oude verkooppunttags of contacttype',()=>{
    const reseller={type:'reseller',tags:['rol:wederverkoper']};
    expect(hasResellerInterest(reseller)).toBe(true);
    expect(hasResellerInterest(reseller,{interest:'not_interested'})).toBe(false);
    expect(hasResellerInterest({},{interest:'candidate'})).toBe(true);
  });
  it('stelt geen zakelijk display voor aan leveranciers of particulieren',()=>{
    expect(recommendedFollowupMail({type:'supplier'})).toBe('custom');
    expect(recommendedFollowupMail({tags:['rol:particulier']})).toBe('custom');
    expect(recommendedFollowupMail({tags:['rol:aannemer']})).toBe('professional');
    expect(recommendedFollowupMail({tags:['rol:architect']},{interest:'interested'})).toBe('reseller');
  });
  it('gebruikt alleen expliciete, eenduidige en geldige gespreksdatums',()=>{
    expect(confirmedFairDate(['beurs:gesproken:2026-09-28'])).toBe('2026-09-28');
    expect(confirmedFairDate(['beurs:360-cevisama-2026'])).toBe('');
    expect(confirmedFairDate(['beurs:gesproken:2026-02-30'])).toBe('');
    expect(confirmedFairDate(['beurs:gesproken:2026-09-28','beurs:gesproken:2026-09-29'])).toBe('');
  });
  it('bedankt websitecontacten zonder een beursbezoek of datum te verzinnen',()=>{
    const body=followupProposal('professional',{name:'Ana',isFair:false,meetingDate:'2026-09-28'}).body;
    expect(body).toContain('Hi Ana,');expect(body).toContain('Hola Ana:');
    expect(body).not.toContain('Feria Hábitat');expect(body).not.toContain('28 September');
    expect(body).toContain('/beurs/films');expect(body).not.toContain('shop or showroom');
  });
  it('noemt een beursgesprek op 28 september wanneer dat vastligt',()=>{
    const body=followupProposal('professional',{name:'Ana',isFair:true,meetingDate:'2026-09-28'}).body;
    expect(body).toContain('28 de septiembre de 2026');expect(body).toContain('28 September 2026');
    expect(followupProposal('professional',{name:'Ana',isFair:true,meetingDate:''}).body).not.toContain('28 September');
  });
  it('biedt directe inkoop en afgesproken verrekening zonder consignatie of prijzen te beloven',()=>{
    const body=followupProposal('reseller',{name:'Ana',isFair:true,meetingDate:''}).body;
    expect(body).toContain('purchase directly from Habitat One');expect(body).toContain('compraríais directamente a Habitat One');
    expect(body).toContain('agreed presentation investment');
    expect(body).not.toMatch(/consign|20%|first order|pay.*as you sell/i);
  });
  it('gebruikt alleen bekende broncodes als bijlagenkeuze',()=>{
    expect(followupMailKind(followupMailSource('reseller'))).toBe('reseller');
    expect(followupMailKind('../../.env')).toBe('custom');
    expect(followupMailKind('sent-folder')).toBe('custom');
  });
});
describe('daadwerkelijke meegebundelde mailbijlagen',()=>{
  it.each([['professional',3],['reseller',4],['custom',2]] as const)('%s heeft beide technische sheets en precies de passende ontwerpen',async(kind,count)=>{
    const attachments=await followupAttachments(kind);
    expect(attachments).toHaveLength(count);
    expect(attachments.filter(a=>a.contentType==='application/pdf')).toHaveLength(2);
    for(const attachment of attachments){
      expect(attachment.content.length).toBeGreaterThan(1000);
      if(attachment.contentType==='image/jpeg')expect([...attachment.content.subarray(0,3)]).toEqual([255,216,255]);
    }
  });
});
