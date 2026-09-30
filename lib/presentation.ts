import { z } from "zod";

export const PRESENTATION_MODES = {
  first_order: "Volledig bij de eerste order",
  spread: "Gespreid verrekenen",
  free: "Gratis presentatiepakket",
  contribution: "Gedeeltelijke bijdrage",
} as const;

// Bedragen in centen; geen stille afronding of onduidelijke duizendtalscheiding.
export function cents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) throw new Error("Vul een positief bedrag in met maximaal twee decimalen.");
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export const euros = (value: number) => (value / 100).toFixed(2);
const money = z.string().transform((v, ctx) => {
  try { return cents(v); } catch { ctx.addIssue({ code: "custom", message: "Controleer de bedragen (maximaal twee decimalen)." }); return z.NEVER; }
});
export const presentationSchema = z.object({
  contactId: z.string().uuid(),
  version: z.coerce.number().int().nonnegative(),
  mode: z.enum(["first_order", "spread", "free", "contribution"]),
  title: z.string().trim().min(2, "Geef het pakket een naam.").max(160),
  value: money,
  contribution: money,
  cost: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    try { return cents(v); } catch { ctx.addIssue({ code: "custom", message: "Controleer de kostprijs." }); return z.NEVER; }
  }),
  paid: money,
  rate: z.coerce.number().min(0).max(100).multipleOf(0.01),
  minimumOrder: money,
  remainder: z.enum(["minimum", "carry"]),
  expires: z.string().refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), "Controleer de vervaldatum."),
  terms: z.string().trim().min(3, "Beschrijf wat inbegrepen is en welke voorwaarden gelden.").max(6000),
}).superRefine((d, ctx) => {
  if (d.value <= 0) ctx.addIssue({ code: "custom", message: "De pakketwaarde moet groter dan nul zijn." });
  if (d.contribution > d.value) ctx.addIssue({ code: "custom", message: "De bijdrage kan niet hoger zijn dan de pakketwaarde." });
  if (d.mode === "contribution" && (d.contribution <= 0 || d.contribution >= d.value)) ctx.addIssue({ code: "custom", message: "Een gedeeltelijke bijdrage ligt tussen nul en de pakketwaarde." });
  if (d.mode === "spread" && d.rate <= 0) ctx.addIssue({ code: "custom", message: "Kies een verrekenpercentage groter dan nul." });
  const charge = d.mode === "free" ? 0 : d.mode === "contribution" ? d.value - d.contribution : d.value;
  if (d.paid > charge) ctx.addIssue({ code: "custom", message: "Ontvangen betaling is hoger dan de klantbijdrage." });
});
export type PresentationInput = z.output<typeof presentationSchema>;
export function presentationAmounts(d: Pick<PresentationInput, "mode" | "value" | "contribution">) {
  const contribution = d.mode === "free" ? d.value : d.mode === "contribution" ? d.contribution : 0;
  return { contribution, charge: d.value - contribution, credit: d.mode === "first_order" || d.mode === "spread" ? d.value : 0 };
}
export function redemptionLimit(d: {
  mode: string; credit: number; used: number; paid: number; charge: number;
  rate: number; minimum: number; remainder: string; expires: string | null;
}, order: number, today: string): number {
  if (d.mode !== "first_order" && d.mode !== "spread") throw new Error("Deze regeling heeft geen verrekenbaar tegoed.");
  if (d.paid < d.charge) throw new Error("Registreer eerst de volledige betaling van het presentatiepakket.");
  if (d.expires && d.expires < today) throw new Error("Het tegoed is verlopen. Pas eerst de afspraak aan indien verlenging is goedgekeurd.");
  const remaining = Math.max(0, d.credit - d.used);
  if (!remaining) throw new Error("Het tegoed is volledig gebruikt.");
  if (order <= 0 || order < d.minimum) throw new Error("De order voldoet niet aan het afgesproken minimumbedrag.");
  if (d.mode === "first_order" && d.remainder === "minimum" && order < remaining) throw new Error("De order moet groot genoeg zijn om het volledige tegoed te verrekenen.");
  return d.mode === "spread" ? Math.min(remaining, Math.floor(order * d.rate / 100)) : Math.min(remaining, order);
}
