import 'server-only';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { partnerProfiles as p, partnerContracts as c } from '@/lib/db/schema';
export async function publicPartners(){
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'});
 return db.select({id:p.contactId,name:p.publicName,address:p.publicAddress,city:p.publicCity,country:p.publicCountry,email:p.publicEmail,phone:p.publicPhone,website:p.publicWebsite,latitude:p.latitude,longitude:p.longitude})
 .from(p).innerJoin(c,and(eq(c.id,p.activeContractId),eq(c.contactId,p.contactId))).where(and(eq(p.active,true),eq(p.published,true),eq(c.legalReviewed,true),isNotNull(c.signedPath),isNotNull(c.verifiedAt),sql`${c.validFrom} <= ${today}`,sql`${c.validUntil} >= ${today}`)).orderBy(p.publicName);
}
export type PublicPartner = Awaited<ReturnType<typeof publicPartners>>[number];
