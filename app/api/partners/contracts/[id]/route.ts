import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { partnerContracts } from '@/lib/db/schema';
import { weigerRoute } from '@/lib/auth/guards';
import { partnerContractDocument } from '@/lib/partner-contract';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await weigerRoute('verkooppunten');if(denied)return denied;
 const{id}=await params;if(!z.string().uuid().safeParse(id).success)return new Response('Niet gevonden',{status:404});
 const[c]=await db.select().from(partnerContracts).where(eq(partnerContracts.id,id));if(!c)return new Response('Niet gevonden',{status:404});
 return new Response(partnerContractDocument(c),{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="verkooppunt-contract-v${c.version}.txt"`,'Cache-Control':'private, no-store'}});
}
