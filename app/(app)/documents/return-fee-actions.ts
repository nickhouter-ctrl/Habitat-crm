"use server";
import { requireModule } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prepareReturnFee } from "@/lib/return-fee-service";
export async function createReturnFeeInvoice(_previous:{error:string}|null, form:FormData):Promise<{error:string}|null> {
  await requireModule("verkoop");
  const result=await prepareReturnFee(String(form.get("invoiceId")??""),String(form.get("version")??""));
  if(result.error)return {error:result.error};
  for(const path of ["/documents","/projects","/voorraad",`/documents/${form.get("invoiceId")}`,`/documents/${result.id}`])revalidatePath(path);
  if("creditId" in result && result.creditId)revalidatePath(`/documents/${result.creditId}`);
  if(result.projectId)revalidatePath(`/projects/${result.projectId}`);
  redirect(`/documents/${result.id}`);
}
