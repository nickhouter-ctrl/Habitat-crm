/**
 * Seed script — creates an admin user and (on an empty database) some sample
 * data so the UI isn't blank. Idempotent: re-running only re-sets the admin
 * password; sample data is skipped if contacts already exist.
 *
 *   npm run db:seed
 *
 * Env (optional): SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
import "./load-env"; // must be first — loads .env.local before lib/db is evaluated

import { count } from "drizzle-orm";

import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db";
import { contacts, deals, properties, users } from "../lib/db/schema";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@habitat.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "habitat1234";
  const passwordHash = await hashPassword(password);

  const [admin] = await db
    .insert(users)
    .values({ name: "Habitat Admin", email, passwordHash, role: "admin" })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, role: "admin" },
    })
    .returning({ id: users.id });
  console.log(`✓ admin user ready — ${email} / ${password}`);

  const [{ n }] = await db.select({ n: count() }).from(contacts);
  if (n > 0) {
    console.log(`• ${n} contact(s) already present — skipping sample data`);
    return;
  }

  const [montgo] = await db
    .insert(properties)
    .values({
      title: "Villa Montgó — Xàbia",
      reference: "HAB-001",
      slug: "villa-montgo-xabia",
      type: "villa",
      status: "available",
      priceEur: "1450000",
      bedrooms: 4,
      bathrooms: 3,
      builtSqm: 320,
      plotSqm: 1200,
      location: "Xàbia — Montgó",
      description: "Mediterrane villa met zeezicht, te renoveren.",
      ownerId: admin.id,
      isPublished: true,
    })
    .returning({ id: properties.id });

  const sampleContacts = await db
    .insert(contacts)
    .values([
      {
        name: "Familie Janssen",
        firstName: "Pieter",
        lastName: "Janssen",
        email: "pieter.janssen@example.com",
        mobile: "+34 600 111 222",
        type: "lead",
        stage: "qualified",
        source: "website",
        preferredLanguage: "nl",
        city: "Xàbia",
        ownerId: admin.id,
      },
      {
        name: "Anna Müller",
        firstName: "Anna",
        lastName: "Müller",
        email: "anna.mueller@example.de",
        type: "customer",
        source: "doorverwijzing",
        preferredLanguage: "de",
        ownerId: admin.id,
      },
      {
        name: "Construcciones del Montgó SL",
        type: "supplier",
        email: "info@construccionesmontgo.example",
        preferredLanguage: "es",
        city: "Dénia",
        ownerId: admin.id,
      },
    ])
    .returning({ id: contacts.id });

  await db.insert(deals).values([
    {
      title: "Renovatie villa Montgó",
      type: "renovation",
      stage: "proposal",
      valueEur: "180000",
      probability: 55,
      contactId: sampleContacts[0].id,
      propertyId: montgo.id,
      ownerId: admin.id,
      expectedCloseDate: "2026-07-15",
      description: "Volledige renovatie keuken + badkamers, nieuw terras.",
    },
    {
      title: "Materiaallevering tegels",
      type: "material_supply",
      stage: "qualified",
      valueEur: "12500",
      probability: 40,
      contactId: sampleContacts[1].id,
      ownerId: admin.id,
    },
  ]);

  console.log("✓ sample property, contacts and deals inserted");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
