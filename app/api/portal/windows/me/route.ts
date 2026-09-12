import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAccounts } from "@/lib/db/schema";
import { jsonCors, portalAuth } from "@/lib/portal/api";
export async function GET(req:Request) {
 const token=await portalAuth(req,"windows");
 if(!token) return jsonCors({ok:false,error:"unauthorized"},401,req.headers.get("origin"));
 const account=await db.query.customerAccounts.findFirst({where:eq(customerAccounts.id,token.sub)});
 if(!account) return jsonCors({ok:false,error:"unauthorized"},401,req.headers.get("origin"));
 return jsonCors({ok:true,account:{email:account.email,tier:account.priceTier,businessName:account.businessName}},200,req.headers.get("origin"));
}
