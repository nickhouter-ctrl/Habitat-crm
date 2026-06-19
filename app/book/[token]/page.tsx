import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { BookSlotPicker } from "@/components/book-slot-picker";

export const dynamic = "force-dynamic";

const DONE: Record<string, { title: string; body: string }> = {
  nl: { title: "Al bevestigd", body: "Deze afspraak is al ingepland. Heb je een vraag? Mail ons gerust op hi@habitat-one.com." },
  en: { title: "Already confirmed", body: "This appointment has already been scheduled. Any questions? Email us at hi@habitat-one.com." },
  es: { title: "Ya confirmada", body: "Esta cita ya está programada. ¿Preguntas? Escríbenos a hi@habitat-one.com." },
  de: { title: "Bereits bestätigt", body: "Dieser Termin ist bereits geplant. Fragen? Schreib uns an hi@habitat-one.com." },
};

export default async function BookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.bookingToken, token) });

  const locale = req?.locale && DONE[req.locale] ? req.locale : "nl";
  const slots = req?.proposedSlots ?? [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="mb-7 text-center text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
          Habitat One
        </p>
        {!req || slots.length === 0 ? (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-stone-800">{DONE[locale].title}</h1>
            <p className="mt-3 text-stone-500">{DONE[locale].body}</p>
          </div>
        ) : req.status === "accepted" ? (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-stone-800">{DONE[locale].title}</h1>
            <p className="mt-3 text-stone-500">{DONE[locale].body}</p>
          </div>
        ) : (
          <BookSlotPicker token={token} slots={slots} locale={locale} />
        )}
      </div>
    </main>
  );
}
