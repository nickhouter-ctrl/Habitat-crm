import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({guard:vi.fn(),select:vi.fn(),claim:vi.fn(),mail:vi.fn(),attachments:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/auth/guards',()=>({requireModule:m.guard}));
vi.mock('@/lib/db',()=>({db:{select:()=>({from:()=>({where:m.select})}),update:()=>({set:()=>({where:()=>({returning:m.claim})})})}}));
vi.mock('@/lib/email',()=>({sendEmail:m.mail,persoonlijkeMail:(body:string)=>({html:body,text:body})}));
vi.mock('@/lib/beurs-bijlagen',()=>({beursBijlagen:m.attachments}));
vi.mock('@/lib/sent-email',()=>({recordSentEmail:vi.fn()}));
vi.mock('@/lib/partner-context',()=>({partnerContext:vi.fn(),partnerMailVisible:vi.fn()}));
vi.mock('@/lib/partner-mail-sync',()=>({syncPartnerSent:vi.fn()}));
vi.mock('@/lib/ai-reply',()=>({genereerMailAntwoord:vi.fn()}));
import { sendDraft } from '../../app/(app)/beurs/opvolging/actions';
const id='00000000-0000-4000-8000-000000000001';
const date=new Date('2026-09-30T12:00:00Z');
const draft={id,contactId:id,status:'draft',updatedAt:date,toEmail:'test@example.com',subject:'Test',body:'Test',mailboxUser:'hi@example.com'};
function form(){const f=new FormData();f.set('id',id);f.set('updatedAt',date.toISOString());f.set('confirm','on');return f;}
beforeEach(()=>{vi.resetAllMocks();m.guard.mockResolvedValue({id,name:'Test',email:'hi@example.com'});m.attachments.mockResolvedValue([]);});
describe('verzending: autorisatie en dubbele klik',()=>{
 it('weigert vóór databank- of mailtoegang bij ontbrekende rechten',async()=>{m.guard.mockRejectedValue(new Error('Geen toegang'));await expect(sendDraft({},form())).rejects.toThrow('Geen toegang');expect(m.select).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();});
 it('verstuurd concept wordt nooit opnieuw verzonden',async()=>{m.select.mockResolvedValueOnce([{...draft,status:'sent'}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('een onzekere verzending wordt niet automatisch herhaald',async()=>{m.select.mockResolvedValueOnce([{...draft,status:'unknown'}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('een ondertussen gewijzigd concept vereist nieuwe controle',async()=>{m.select.mockResolvedValueOnce([{...draft,updatedAt:new Date('2026-09-30T13:00:00Z')}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('verliezer van een gelijktijdige verzendpoging verstuurt niets',async()=>{m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:'test@example.com'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);m.claim.mockResolvedValue([]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('respecteert de niet-mailenlijst',async()=>{m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:'test@example.com'}]).mockResolvedValueOnce([{id}]);expect((await sendDraft({},form())).error).toContain('niet-mailenlijst');expect(m.mail).not.toHaveBeenCalled();});
});
