"use server";
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { contacts, partnerContracts, partnerProfiles, activities } from '@/lib/db/schema';
import { requireModule } from '@/lib/auth/guards';
import { dateInput, distanceKm } from '@/lib/partners';
import { uploadDocumentFile } from '@/lib/storage';
import type { Result } from '../../../beurs/opvolging/actions';
class InputError extends Error{}
function fail(e:unknown):Result{return{error:e instanceof InputError?e.message:e instanceof z.ZodError?e.issues[0].message:'Bewerking mislukt. Controleer de gegevens en probeer opnieuw.'};}
function refresh(id:string){revalidatePath(`/wederverkopers/${id}/samenwerking`);revalidatePath('/beurs/opvolging');revalidatePath('/verkooppunten');}
const optionalNumber=(min:number,max:number)=>z.union([z.literal(''),z.coerce.number().min(min).max(max)]);
export async function createContract(_:Result,fd:FormData):Promise<Result>{
 const u=await requireModule('producten');
 try{const d=z.object({contactId:z.string().uuid(),body:z.string().trim().min(100).max(50000),validFrom:dateInput,validUntil:dateInput,exclusive:z.string().optional(),latitude:optionalNumber(-90,90),longitude:optionalNumber(-180,180),radiusKm:optionalNumber(.01,1000),territoryTerms:z.string().trim().min(5).max(6000),legalReviewed:z.string().optional()}).parse(Object.fromEntries(fd));
 if(d.validUntil<d.validFrom)throw new InputError('Einddatum ligt vóór begindatum.');if(d.exclusive==='on'&&(d.latitude===''||d.longitude===''||d.radiusKm===''))throw new InputError('Vul middelpunt en straal in voor exclusiviteit.');
 await db.transaction(async tx=>{const [c]=await tx.select().from(contacts).where(eq(contacts.id,d.contactId)).for('update');if(!c)throw new InputError('Contact niet gevonden.');
 const [prev]=await tx.select().from(partnerContracts).where(eq(partnerContracts.contactId,d.contactId)).orderBy(desc(partnerContracts.version)).limit(1);
 await tx.insert(partnerContracts).values({contactId:d.contactId,version:(prev?.version??0)+1,body:d.body,validFrom:d.validFrom,validUntil:d.validUntil,exclusive:d.exclusive==='on',latitude:d.latitude===''?null:String(d.latitude),longitude:d.longitude===''?null:String(d.longitude),radiusKm:d.radiusKm===''?null:String(d.radiusKm),territoryTerms:d.territoryTerms,legalReviewed:d.legalReviewed==='on',createdBy:u.id});
 await tx.insert(activities).values({contactId:d.contactId,type:'note',subject:'Nieuwe contractversie bewaard',authorId:u.id});});refresh(d.contactId);return{success:'Nieuwe contractversie bewaard. Eerdere versies blijven ongewijzigd.'};
 }catch(e){return fail(e);}
}
export async function registerSigned(_:Result,fd:FormData):Promise<Result>{
 const u=await requireModule('producten');
 try{const d=z.object({id:z.string().uuid(),contactId:z.string().uuid(),habitatSigner:z.string().trim().min(3).max(200),partnerSigner:z.string().trim().min(3).max(200),signedOn:dateInput,confirm:z.literal('on')}).parse(Object.fromEntries(fd));
 const [c]=await db.select().from(partnerContracts).where(and(eq(partnerContracts.id,d.id),eq(partnerContracts.contactId,d.contactId)));if(!c||c.signedPath)throw new InputError('Contract niet gevonden of al ondertekend geregistreerd.');
 if(!c.legalReviewed)throw new InputError('Bewaar eerst een juridisch gecontroleerde versie.');
 if(d.signedOn>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'}))throw new InputError('Ondertekening kan niet in de toekomst liggen.');
 const file=fd.get('file');if(!(file instanceof File)||file.size===0||file.size>4_000_000)throw new InputError('Upload een ondertekende PDF van maximaal 4 MB.');
 const bytes=Buffer.from(await file.arrayBuffer());if(bytes.subarray(0,5).toString()!=='%PDF-')throw new InputError('Het bestand is geen PDF.');
 const stored=await uploadDocumentFile(c.id,new File([bytes], 'signed-contract.pdf',{type:'application/pdf'}));
 await db.transaction(async tx=>{const [updated]=await tx.update(partnerContracts).set({signedPath:stored.path,signedHash:createHash('sha256').update(bytes).digest('hex'),habitatSigner:d.habitatSigner,partnerSigner:d.partnerSigner,signedOn:d.signedOn,verifiedBy:u.id,verifiedAt:new Date()}).where(and(eq(partnerContracts.id,c.id),isNull(partnerContracts.signedPath))).returning();if(!updated)throw new InputError('Contract is ondertussen al geregistreerd.');await tx.insert(activities).values({contactId:d.contactId,type:'note',subject:'Beide handtekeningen handmatig geverifieerd',body:JSON.stringify({contractId:c.id,version:c.version,hash:updated.signedHash,habitatSigner:d.habitatSigner,partnerSigner:d.partnerSigner}),authorId:u.id});});refresh(d.contactId);return{success:'Ondertekende PDF en verificatie onveranderlijk vastgelegd.'};
 }catch(e){return fail(e);}
}
export async function activatePartner(_:Result,fd:FormData):Promise<Result>{
 const u=await requireModule('producten');
 try {const d=z.object({contactId:z.string().uuid(),contractId:z.string().uuid(),publicName:z.string().trim().min(2).max(200),publicAddress:z.string().trim().min(3).max(300),publicCity:z.string().trim().min(2).max(150),publicCountry:z.string().trim().min(2).max(100),publicEmail:z.union([z.string().email(),z.literal('')]),publicPhone:z.string().max(100),publicWebsite:z.union([z.string().url().refine(v=>new URL(v).protocol==='https:'),z.literal('')]),latitude:z.string().trim().min(1).transform(Number).pipe(z.number().min(-90).max(90)),longitude:z.string().trim().min(1).transform(Number).pipe(z.number().min(-180).max(180)),publish:z.string().optional(),confirm:z.literal('on')}).parse(Object.fromEntries(fd));
 await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(74621940)`);
 const [contract]=await tx.select().from(partnerContracts).where(and(eq(partnerContracts.id,d.contractId),eq(partnerContracts.contactId,d.contactId)));
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'});
 if(!contract?.signedPath||!contract.legalReviewed||!contract.verifiedAt||contract.validFrom>today||contract.validUntil<today)throw new InputError('Activering vereist een gecontroleerd contract, beide handtekeningen en een lopende geldigheidsperiode.');
 const others=await tx.select({p:partnerProfiles,c:partnerContracts}).from(partnerProfiles).innerJoin(partnerContracts,eq(partnerContracts.id,partnerProfiles.activeContractId)).where(and(eq(partnerProfiles.active,true),sql`${partnerProfiles.contactId} <> ${d.contactId}`,sql`${partnerContracts.validUntil} >= ${today}`));
 for(const other of others){const a=contract,b=other.c;const point={lat:d.latitude,lon:d.longitude};const peer={lat:Number(other.p.latitude),lon:Number(other.p.longitude)};
 if(b.exclusive&&distanceKm(point,{lat:Number(b.latitude),lon:Number(b.longitude)})<=Number(b.radiusKm))throw new InputError(`Locatie valt binnen het exclusieve gebied van ${other.p.publicName}. Pas eerst de ondertekende afspraken aan.`);
 if(a.exclusive&&(distanceKm(peer,{lat:Number(a.latitude),lon:Number(a.longitude)})<=Number(a.radiusKm)||(b.exclusive&&distanceKm({lat:Number(a.latitude),lon:Number(a.longitude)},{lat:Number(b.latitude),lon:Number(b.longitude)})<Number(a.radiusKm)+Number(b.radiusKm))))throw new InputError(`Exclusiviteitsgebied overlapt met ${other.p.publicName}. Pas eerst de ondertekende afspraken aan.`);
 }
 const {contractId,confirm,publish,...fields}=d; void confirm;const values={...fields,latitude:String(d.latitude),longitude:String(d.longitude),active:true,published:publish==='on',activeContractId:contractId,stage:'active',interest:'candidate',updatedAt:new Date()};
 await tx.insert(partnerProfiles).values(values).onConflictDoUpdate({target:partnerProfiles.contactId,set:{...values,version:sql`${partnerProfiles.version}+1`}});
 await tx.insert(activities).values({contactId:d.contactId,type:'note',subject:'Officieel verkooppunt geactiveerd',body:JSON.stringify({contractId,published:values.published}),authorId:u.id});});refresh(d.contactId);return{success:'Officieel verkooppunt geactiveerd. Publicatie volgt de gekozen instelling.'};
 }catch(e){return fail(e);}
}
