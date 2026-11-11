"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth/guards";
import { linkExistingPurchase, pushPurchaseToHolded, recoverUncertainPush, type PushResult } from "@/lib/holded/purchase-push";

export type HoldedPushState = { result?: PushResult };

const uuid = /^[0-9a-f-]{36}$/i;

export async function pushToHoldedAction(poId: string, _prev: HoldedPushState, formData: FormData): Promise<HoldedPushState> {
  const user = await requireModule("inkoop");
  if (!uuid.test(poId)) return { result: { ok: false, message: "Ongeldige inkooporder." } };
  const keys = formData.getAll("lineKey").map(String);
  const choices: Parameters<typeof pushPurchaseToHolded>[0]["choices"] = {};
  for (const k of keys) {
    choices[k] = {
      account: String(formData.get(`account_${k}`) ?? ""),
      vat: String(formData.get(`vat_${k}`) ?? ""),
      retention: String(formData.get(`ret_${k}`) ?? "") || null,
      holdedProjectId: String(formData.get(`project_${k}`) ?? "") || null,
      desc: String(formData.get(`desc_${k}`) ?? ""),
    };
  }
  try {
    const result = await pushPurchaseToHolded({
      poId,
      docNumber: String(formData.get("docNumber") ?? ""),
      contactId: String(formData.get("contactId") ?? ""),
      choices,
      userId: user.id,
    });
    revalidatePath(`/inkooporders/${poId}`);
    return { result };
  } catch (e) {
    console.error("[holded] push inkoop mislukt", poId, e);
    return { result: { ok: false, message: e instanceof Error ? e.message : "Onbekende fout." } };
  }
}

export async function linkExistingAction(poId: string, holdedId: string): Promise<PushResult> {
  await requireModule("inkoop");
  if (!uuid.test(poId) || !/^[0-9a-f]{24}$/i.test(holdedId)) return { ok: false, message: "Ongeldig document." };
  const r = await linkExistingPurchase(poId, holdedId);
  revalidatePath(`/inkooporders/${poId}`);
  return r;
}

export async function recoverPushAction(poId: string, confirmNotInHolded: boolean): Promise<PushResult> {
  await requireModule("inkoop");
  if (!uuid.test(poId)) return { ok: false, message: "Ongeldige inkooporder." };
  const r = await recoverUncertainPush(poId, confirmNotInHolded);
  revalidatePath(`/inkooporders/${poId}`);
  return r;
}
