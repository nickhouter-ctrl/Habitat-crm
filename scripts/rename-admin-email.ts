import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";

const FROM = "admin@habitat.local";
const TO = "nick@habitat-one.com"; // login lowercaset altijd → lowercase opslaan

(async () => {
  const current = await db.query.users.findFirst({ where: eq(users.email, FROM) });
  if (!current) {
    console.error(`Geen gebruiker gevonden met e-mail ${FROM}. Afgebroken.`);
    process.exit(1);
  }
  const taken = await db.query.users.findFirst({ where: eq(users.email, TO) });
  if (taken && taken.id !== current.id) {
    console.error(`E-mail ${TO} is al in gebruik (id ${taken.id}). Afgebroken.`);
    process.exit(1);
  }

  console.log("Voor:", { id: current.id, name: current.name, email: current.email, role: current.role });
  await db.update(users).set({ email: TO }).where(eq(users.id, current.id));
  const after = await db.query.users.findFirst({ where: eq(users.id, current.id) });
  console.log("Na:  ", { id: after?.id, name: after?.name, email: after?.email, role: after?.role });
  console.log("✓ Klaar — log voortaan in met", TO, "(zelfde wachtwoord).");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
