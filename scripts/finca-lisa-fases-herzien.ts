/**
 * Finca Lisa (7b06cf54): fase-indeling en begroting herzien — 10-08-2026.
 *
 * - Jacuzzi en Outdoor kitchen vervallen (fase + begrotingsregel).
 * - Sloop & strippen → € 42.500 · Constructieve aanpassingen → € 32.500.
 * - "Kozijnen / ramen / ruwbouw" → "Kozijnen & ramen" à € 42.000; het
 *   ruwbouwdeel gaat als eigen fase "Ruwbouw / binnenmuren" à € 20.000
 *   (restant van de oorspronkelijke € 62.000).
 * - Installaties gesplitst in Installatie elektra / Loodgieterij / Airco;
 *   Schilderwerk en Verlichting gesplitst — bestaande regels verhuizen mee,
 *   voortgang van de oude gecombineerde fase blijft staan.
 * - Vloeren gehele woning en Binnendeuren & interieur maatwerk worden eigen
 *   fases (regels verhuizen uit Afwerking resp. Keuken).
 * - Keuken blijft € 18.000 als stelpost, met notitie dat hij hoger kan uitvallen.
 * - Badkamers: omschrijving vermeldt sanitair, meubels en tegelwerk.
 * - Onvoorzien (8%) wordt zichtbaar als fase: 8% over € 385.000 = € 30.800.
 */
import "./load-env";
import { db } from "../lib/db";
import { projectPhases, projectBudgetLines } from "../lib/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";

const PROJECT_ID = "7b06cf54-d07e-420e-aa6a-bb6e85628e0a";
const SECTIE_WONING = "Woning — binnenwerk";

