"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";

import { pullContactsFromHolded, pullDocumentsFromHolded } from "./sync";

/** Pull contacts + financial documents from Holded into the CRM. */
export async function syncHoldedNow(): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Niet ingelogd." };
  }
  if (!process.env.HOLDED_API_KEY) {
    return { ok: false, message: "HOLDED_API_KEY is niet ingesteld (.env.local)." };
  }

  try {
    const contacts = await pullContactsFromHolded();
    const docs = await pullDocumentsFromHolded(["estimate", "invoice"]);

    for (const path of ["/", "/contacts", "/quotes", "/invoices", "/settings"]) {
      revalidatePath(path);
    }

    return {
      ok: true,
      message: `Contacten +${contacts.created}/~${contacts.updated} · documenten +${docs.created}/~${docs.updated}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Sync met Holded mislukt.",
    };
  }
}
