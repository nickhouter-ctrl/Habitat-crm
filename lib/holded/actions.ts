"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";

import {
  pullContactsFromHolded,
  pullDocumentsFromHolded,
  pullProductsFromHolded,
  pullPurchaseOrdersFromHolded,
} from "./sync";

/** Pull products, contacts and financial documents from Holded into the CRM. */
export async function syncHoldedNow(): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Niet ingelogd." };
  }
  if (!process.env.HOLDED_API_KEY) {
    return { ok: false, message: "HOLDED_API_KEY is niet ingesteld (.env.local)." };
  }

  try {
    const products = await pullProductsFromHolded();
    const contacts = await pullContactsFromHolded();
    const docs = await pullDocumentsFromHolded(["estimate", "invoice", "creditnote"]);
    const purchases = await pullPurchaseOrdersFromHolded();

    for (const path of [
      "/",
      "/contacts",
      "/products",
      "/quotes",
      "/invoices",
      "/inkooporders",
      "/settings",
    ]) {
      revalidatePath(path);
    }

    return {
      ok: true,
      message: `Producten +${products.created}/~${products.updated} · contacten +${contacts.created}/~${contacts.updated} · documenten +${docs.created}/~${docs.updated} · aankopen +${purchases.created}/~${purchases.updated}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Sync met Holded mislukt.",
    };
  }
}
