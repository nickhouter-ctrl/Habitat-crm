import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest — unit tests voor rekenlogica (phash, Wilson lower bound, empirical
 * Bayes) en de creative-rendertests uit de marketingmodule (brief §6b).
 * Testbestanden: *.test.ts(x), naast de code die ze testen.
 */
export default defineConfig({
  resolve: {
    // Zelfde alias als tsconfig.json ("@/*" → projectroot).
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "drizzle"],
    // Zolang er nog geen testbestanden zijn mag `npm test` niet rood zijn.
    passWithNoTests: true,
  },
});
