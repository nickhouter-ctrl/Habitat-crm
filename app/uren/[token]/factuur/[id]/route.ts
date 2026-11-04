import { and,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets } from "@/lib/db/schema";
import { portalLinkForToken } from "@/lib/worker-portal";
import { renderWorkerInvoice } from "@/lib/worker-invoice-pdf";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(_request:Request,{params}:{params:Promise<{token:string;id:string}>}) {
 const {token,id}=await params;const ctx=await portalLinkForToken(token);
 if(!ctx || !/^[0-9a-f-]{36}$/.test(id))return new Response("Not found",{status:404});
 if(!await rateLimit(`worker-pdf:${ctx.link.id}`,60,3600,{strikt:true}))return new Response("Try later",{status:429});
 const [s]=await db.select().from(workerWeekSheets).where(and(eq(workerWeekSheets.id,id),eq(workerWeekSheets.workerId,ctx.worker.id),eq(workerWeekSheets.projectId,ctx.project.id)));
 if(!s?.invoice)return new Response("Not found",{status:404});
 const buffer=await renderWorkerInvoice(s.invoice,s.days,s.invoiceStatus!);
 return new Response(new Uint8Array(buffer),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="invoice-${id}.pdf"`,"cache-control":"private, no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex"}});
}
