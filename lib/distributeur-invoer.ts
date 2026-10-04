import { z } from "zod";
import { DEALER_STAFFELS, staffelMetId, type PrijsOpties } from "@/lib/distributeur-prijzen";
export const prijsVoorstelInvoer = z.object({
  staffel: z.enum(DEALER_STAFFELS.map(staffel => staffel.id)).default("start"),
  extra: z.coerce.number().finite().min(0).max(1000).default(0),
  serie: z.string().trim().max(160).default(""),
});
export function prijsOpties(value: z.infer<typeof prijsVoorstelInvoer>): PrijsOpties {
  return { staffelId: staffelMetId(value.staffel).id, extraKostenPerM2: value.extra };
}
