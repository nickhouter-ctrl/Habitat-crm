import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({guard:vi.fn(),select:vi.fn(),claim:vi.fn(),mail:vi.fn(),attachments:vi.fn(),insert:vi.fn(),set:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/auth/guards',()=>({requireModule:m.guard}));
vi.mock('@/lib/db',()=>({db:{select:()=>({from:()=>({where:m.select})}),insert:()=>({values:m.insert}),update:()=>({set:(values:unknown)=>{m.set(values);return{where:()=>({returning:m.claim})};}})}}));
vi.mock('@/lib/email',()=>({sendEmail:m.mail,persoonlijkeMail:(body:string)=>({html:body,text:body})}));
vi.mock('@/lib/followup-mail-attachments',()=>({followupAttachments:m.attachments}));
vi.mock('@/lib/sent-email',()=>({recordSentEmail:vi.fn()}));
vi.mock('@/lib/partner-context',()=>({partnerContext:vi.fn(),partnerMailVisible:vi.fn()}));
vi.mock('@/lib/partner-mail-sync',()=>({syncPartnerSent:vi.fn()}));
vi.mock('@/lib/ai-reply',()=>({genereerMailAntwoord:vi.fn()}));
import { saveDraft, sendDraft, editDraft } from '../../app/(app)/beurs/opvolging/actions';
import { followupMailSource } from '../followup-mail';
const id='00000000-0000-4000-8000-000000000001';
const date=new Date('2026-09-30T12:00:00Z');
const draft={id,contactId:id,status:'draft',updatedAt:date,toEmail:'test@example.com',subject:'Test',body:'Test',mailboxUser:'hi@example.com'};
function form(){const f=new FormData();f.set('id',id);f.set('updatedAt',date.toISOString());f.set('confirm','on');return f;}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('GMAIL_USER','hi@example.com');m.guard.mockResolvedValue({id,name:'Test',email:'hi@example.com'});m.attachments.mockResolvedValue([]);});
describe('verzending: autorisatie en dubbele klik',()=>{
 it('weigert vóór databank- of mailtoegang bij ontbrekende rechten',async()=>{m.guard.mockRejectedValue(new Error('Geen toegang'));await expect(sendDraft({},form())).rejects.toThrow('Geen toegang');expect(m.select).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();});
 it('verstuurd concept wordt nooit opnieuw verzonden',async()=>{m.select.mockResolvedValueOnce([{...draft,status:'sent'}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('een onzekere verzending wordt niet automatisch herhaald',async()=>{m.select.mockResolvedValueOnce([{...draft,status:'unknown'}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('een ondertussen gewijzigd concept vereist nieuwe controle',async()=>{m.select.mockResolvedValueOnce([{...draft,updatedAt:new Date('2026-09-30T13:00:00Z')}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('verliezer van een gelijktijdige verzendpoging verstuurt niets',async()=>{m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:'test@example.com'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);m.claim.mockResolvedValue([]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('respecteert de niet-mailenlijst',async()=>{m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:'test@example.com'}]).mockResolvedValueOnce([{id}]);expect((await sendDraft({},form())).error).toContain('niet-mailenlijst');expect(m.mail).not.toHaveBeenCalled();});
 it('verstuurd het opgeslagen voorstel met de bijlagen en houdt de tekst ongewijzigd',async()=>{
   m.select.mockResolvedValueOnce([{...draft,source:followupMailSource('reseller'),body:'Hola Ana / Hi Ana — handmatig aangepast'}]).mockResolvedValueOnce([{id,email:draft.toEmail,tags:['rol:architect']}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{interest:'interested'}]);
   const attachment={filename:'showroom.jpg',content:Buffer.from('image')};m.attachments.mockResolvedValue([attachment]);m.claim.mockResolvedValue([draft]);m.mail.mockResolvedValue({sent:true,messageId:'provider-id'});
   expect((await sendDraft({},form())).success).toBeTruthy();
   expect(m.attachments).toHaveBeenCalledWith('reseller');expect(m.mail).toHaveBeenCalledTimes(1);
   expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({text:'Hola Ana / Hi Ana — handmatig aangepast',attachments:[attachment],fromUser:{name:'Hans'},to:draft.toEmail}));
   expect(m.set).toHaveBeenCalledWith(expect.objectContaining({status:'sent',messageId:'provider-id'}));
 });
 it('weigert een oud verkooppuntvoorstel nadat de klant interesse heeft afgewezen',async()=>{
   m.select.mockResolvedValueOnce([{...draft,source:followupMailSource('reseller')}]).mockResolvedValueOnce([{id,email:draft.toEmail,type:'reseller'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{interest:'not_interested'}]);
   expect((await sendDraft({},form())).error).toContain('verkooppuntinteresse');expect(m.claim).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();
 });
 it('verstuurd niets als een toegezegde bijlage ontbreekt',async()=>{
   m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:draft.toEmail}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);m.attachments.mockRejectedValue(new Error('ENOENT /secret/path'));
   const result=await sendDraft({},form());expect(result.error).toBeTruthy();expect(result.error).not.toContain('/secret');expect(m.claim).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();
 });
 it('legt een onzekere provideruitkomst vast en herhaalt de verzending niet',async()=>{
   m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:draft.toEmail}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);m.claim.mockResolvedValue([draft]);m.mail.mockRejectedValue(new Error('network'));
   expect((await sendDraft({},form())).error).toContain('niet volledig bevestigd');expect(m.set).toHaveBeenCalledWith(expect.objectContaining({status:'unknown'}));expect(m.mail).toHaveBeenCalledTimes(1);
 });
});

function saveForm(kind='professional'){const f=new FormData();f.set('contactId',id);f.set('subject','Voorstel');f.set('body','Persoonlijk aangepast voorstel');f.set('templateKind',kind);return f;}
describe('voorstel bewaren en aanpassen',()=>{
 it('bewaart de gekozen mail met bijlagen, zonder een mail te versturen',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail}]);m.attachments.mockResolvedValue([{filename:'display.jpg',content:Buffer.from('image')}]);
   expect((await saveDraft({},saveForm())).success).toBeTruthy();expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({source:followupMailSource('professional'),body:'Persoonlijk aangepast voorstel',attachments:[{name:'display.jpg',size:5}]}));expect(m.mail).not.toHaveBeenCalled();
 });
 it('een gekozen verkooppuntmail vereist vastgelegde interesse op de server',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail,tags:['rol:architect']}]).mockResolvedValueOnce([]);
   expect((await saveDraft({},saveForm('reseller'))).error).toContain('Leg eerst');expect(m.insert).not.toHaveBeenCalled();
 });
 it('weigert onbekende bijlagenkeuzes voordat gegevens worden gelezen',async()=>{
   expect((await saveDraft({},saveForm('../../.env'))).error).toBeTruthy();expect(m.select).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();
 });
 it('bewerken houdt de opgeslagen voorstelsoort en bijlagen intact',async()=>{
   const f=form();f.set('subject','Aangepast');f.set('body','Ander voorstel');m.claim.mockResolvedValue([draft]);
   expect((await editDraft({},f)).success).toBeTruthy();expect(m.set).toHaveBeenCalledWith({subject:'Aangepast',body:'Ander voorstel',updatedAt:expect.any(Date)});expect(m.mail).not.toHaveBeenCalled();
 });
});
