"use server";
/**
 * Openbaar: de klant reageert op een afspraakvoorstel. Geen login — het token
 * in de link geeft toegang tot precies dit ene voorstel, en alleen tot
 * reageren.
 */
import { z } from "zod";

import { klantAkkoord, klantKiest, klantStelVoor } from "@/lib/afspraak-reactie-db";

const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
const fout = { ok: false, fout: "ongeldig" } as const;

export async function akkoordAction(t: string) {
  const p = token.safeParse(t);
  return p.success ? klantAkkoord(p.data) : fout;
}

export async function kiesAction(t: string, index: number) {
  const p = z.object({ t: token, i: z.number().int().min(0).max(9) }).safeParse({ t, i: index });
  return p.success ? klantKiest(p.data.t, p.data.i) : fout;
}

export async function voorstelAction(t: string, opIso: string, bericht: string) {
  const p = z.object({ t: token, op: z.string().datetime({ offset: true }), bericht: z.string().max(1000) }).safeParse({ t, op: opIso, bericht });
  return p.success ? klantStelVoor(p.data.t, p.data.op, p.data.bericht) : fout;
}
