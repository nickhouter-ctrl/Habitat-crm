import { defineConfig } from "drizzle-kit";

// Next.js loads .env files for the app, but drizzle-kit runs standalone.
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file not present — fine */
  }
}

// `generate` only needs the schema; `migrate`/`push`/`studio` need a real URL.
const url =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/habitat_crm_unset";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
