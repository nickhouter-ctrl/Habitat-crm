import { portalLinkForToken } from "@/lib/worker-portal";
import { weekLang } from "@/lib/worker-week";
import { renderWorkerGuide } from "@/lib/worker-guide-pdf";
import { rateLimit } from "@/lib/rate-limit";
/** Handleiding als PDF, in de taal van het portaal (?lang=). Alleen met een geldige link. */
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}) {
 const {token}=await params;const ctx=await portalLinkForToken(token,{history:true});
 if(!ctx)return new Response("Not found",{status:404});
 if(!await rateLimit(`worker-guide:${ctx.link.id}`,30,3600,{strikt:true}))return new Response("Try later",{status:429});
 const lang=weekLang(new URL(request.url).searchParams.get("lang")??ctx.worker.portalLang);
 const buffer=await renderWorkerGuide(lang);
 const name=lang==="es"?"Guia-portal-horas":lang==="nl"?"Handleiding-urenportaal":"Guide-hours-portal";
 return new Response(new Uint8Array(buffer),{headers:{"content-type":"application/pdf","content-disposition":`inline; filename="${name}.pdf"`,"cache-control":"private, no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex"}});
}
