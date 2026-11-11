import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { staffNotificationEmail } from '../staff-notification-email';
describe('personal employee notification emails',()=>{
 it('escapes untrusted content, strips subject line breaks and uses authenticated CRM links',()=>{
  const m=staffNotificationEmail({kind:'team_message',actorName:'<img src=x>',title:'Task\nBcc: attacker',body:'<script>alert(1)</script>',messageId:'00000000-0000-4000-8000-000000000001'},{name:'<Ana>',locale:'en'});
  expect(m.subject).not.toMatch(/[\r\n]/);expect(m.html).not.toContain('<script>');expect(m.html).toContain('&lt;script&gt;');expect(m.html).toContain('/teamberichten?bericht=');expect(m.subject).toContain('Message from');
 });
 it('translates a daily overview to Spanish and renders overdue tasks and appointments',()=>{
  const m=staffNotificationEmail({kind:'daily_agenda',day:'2026-10-04',items:[{id:'1',kind:'task',title:'Call Ana',body:null,at:new Date('2026-10-03T15:00:00Z'),contactId:null,contactName:null,overdue:true},{id:'2',kind:'appointment',title:'Visit project',body:null,at:new Date('2026-10-04T08:00:00Z'),contactId:null,contactName:null,location:'Bloemendaal'}]},{name:'Mourad',locale:'es'});
  expect(m.subject).toContain('Tu agenda');expect(m.text).toContain('Tarea atrasada');expect(m.text).toContain('Bloemendaal');expect(m.html).toContain('owner=mine');
 });
 it('links a submitted timesheet directly to authenticated review, including in Spanish',()=>{
  const m=staffNotificationEmail({kind:'worker_week_submitted',title:'<Supplier> · 45/2026',body:'Project bathroom · 80 h',sheetId:'00000000-0000-4000-8000-000000000001'},{name:'Nick',locale:'es'});
  expect(m.subject).toContain('Parte semanal pendiente');expect(m.html).toContain('&lt;Supplier&gt;');expect(m.html).toContain('/projects/weekstaten#weekstaat-00000000-0000-4000-8000-000000000001');expect(m.text).toContain('Revisar parte semanal');expect(m.html).not.toContain('/uren/');
 });

 it('links a fixed-price invoice without hours to its review card',()=>{
  const m=staffNotificationEmail({kind:'worker_week_submitted',title:'Gershwin · 24 · 1.038,83 €',body:'Het palijsje · Mano de obra',lumpId:'00000000-0000-4000-8000-000000000002'},{name:'Nick',locale:'nl'});
  expect(m.subject).toBe('Factuur zonder uren ter controle: Gershwin · 24 · 1.038,83 €');expect(m.html).toContain('/projects/weekstaten#losse-factuur-00000000-0000-4000-8000-000000000002');expect(m.text).toContain('Factuur controleren');expect(m.html).not.toContain('weekstaat-');
 });

});
