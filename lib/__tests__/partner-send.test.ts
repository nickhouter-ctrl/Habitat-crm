import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({guard:vi.fn(),select:vi.fn(),claim:vi.fn(),transaction:vi.fn(),mail:vi.fn(),attachments:vi.fn(),insert:vi.fn(),bewaard:vi.fn(),set:vi.fn(),context:vi.fn(),ai:vi.fn(),keuze:vi.fn(),pdfs:vi.fn()}));
vi.mock('@/lib/i18n/server', async () => ({ tekst: async () => (await import('@/lib/i18n')).maakT('nl') }));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/auth/guards',()=>({requireModule:m.guard}));
vi.mock('@/lib/db',()=>({db:{transaction:m.transaction,select:()=>({from:()=>({where:m.select})}),insert:()=>({values:(v:unknown)=>{m.insert(v);return{returning:m.bewaard};}}),update:()=>({set:(values:unknown)=>{m.set(values);return{where:()=>({returning:m.claim})};}})}}));
vi.mock('@/lib/email',()=>({sendEmail:m.mail,persoonlijkeMail:(body:string)=>({html:body,text:body})}));
vi.mock('@/lib/followup-mail-attachments',()=>({followupAttachments:m.attachments}));
vi.mock('@/lib/followup-mail-completion',()=>({completeFollowupAfterMail:vi.fn()}));
vi.mock('@/lib/sent-email',()=>({recordSentEmail:vi.fn()}));
vi.mock('@/lib/partner-context',()=>({partnerContext:m.context,partnerMailVisible:vi.fn()}));
vi.mock('@/lib/partner-mail-sync',()=>({syncPartnerSent:vi.fn()}));
vi.mock('@/lib/ai-reply',()=>({genereerMailAntwoord:m.ai}));
vi.mock('@/lib/storage',()=>({catalogusKeuze:m.keuze,catalogusMailBijlagen:m.pdfs,signCatalogUpload:vi.fn()}));
import { saveDraft, sendDraft, editDraft, generateDraft } from '../../app/(app)/beurs/opvolging/actions';
import { followupMailSource } from '../followup-mail';
const id='00000000-0000-4000-8000-000000000001';
const date=new Date('2026-09-30T12:00:00Z');
const draft={id,contactId:id,status:'draft',updatedAt:date,toEmail:'test@example.com',subject:'Test',body:'Test',mailboxUser:'hi@example.com'};
function form(){const f=new FormData();f.set('id',id);f.set('updatedAt',date.toISOString());f.set('confirm','on');return f;}
beforeEach(()=>{vi.resetAllMocks();m.transaction.mockImplementation(async fn=>fn({select:()=>({from:()=>({where:()=>({for:async()=>[]})})}),update:()=>({set:(v:unknown)=>{m.set(v);return{where:async()=>[]};}})}));vi.stubEnv('GMAIL_USER','hi@example.com');m.guard.mockResolvedValue({id,name:'Test',email:'hi@example.com'});m.attachments.mockResolvedValue([]);m.keuze.mockResolvedValue([]);m.pdfs.mockResolvedValue([]);m.bewaard.mockResolvedValue([{...draft,id:'00000000-0000-4000-8000-0000000000bb'}]);});
describe('verzending: autorisatie en dubbele klik',()=>{
 it('weigert vóór databank- of mailtoegang bij ontbrekende rechten',async()=>{m.guard.mockRejectedValue(new Error('Geen toegang'));await expect(sendDraft({},form())).rejects.toThrow('Geen toegang');expect(m.select).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();});
 it('verstuurd concept wordt nooit opnieuw verzonden',async()=>{m.select.mockResolvedValueOnce([{...draft,status:'sent'}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('een onzekere verzending wordt niet automatisch herhaald',async()=>{m.select.mockResolvedValueOnce([{...draft,status:'unknown'}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('een ondertussen gewijzigd concept vereist nieuwe controle',async()=>{m.select.mockResolvedValueOnce([{...draft,updatedAt:new Date('2026-09-30T13:00:00Z')}]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('verliezer van een gelijktijdige verzendpoging verstuurt niets',async()=>{m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:'test@example.com'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);m.claim.mockResolvedValue([]);expect((await sendDraft({},form())).error).toBeTruthy();expect(m.mail).not.toHaveBeenCalled();});
 it('respecteert de niet-mailenlijst',async()=>{m.select.mockResolvedValueOnce([draft]).mockResolvedValueOnce([{id,email:'test@example.com'}]).mockResolvedValueOnce([{id}]);expect((await sendDraft({},form())).error).toContain('niet-mailenlijst');expect(m.mail).not.toHaveBeenCalled();});
 it('verstuurd het opgeslagen voorstel met de bijlagen en houdt de tekst ongewijzigd',async()=>{
   m.select.mockResolvedValueOnce([{...draft,source:followupMailSource('reseller'),body:'Hola Ana / Hi Ana — handmatig aangepast'}]).mockResolvedValueOnce([{id,email:draft.toEmail,source:'beurs:360-cevisama-2026',tags:['rol:architect']}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{interest:'interested'}]);
   const attachment={filename:'showroom.jpg',content:Buffer.from('image')};m.attachments.mockResolvedValue([attachment]);m.claim.mockResolvedValue([draft]);m.mail.mockResolvedValue({sent:true,messageId:'provider-id'});
   expect((await sendDraft({},form())).success).toBeTruthy();
   expect(m.attachments).toHaveBeenCalledWith('reseller',true);expect(m.mail).toHaveBeenCalledTimes(1);
   expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({text:'Hola Ana / Hi Ana — handmatig aangepast',attachments:[attachment],fromUser:{name:'Hans'},to:draft.toEmail,copyPolicy:'team',afzenderEmail:'hi@example.com'}));
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
 it('geeft het bewaarde concept terug, zodat de controlepopup kan tonen wat er weggaat',async()=>{
   // Dit was het gat: bewaren meldde alleen "bewaard", en versturen zat
   // verderop in de mailhistorie achter een vinkje. Nu komt het concept zelf
   // terug — naar wie, met welke bijlagen — en staat de verstuurknop ernaast.
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail}]);
   m.attachments.mockResolvedValue([{filename:'display.jpg',content:Buffer.from('image')}]);
   const res=await saveDraft({},saveForm());
   expect(res.draft).toMatchObject({to:draft.toEmail,subject:'Voorstel',body:'Persoonlijk aangepast voorstel',attachments:['display.jpg'],afzender:'Hans'});
   expect(res.draft?.id).toBeTruthy();expect(res.draft?.updatedAt).toBeTruthy();
   expect(m.mail).not.toHaveBeenCalled();
 });
 it('ondertekent een vrije mail met de medewerker zelf, niet met Hans',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail}]);
   expect((await saveDraft({},saveForm('custom'))).draft?.afzender).toBe('Test');
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

describe('persoonlijk uitwerken met behoud van het juiste voorstel',()=>{
 it('gebruikt de actuele dossiercontext, eigen tekst, twee talen en echte bijlagen',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail,name:'Ana'}]).mockResolvedValueOnce([{interest:'interested',language:'es'}]);m.context.mockResolvedValue('Gesprek en ontvangen reactie');m.ai.mockResolvedValue({subject:'Ana, showroom',body:'Spaans / Engels'});
   await generateDraft(id,'Bespreek hun nieuwe showroom','reseller','Ons concept met een handmatige aanpassing');
   expect(m.ai).toHaveBeenCalledWith(expect.objectContaining({crmContext:'Gesprek en ontvangen reactie',medewerker:'Hans',taal:undefined,maxTokens:2000,beschikbareBijlagen:expect.arrayContaining(['habitat-one-showroom-compact-v1.jpg','habitat-one-showroom-large-v1.jpg'])}));
   expect(m.ai.mock.calls[0][0].bericht).toContain('handmatige aanpassing');expect(m.ai.mock.calls[0][0].instructie).toContain('Geen consignatie');expect(m.ai.mock.calls[0][0].instructie).toContain('eerst Spaans en daarna Engels');
   expect(m.insert).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();
 });
 it('maakt geen verkooppuntvoorstel wanneer iemand die interesse heeft afgewezen',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail,name:'Ana',type:'reseller'}]).mockResolvedValueOnce([{interest:'not_interested'}]);
   await expect(generateDraft(id,'','reseller','Voorstel')).rejects.toThrow('verkooppuntinteresse');expect(m.ai).not.toHaveBeenCalled();
 });
 it('onbekende voorstelsoorten krijgen geen dossiergegevens of AI-toegang',async()=>{
   await expect(generateDraft(id,'','../../.env','Voorstel')).rejects.toThrow();expect(m.context).not.toHaveBeenCalled();expect(m.ai).not.toHaveBeenCalled();
 });
});

