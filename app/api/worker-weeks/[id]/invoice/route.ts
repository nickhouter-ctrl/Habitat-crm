import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets } from "@/lib/db/schema";
import { weigerRoute } from "@/lib/auth/guards";
import { renderWorkerInvoice } from "@/lib/worker-invoice-pdf";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const denied=await weigerRoute("inkoop");if(denied)return denied;
 const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return new Response("Not found",{status:404});
 const [s]=await db.select().from(workerWeekSheets).where(eq(workerWeekSheets.id,id));
 if(!s?.invoice)return new Response("Not found",{status:404});
 const buffer=await renderWorkerInvoice(s.invoice,s.days,s.invoiceStatus!);
 return new Response(new Uint8Array(buffer),{headers:{"content-type":"application/pdf","content-disposition":`inline; filename="invoice-${id}.pdf"`,"cache-control":"private, no-store","x-robots-tag":"noindex"}});
}