async function main() {
  await db.transaction(async (tx) => {
    /* -------- fases: hernoemen bestaande, nieuwe toevoegen, twee weg -------- */

    // Verwijderen: Jacuzzi + Outdoor kitchen (fase én begrotingsregel).
    await tx.delete(projectPhases).where(
      inArray(projectPhases.id, [
        "c73f80a0-1993-493e-8a8a-a378d08ca91f", // Outdoor kitchen
        "e1b66cb1-9fb3-418b-ad03-2aac77f0cb6d", // Jacuzzi
      ]),
    );
    await tx.delete(projectBudgetLines).where(
      inArray(projectBudgetLines.id, [
        "592a261b-9ee1-4213-90af-4ffc8ce51120", // Outdoor kitchen
        "e8f3c194-e81b-4cc9-8e62-c8e0f31cd469", // Jacuzzi
      ]),
    );

    // Hernoemen (bestaande fase-id's houden hun voortgang).
    await tx.update(projectPhases)
      .set({ name: "Kozijnen & ramen" })
      .where(eq(projectPhases.id, "7eb66a55-0ccd-4931-8b0c-f2068fa1a762"));
    await tx.update(projectPhases)
      .set({ name: "Installatie elektra" })
      .where(eq(projectPhases.id, "46d897af-c82f-4d53-9831-a61453970dca"));
    await tx.update(projectPhases)
      .set({ name: "Schilderwerk" })
      .where(eq(projectPhases.id, "be0a9653-e8cd-4c7b-91d0-3725330a3dbf"));

    // Omschrijvingen op bestaande fases.
    await tx.update(projectPhases)
      .set({ description: "Sanitair, badkamermeubels, tegelwerk en toebehoren." })
      .where(eq(projectPhases.id, "91e836e5-9bc2-472c-abb8-c3de5e68a3c0")); // Badkamers
    await tx.update(projectPhases)
      .set({ description: "Stelpost: definitieve keuken kan hoger uitvallen." })
      .where(eq(projectPhases.id, "bc94c3b7-d568-4c67-bc05-9fc908d725d9")); // Keuken

    // Nieuwe fases. Voortgang erft van de fase waar het werk eerst in zat.
    const nieuweFases: (typeof projectPhases.$inferInsert)[] = [
      {
        projectId: PROJECT_ID,
        name: "Ruwbouw / binnenmuren",
        plannedWeeks: "Week 7–10 · 4 weken",
        progressPct: 75, // zat in "Kozijnen / ramen / ruwbouw" (75%)
      },
      {
        projectId: PROJECT_ID,
        name: "Loodgieterij",
        plannedWeeks: "Week 11–15 · 5 weken",
        progressPct: 50, // zat in de gecombineerde installatiefase (50%)
      },
      {
        projectId: PROJECT_ID,
        name: "Airco / ventilatie",
        plannedWeeks: "Week 11–15 · 5 weken",
        progressPct: 50,
      },
      {
        projectId: PROJECT_ID,
        name: "Binnendeuren & interieur maatwerk",
        progressPct: 25, // zat in "Keuken + maatwerk" (25%)
      },
      {
        projectId: PROJECT_ID,
        name: "Vloeren gehele woning",
        progressPct: 0, // zat in "Afwerking + opleverpunten" (0%)
      },
      {
        projectId: PROJECT_ID,
        name: "Verlichting",
        plannedWeeks: "Week 24–25 · 2 weken",
        progressPct: 50, // zat in "Schilderwerk + verlichting" (50%)
      },
      {
        projectId: PROJECT_ID,
        name: "Onvoorzien (8%)",
        description: "Onvoorzien / meerwerkreserve — 8% over het begrote werk.",
        progressPct: 0,
      },
    ];
    await tx.insert(projectPhases).values(nieuweFases);

    // Volgorde opnieuw nummeren.
    const volgorde = [
      "Sloop & strippen",
      "Constructieve aanpassingen",
      "Kozijnen & ramen",
      "Ruwbouw / binnenmuren",
      "Installatie elektra",
      "Loodgieterij",
      "Airco / ventilatie",
      "Stucwerk / plafonds / voorbereiding afwerking",
      "Badkamers + tegelwerk",
      "Keuken + maatwerk",
      "Binnendeuren & interieur maatwerk",
      "Vloeren gehele woning",
      "Schilderwerk",
      "Verlichting",
      "Afwerking + opleverpunten",
      "Infinity pool",
      "Terrassen",
      "Tuin / landscaping",
      "Buitenverlichting",
      "Overige buitenwerken",
      "Onvoorzien (8%)",
    ];
    for (let i = 0; i < volgorde.length; i++) {
      await tx.execute(sql`
        update project_phases set sort_order = ${i + 1}
        where project_id = ${PROJECT_ID} and name = ${volgorde[i]}
      `);
    }

    /* ---------------- begrotingsregels: bedragen + verhuizingen ------------- */

    const zetRegel = async (
      id: string,
      set: Partial<typeof projectBudgetLines.$inferInsert>,
    ) => tx.update(projectBudgetLines).set(set).where(eq(projectBudgetLines.id, id));

    await zetRegel("46a25718-8b22-4273-a741-442e2e5f98e2", { amountEur: "42500.00" }); // Sloop
    await zetRegel("b8520d3f-1246-4fd1-98f2-3a5f522061dc", { amountEur: "32500.00" }); // Constructief
    await zetRegel("c2b43a29-1295-435e-a23e-86a347a5479e", {
      phase: "Kozijnen & ramen",
      amountEur: "42000.00",
    });
    await zetRegel("59c42f9e-0f17-4a7a-b9ad-e905d3f2d18a", { phase: "Installatie elektra" });
    await zetRegel("118e042a-3a2f-4f51-8ed1-f15f6729321b", { phase: "Loodgieterij" });
    await zetRegel("79accf22-4ca3-40be-bd36-f447955198fd", { phase: "Airco / ventilatie" });
    await zetRegel("31a9e9bc-66bf-48bd-aef4-c4903e2a728b", {
      description: "Badkamers (3x) — sanitair, meubels, tegelwerk e.d.",
    });
    await zetRegel("80948587-7163-40ad-9e23-fba074d45c67", {
      note: "Stelpost — definitieve keuken kan hoger uitvallen.",
    });
    await zetRegel("52b0a3a7-51b3-445c-875b-2758ebc8af7a", {
      phase: "Binnendeuren & interieur maatwerk",
    });
    await zetRegel("293dc19d-4541-40b1-a13f-8604cc2879b5", { phase: "Vloeren gehele woning" });
    await zetRegel("f0d95a73-8cce-46de-b555-b98ca9924794", { phase: "Schilderwerk" });
    await zetRegel("a7e509fd-a64d-4730-810d-c29b45d81510", { phase: "Verlichting" });

    // Onvoorzien: koppelen aan de nieuwe fase en herrekenen op 8%.
    await zetRegel("5f6cf194-60c8-4ee9-acac-eb33e03fe38b", {
      phase: "Onvoorzien (8%)",
      section: "Algemeen",
      amountEur: "30800.00",
      note: "8% over het begrote werk van € 385.000.",
      sortOrder: 300,
    });

    // Nieuwe regel voor het afgesplitste ruwbouwdeel.
    await tx.insert(projectBudgetLines).values({
      projectId: PROJECT_ID,
      category: "labor",
      section: SECTIE_WONING,
      phase: "Ruwbouw / binnenmuren",
      description: "Ruwbouw / binnenmuren",
      amountEur: "20000.00",
      sortOrder: 35,
    });
  });

  /* ------------------------------- controle ------------------------------- */
  const fases = await db.select().from(projectPhases)
    .where(eq(projectPhases.projectId, PROJECT_ID))
    .orderBy(asc(projectPhases.sortOrder));
  const regels = await db.select().from(projectBudgetLines)
    .where(eq(projectBudgetLines.projectId, PROJECT_ID));
  let totaal = 0;
  for (const f of fases) {
    const bedrag = regels
      .filter((r) => (r.phase ?? "").trim() === f.name)
      .reduce((s, r) => s + Number(r.amountEur ?? 0), 0);
    totaal += bedrag;
    console.log(
      `[${String(f.sortOrder).padStart(2)}] ${f.name.padEnd(45)} € ${bedrag.toLocaleString("nl-NL")} · ${f.progressPct}%`,
    );
  }
  const zwevend = regels.filter(
    (r) => !fases.some((f) => f.name === (r.phase ?? "").trim()),
  );
  console.log("Totaal begroot:", totaal.toLocaleString("nl-NL"));
  if (zwevend.length) {
    console.log("LET OP — regels zonder bestaande fase:");
    for (const r of zwevend) console.log("  ", r.phase, "·", r.description, "·", r.amountEur);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
