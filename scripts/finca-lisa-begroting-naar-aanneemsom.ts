/**
 * Finca Lisa: begroting terugbrengen naar de aanneemsom van € 361.000 excl. BTW
 * (10-08-2026). De vastgezette bedragen (sloop 42.500, constructief 32.500,
 * kozijnen 42.000, keuken 18.000) blijven staan; de € 24.000 komt uit de
 * flexibelere posten:
 *   Ruwbouw / binnenmuren   20.000 → 15.000  (−5.000, was afgeleide schatting)
 *   Infinity pool           60.000 → 55.000  (−5.000)
 *   Overige buitenwerken    12.000 →  8.000  (−4.000)
 *   Terrassen               25.000 → 22.000  (−3.000)
 *   Tuin / landscaping      15.000 → 12.000  (−3.000)
 *   Badkamers               24.000 → 22.000  (−2.000)
 *   Vloeren gehele woning   15.000 → 13.000  (−2.000)
 * Onvoorzien herrekend: 8% over € 361.000 = € 28.880.
 */
import "./load-env";
import { db } from "../lib/db";
import { projectBudgetLines, projectPhases } from "../lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

const PROJECT_ID = "7b06cf54-d07e-420e-aa6a-bb6e85628e0a";

async function main() {
  await db.transaction(async (tx) => {
    const zet = (id: string, amountEur: string) =>
      tx.update(projectBudgetLines).set({ amountEur }).where(eq(projectBudgetLines.id, id));

    // Ruwbouw-regel is net aangemaakt zonder bekend id → op fase selecteren.
    await tx.update(projectBudgetLines)
      .set({ amountEur: "15000.00" })
      .where(and(
        eq(projectBudgetLines.projectId, PROJECT_ID),
        eq(projectBudgetLines.phase, "Ruwbouw / binnenmuren"),
      ));

    await zet("a5cf2f2b-50bc-4a06-b11b-cbc8afe27191", "55000.00"); // Infinity pool
    await zet("f385039a-ce94-4186-8538-b4fbf8e48d63", "8000.00"); // Overige buitenwerken
    await zet("18676894-fb61-4dc1-a067-7dd153205ca2", "22000.00"); // Terrassen
    await zet("cc83efed-31e9-4f5d-b11f-2471ef3ae9de", "12000.00"); // Tuin / landscaping
    await zet("31a9e9bc-66bf-48bd-aef4-c4903e2a728b", "22000.00"); // Badkamers
    await zet("293dc19d-4541-40b1-a13f-8604cc2879b5", "13000.00"); // Vloeren

    await tx.update(projectBudgetLines)
      .set({ amountEur: "28880.00", note: "8% over het begrote werk van € 361.000." })
      .where(eq(projectBudgetLines.id, "5f6cf194-60c8-4ee9-acac-eb33e03fe38b")); // Onvoorzien
  });

  /* controle */
  const fases = await db.select().from(projectPhases)
    .where(eq(projectPhases.projectId, PROJECT_ID)).orderBy(asc(projectPhases.sortOrder));
  const regels = await db.select().from(projectBudgetLines)
    .where(eq(projectBudgetLines.projectId, PROJECT_ID));
  let totaal = 0;
  for (const f of fases) {
    const bedrag = regels.filter((r) => (r.phase ?? "").trim() === f.name)
      .reduce((s, r) => s + Number(r.amountEur ?? 0), 0);
    totaal += bedrag;
    console.log(`[${String(f.sortOrder).padStart(2)}] ${f.name.padEnd(45)} € ${bedrag.toLocaleString("nl-NL")}`);
  }
  const onvoorzien = 28880;
  console.log("Werk excl. onvoorzien:", (totaal - onvoorzien).toLocaleString("nl-NL"), "(aanneemsom: 361.000)");
  console.log("Totaal incl. onvoorzien:", totaal.toLocaleString("nl-NL"));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
