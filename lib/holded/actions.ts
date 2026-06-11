"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";

import {
  pullContactsFromHolded,
  pullDocumentsFromHolded,
  pullProductsFromHolded,
  pullProjectsFromHolded,
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

  // Pull vanuit Holded is op verzoek uitgeschakeld — we synchroniseren alleen
  // CRM → Holded (push via de 'Push naar Holded'-knop op documenten). Dit
  // voorkwam dubbele projecten/facturen die eerder via de pull binnenkwamen.
  // De pull-functies blijven beschikbaar voor wie 'm later weer wil aanzetten.
  void [
    pullProductsFromHolded,
    pullContactsFromHolded,
    pullDocumentsFromHolded,
    pullPurchaseOrdersFromHolded,
    pullProjectsFromHolded,
    revalidatePath,
  ];
  return {
    ok: true,
    message: "Pull vanuit Holded staat uit — alleen CRM → Holded (push) is actief.",
  };
}
