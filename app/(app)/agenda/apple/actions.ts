"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { appleCalendarConnections as connections, appleCalendarEvents as mappings } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { AppleCalendarError } from "@/lib/apple-calendar/client";
import { connectApple, disconnectApple, syncAppleCalendar } from "@/lib/apple-calendar/sync";

export type AppleFormState = { error?: string; success?: string };
const errorText = (error: unknown): string => {
  if (error instanceof AppleCalendarError) {
    if (error.message === "credentials") return "Apple weigert de toegang. Controleer je Apple Account en app-specifieke wachtwoord.";
    if (error.message === "busy") return "Er loopt al een synchronisatie. Probeer het over enkele minuten opnieuw.";
    if (error.message === "different-account") return "Deze werkagenda is al aan een ander Apple Account gekoppeld. Gebruik het bestaande account.";
    if (error.message === "calendar-missing") return "De gekoppelde werkagenda is niet gevonden in iCloud. Er zijn geen afspraken verwijderd.";
  }
  return "De koppeling kon niet worden bijgewerkt. Probeer opnieuw of neem contact op met de beheerder.";
};
const refresh = () => { revalidatePath("/agenda/apple"); revalidatePath("/agenda"); revalidatePath("/"); };

export async function connectAppleAction(_state: AppleFormState, form: FormData): Promise<AppleFormState> {
  const user = await requireAdmin();
  const input = z.object({
    account: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
    password: z.string().trim().regex(/^[a-z]{4}(?:-[a-z]{4}){3}$/i),
    consent: z.literal("on"),
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { error: "Vul je Apple Account en app-specifieke wachtwoord in en bevestig het delen van de werkagenda." };
  if (!await rateLimit(`apple-connect:${user.id}`, 5, 900, { strikt: true })) return { error: "Te veel pogingen. Wacht een kwartier en probeer opnieuw." };
  try {
    await connectApple(user.id, input.data.account, input.data.password);
    refresh();
    return { success: "Apple Agenda is gekoppeld. De eerste synchronisatie start binnen vijf minuten." };
  } catch (error) { return { error: errorText(error) }; }
}

export async function syncAppleAction(): Promise<AppleFormState> {
  const user = await requireAdmin();
  if (!await rateLimit(`apple-sync:${user.id}`, 1, 60, { strikt: true })) return { error: "Wacht een minuut voordat je opnieuw synchroniseert." };
  try {
    const result = await syncAppleCalendar(); refresh();
    return { success: result.issues ? "Synchronisatie uitgevoerd. Controleer de aandachtspunten hieronder." :
      result.remaining ? "Een deel is verwerkt. De volgende synchronisatie gaat verder." : "De werkagenda is bijgewerkt." };
  } catch (error) { refresh(); return { error: errorText(error) }; }
}

export async function disconnectAppleAction(): Promise<AppleFormState> {
  const user = await requireAdmin();
  try { await disconnectApple(user.id); refresh(); return { success: "Koppeling gestopt. Bestaande afspraken blijven bewaard." }; }
  catch (error) { return { error: errorText(error) }; }
}

export async function resolveAppleConflict(id: string, source: "crm" | "apple"): Promise<void> {
  const user = await requireAdmin();
  z.string().uuid().parse(id); z.enum(["crm", "apple"]).parse(source);
  // Serialize the decision with the sync lease. The following run applies it with an ETag.
  await db.transaction(async tx => {
    const [connection] = await tx.select().from(connections).where(eq(connections.id, "team")).for("update");
    if (!connection || (connection.lockUntil && connection.lockUntil > new Date())) throw new Error("Er loopt al een synchronisatie.");
    await tx.update(mappings).set({ resolution: source }).where(and(eq(mappings.id, id), eq(mappings.connectionId, "team"), eq(mappings.issue, "conflict")));
  });
  console.info("[apple-calendar] conflict decision", { actorId: user.id, mappingId: id, source });
  refresh();
}
