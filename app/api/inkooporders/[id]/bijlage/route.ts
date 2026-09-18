import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { purchaseOrders } from "@/lib/db/schema";
import { normalizePoAttachments } from "@/lib/purchase-orders";
import { purchaseOrderFileUrl } from "@/lib/storage";
import { weigerRoute } from "@/lib/auth/guards";

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const nee = await weigerRoute("inkoop");
  if (nee) return nee;
  const {id}=await params;
  if(!z.string().uuid().safeParse(id).success) return new NextResponse("Niet gevonden",{status:404});
  const path=new URL(req.url).searchParams.get("path");
  const po=await db.query.purchaseOrders.findFirst({where:eq(purchaseOrders.id,id),columns:{attachments:true}});
  // Never turn this endpoint into an arbitrary private-storage URL signer.
  if(!path||!po||!normalizePoAttachments(po.attachments).some(a=>a.path===path)) return new NextResponse("Bijlage niet gevonden",{status:404});
  const url=await purchaseOrderFileUrl(path);
  if(!url) return new NextResponse("Bijlage tijdelijk niet beschikbaar. Probeer opnieuw.",{status:503});
  const response=NextResponse.redirect(url);
  response.headers.set("Cache-Control","private, no-store");
  return response;
}
