"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireWriteUser } from "@/lib/auth/guards";
import { reverseStockWriteoff, writeOffStock, type WriteoffReason } from "@/lib/stock-writeoff";
import { parseMoney } from "@/lib/parse-money";

/** "1.234,5" → 1234.5 · "28.000000" → 28 (zie lib/parse-money.ts). */
function aantal(v: string): number {
  return parseMoney(v) ?? 0;
}

export async function writeOffStockAction(formData: FormData) {
  const user = await requireWriteUser();
  const productId = String(formData.get("productId") ?? "").trim();
  const qty = aantal(String(formData.get("qty") ?? ""));
  const reason = String(formData.get("reason") ?? "showroom") as WriteoffReason;
  const projectId = String(formData.get("projectId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  const res = await writeOffStock({
    productId,
    qty,
    reason,
    date,
    note: String(formData.get("note") ?? ""),
    projectId: projectId.length === 36 ? projectId : null,
    userId: user.id,
    // Een telverschil mag de voorraad wél onder nul brengen: dan klopte de
    // stand simpelweg niet. Bij de andere redenen is negatief altijd een fout.
    allowNegative: reason === "correction",
  });

  revalidatePath("/products/afboeken");
  revalidatePath("/products");
  if (!res.ok) {
    const melding =
      res.reason === "te-weinig-voorraad"
        ? `tekort:${res.beschikbaar ?? 0}`
        : res.reason === "geen-aantal"
          ? "aantal"
          : "product";
    redirect(`/products/afboeken?fout=${melding}`);
  }
  if (projectId.length === 36) revalidatePath(`/projects/${projectId}`);
  redirect("/products/afboeken?ok=1");
}

export async function reverseStockWriteoffAction(id: string) {
  const user = await requireWriteUser();
  await reverseStockWriteoff({ id, userId: user.id });
  revalidatePath("/products/afboeken");
  revalidatePath("/products");
}