const PRESENTATIE='Flexible-Stone-Distributor-Presentation.pdf';
describe('PDF\'s uit de bibliotheek meesturen',()=>{
 it('bewaart de gekozen PDF met zijn pad, zonder hem al op te halen',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail}]);
   m.keuze.mockResolvedValue([{path:PRESENTATIE,name:PRESENTATIE,size:14_754_802}]);
   const f=saveForm('custom');f.append('bijlage',PRESENTATIE);
   const r=await saveDraft({},f);
   expect(r.success).toBeTruthy();
   expect(m.keuze).toHaveBeenCalledWith([PRESENTATIE]);
   expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({attachments:[{name:PRESENTATIE,size:14_754_802,catalogus:PRESENTATIE}]}));
   expect(r.draft?.attachments).toEqual([PRESENTATIE]);
   expect(m.pdfs).not.toHaveBeenCalled();
 });
 it('weigert bijlagen die samen te groot zijn voor één mail',async()=>{
   m.select.mockResolvedValueOnce([{id,email:draft.toEmail}]);
   m.keuze.mockResolvedValue([{path:'a.pdf',name:'a.pdf',size:10*1024*1024},{path:'b.pdf',name:'b.pdf',size:10*1024*1024}]);
   const r=await saveDraft({},saveForm('custom'));
   expect(r.error).toContain('18,0 MB');
   expect(m.insert).not.toHaveBeenCalled();
 });
 it('haalt de gekozen PDF bij versturen op en stuurt hem mee',async()=>{
   const metPdf={...draft,source:'followup:custom',attachments:[{name:PRESENTATIE,size:3,catalogus:PRESENTATIE}]};
   m.select.mockResolvedValueOnce([metPdf]).mockResolvedValueOnce([{id,email:draft.toEmail}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
   m.pdfs.mockResolvedValue([{filename:PRESENTATIE,content:Buffer.from('pdf'),contentType:'application/pdf'}]);
   m.claim.mockResolvedValue([metPdf]);m.mail.mockResolvedValue({sent:true});
   expect((await sendDraft({},form())).success).toBeTruthy();
   expect(m.pdfs).toHaveBeenCalledWith([PRESENTATIE]);
   expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({attachments:[expect.objectContaining({filename:PRESENTATIE})]}));
 });
 it('verstuurt niets als een gekozen PDF inmiddels uit de bibliotheek is verwijderd',async()=>{
   const metPdf={...draft,source:'followup:custom',attachments:[{name:PRESENTATIE,size:3,catalogus:PRESENTATIE}]};
   m.select.mockResolvedValueOnce([metPdf]).mockResolvedValueOnce([{id,email:draft.toEmail}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
   m.pdfs.mockResolvedValue([]);
   const r=await sendDraft({},form());
   expect(r.error).toContain('niet meer in de bibliotheek');
   expect(m.claim).not.toHaveBeenCalled();
   expect(m.mail).not.toHaveBeenCalled();
 });
});
