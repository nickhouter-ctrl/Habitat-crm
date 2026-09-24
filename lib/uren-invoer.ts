/**
 * Wat een formulier over een urenregel mag zeggen.
 *
 * Staat hier en niet in `app/(app)/projects/actions.ts`, omdat een "use server"
 * bestand alleen acties mag exporteren en deze regels juist te testen moeten
 * zijn. Ze zijn het verschil tussen een kloppende en een stille verandering:
 *
 *  - **toevoegen** zonder betaalwijze → "per factuur". Dat is de normale gang;
 *    contant is de uitzondering en wordt expliciet gekozen.
 *  - **bijwerken** zonder betaalwijze → NIET wijzigen. Hier stond eerst
 *    `.default("cash")` terwijl het bewerkformulier dat veld niet meestuurde:
 *    wie uren of een tarief bijwerkte, zette de regel ongemerkt op contant.
 *    Zo stonden factuurregels van Ahmed en Pieter als contant in de boeken en
 *    klopte het contant-totaal op de projectpagina niet.
 */
import { z } from "zod";

export const timeEntrySchema = z.object({
  workerId: z.string().trim().optional(),
  date: z.string().trim().min(1, "Datum is verplicht"),
  hours: z.string().trim().min(1, "Uren zijn verplicht"),
  hourlyCostEur: z.string().trim().optional(),
  paymentMethod: z.enum(["cash", "invoice"]).default("invoice"),
  note: z.string().trim().optional(),
});

export const timeEntryUpdateSchema = z.object({
  date: z.string().trim().optional(),
  hours: z.string().trim().min(1, "Uren zijn verplicht"),
  hourlyCostEur: z.string().trim().min(1, "Tarief is verplicht"),
  paymentMethod: z.enum(["cash", "invoice"]).optional(),
  note: z.string().trim().optional(),
});
