import { z } from "zod";
export const registrationSchema = z
  .object({
    source: z.enum(["website", "windows"]).default("website"),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    kind: z.enum(["particulier", "zakelijk"]),
    businessName: z.string().trim().max(200).optional().or(z.literal("")),
    vatNumber: z.string().trim().max(60).optional().or(z.literal("")),
    address: z.string().trim().max(400).optional().or(z.literal("")),
    locale: z.enum(["nl", "de", "en", "es"]).optional(),
    message: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => v.source !== "windows" || v.kind === "zakelijk", { message: "Windows-accounts zijn alleen voor zakelijke klanten." })
  .refine((v) => v.kind !== "zakelijk" || (!!v.businessName && !!v.vatNumber), {
    message: "Bij een zakelijk account zijn bedrijfsnaam en IVA/BTW-nummer verplicht.",
  });
