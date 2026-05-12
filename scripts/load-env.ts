/**
 * Load .env / .env.local into process.env. Import this *first* in standalone
 * scripts (before any module that reads env vars), so it runs before those
 * modules are evaluated. (Next.js handles this for the app itself.)
 */
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* not present — fine */
  }
}
