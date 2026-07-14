/**
 * Vul project "Het palijsje" (George Gershwin 39c) aan met de verkoop- en
 * inkoopfacturen tot op heden (aangeleverd 2026-07-13), zodat de begroting
 * met Hans op complete cijfers kan bouwen.
 *
 * Verkoop:
 *  - CN260011 (Habitat → Frontera, creditnota) — uit Holded gehaald zodat de
 *    holdedId klopt; bedragen genormaliseerd naar positief (in Holded met een
 *    minteken ingevoerd, maar de CRM-conventie is positief + kind=creditnote).
 *  - F260008 (Creadores Sorprendentes → Frontera, extern — niet in Habitat-Holded).
 *
 * Inkoop (alles gekoppeld aan het project):
 *  - Zerghini Abdelmjid factura nº 1 — anticipo €5.000 ex btw (PO als arbeid +
 *    lump-sum urenregel; vervangt de losse projectkost "voorschot op werkzaamheden").
 *  - Zerghini Abdelmjid factura nº 2 — mano de obra €3.016 ex btw, urenstaat
 *    week 06–10 juli (PO als arbeid + urenregel per man à €26/u).
 *  - Ovidi Faus Bertomeu factura 06_25 — levantamiento de planos €800 ex btw (PO materiaal/diensten).
 *
 * Gebruik:  npx tsx scripts/import-gershwin-invoices.ts          (dry-run)
 *           npx tsx scripts/import-gershwin-invoices.ts --apply  (schrijven)
 */
import "./load-env";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "../lib/db";
import { documents, projects, projectCosts, purchaseOrders, timeEntries } from "../lib/db/schema";
import { holded } from "../lib/holded/client";
import { mapHoldedDocumentToLocal, upsertSyncMap } from "../lib/holded/sync";

const APPLY = process.argv.includes("--apply");
const PROJECT_ID = "e684ff29-6e36-42a3-b7bd-8aaf2c4d322a"; // Het palijsje
const FRONTERA_CONTACT_ID = "8e28e637-8ee8-4a96-b8d0-7a572813900f"; // zelfde contact als FAC-2026-0013/0020

function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}

async function main() {
  const [proj] = await db.select().from(projects).where(eq(projects.id, PROJECT_ID));
  if (!proj) throw new Error("Project 'Het palijsje' niet gevonden");
  log("project", `${proj.name} (${proj.id}) — dry-run: ${!APPLY}`);

  /* ---------------------------------------------- 1. CN260011 uit Holded */
  const existingCn = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.docNumber, "CN260011"), eq(documents.kind, "creditnote")));
  if (existingCn.length) {
    log("CN260011", `bestaat al (${existingCn[0].id}) — overslaan`);
  } else {
    const remote = await holded.documents.list("creditnote");
    const rd = remote.find((d) => d.docNumber?.trim() === "CN260011");
    if (!rd) {
      log("CN260011", "NIET gevonden in Holded! (handmatig toevoegen?)");
    } else {
      const data = mapHoldedDocumentToLocal(rd, "creditnote");
      // In Holded met minbedragen ingevoerd; CRM-conventie = positieve creditnota.
      const abs = (v: unknown) => String(Math.abs(Number(v ?? 0)));
      const values = {
        ...data,
        kind: "creditnote" as const,
        subtotalEur: abs(data.subtotalEur),
        taxEur: abs(data.taxEur),
        totalEur: abs(data.totalEur),
        paidEur: abs(data.paidEur),
        items: (data.items ?? []).map((it) => ({
          ...it,
          price: Math.abs(Number(it.price ?? 0)),
        })),
        projectId: PROJECT_ID,
        contactId: FRONTERA_CONTACT_ID,
        notes: [
          data.notes,
          "In Holded met minbedragen ingevoerd (boeking correct); hier positief conform CRM-conventie. Verrekent dubbel gefactureerde posten van Creadores F260008 (badkamer, binnendeuren, buitendeur) op FAC-2026-0013.",
        ]
          .filter(Boolean)
          .join(" — "),
      };
      log(
        "CN260011",
        `Holded ${rd.id}: status=${values.status}, subtotaal=${values.subtotalEur}, btw=${values.taxEur}, totaal=${values.totalEur}, betaald=${values.paidEur}, datum=${values.issueDate}`,
      );
      if (APPLY) {
        const [row] = await db.insert(documents).values(values).returning({ id: documents.id });
        await upsertSyncMap({ entityType: "document", localId: row.id, holdedId: rd.id, direction: "pull", payload: rd });
        log("CN260011", `aangemaakt: ${row.id}`);
      }
    }
  }

  /* ------------------------------- 2. F260008 (Creadores, extern) */
  const existingF = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.docNumber, "F260008"), eq(documents.projectId, PROJECT_ID)));
  if (existingF.length) {
    log("F260008", `bestaat al op dit project (${existingF[0].id}) — overslaan`);
  } else {
    const values = {
      kind: "invoice" as const,
      docNumber: "F260008",
      title: "Creadores Sorprendentes SL — F260008 (extern)",
      status: "paid" as const,
      issueDate: "2026-01-16",
      dueDate: "2026-01-31",
      currency: "EUR",
      subtotalEur: "20578.96",
      taxEur: "0",
      totalEur: "20578.96",
      paidEur: "20578.96",
      vatReverseCharge: true,
      items: [
        { name: "Warmtepomp compleet", units: 1, price: 14353.96, taxRate: 0 },
        { name: "Badkamer artikelen", units: 1, price: 1725, taxRate: 0 },
        { name: "Binnen deur inclusief beslag", units: 7, price: 500, taxRate: 0 },
        { name: "Buiten deur inclusief beslag", units: 1, price: 1000, taxRate: 0 },
      ],
      projectId: PROJECT_ID,
      contactId: FRONTERA_CONTACT_ID,
      notes:
        "Externe verkoopfactuur van Creadores Sorprendentes SL (eigen administratie, niet in Habitat-Holded). BTW verlegd (art. 84.Uno.2º LIVA). Status 'betaald' aangenomen (CN260011 verwijst naar deze factuur als reeds berekend) — corrigeer indien nog open. Handmatig geïmporteerd 13-07-2026.",
    };
    log("F260008", `invoegen: subtotaal ${values.subtotalEur}, btw verlegd, status=paid (aangenomen)`);
    if (APPLY) {
      const [row] = await db.insert(documents).values(values).returning({ id: documents.id });
      log("F260008", `aangemaakt: ${row.id}`);
    }
  }

  /* ---------------- 3. Zerghini factura nº 1 — anticipo €5.000 ex btw */
  const existingPo1 = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(ilike(purchaseOrders.supplier, "%zerghini%"), eq(purchaseOrders.reference, "Factura nº 1")));
  if (existingPo1.length) {
    log("Zerghini-1", `PO bestaat al (${existingPo1[0].id}) — overslaan`);
  } else {
    log("Zerghini-1", "PO (arbeid) €5.000 ex / €6.050 incl + lump-sum urenregel; losse projectkost 'voorschot op werkzaamheden' €5.000 wordt vervangen");
    if (APPLY) {
      const [po] = await db
        .insert(purchaseOrders)
        .values({
          supplier: "Zerghini Abdelmjid",
          reference: "Factura nº 1",
          projectId: PROJECT_ID,
          countAsLabor: true,
          status: "received",
          currency: "EUR",
          orderDate: "2026-07-07",
          subtotal: "5000.00",
          tax: "1050.00",
          total: "6050.00",
          items: [{ name: "Anticipo por trabajos realizados — Villa Gershwin 39c, Jávea", units: 1, unitPrice: 6050 }],
          notes: "Handgeschreven factura nº 1 d.d. 07-07-2026 (NIE Z0413505Q / NIF B24855603 op briefhoofd). Urenrapport volgt per week. Geïmporteerd 13-07-2026.",
        })
        .returning({ id: purchaseOrders.id });
      await db.insert(timeEntries).values({
        projectId: PROJECT_ID,
        workerName: "Zerghini Abdelmjid (ploeg)",
        date: "2026-07-07",
        hours: "1",
        hourlyCostEur: "5000.00",
        paymentMethod: "invoice",
        purchaseOrderId: po.id,
        note: "Anticipo factura nº 1 — lump sum, kost ex btw (1 post, geen echte uren)",
      });
      // Placeholder-kost vervangen om dubbeltelling te voorkomen.
      const removed = await db
        .delete(projectCosts)
        .where(
          and(
            eq(projectCosts.projectId, PROJECT_ID),
            eq(projectCosts.amountEur, "5000.00"),
            eq(projectCosts.description, "voorschot op werkzaamheden"),
          ),
        )
        .returning({ id: projectCosts.id });
      log("Zerghini-1", `PO ${po.id} + urenregel aangemaakt; ${removed.length} losse kost(en) verwijderd`);
    }
  }

  /* -------- 4. Zerghini factura nº 2 — urenstaat week 06–10 juli, €26/u */
  const existingPo2 = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(ilike(purchaseOrders.supplier, "%zerghini%"), eq(purchaseOrders.reference, "Factura nº 2")));
  if (existingPo2.length) {
    log("Zerghini-2", `PO bestaat al (${existingPo2[0].id}) — overslaan`);
  } else {
    const crew: Array<[string, number]> = [
      ["Hicham", 32],
      ["Bilal", 22],
      ["Morad", 30],
      ["Anwar", 32],
    ];
    const totalHours = crew.reduce((s, [, h]) => s + h, 0); // 116
    log("Zerghini-2", `PO (arbeid) €3.016 ex / €3.649,36 incl + ${crew.length} urenregels (${totalHours}u à €26)`);
    if (APPLY) {
      const [po] = await db
        .insert(purchaseOrders)
        .values({
          supplier: "Zerghini Abdelmjid",
          reference: "Factura nº 2",
          projectId: PROJECT_ID,
          countAsLabor: true,
          status: "received",
          currency: "EUR",
          orderDate: "2026-07-10",
          subtotal: "3016.00",
          tax: "633.36",
          total: "3649.36",
          items: [{ name: "Mano de obra Balcón al Mar (Gershwin 39c) — week 06–10 juli, 116 uur à €26", units: 1, unitPrice: 3649.36 }],
          notes: "Handgeschreven factura nº 2 + urenstaat 'BACON DEL MAR — Gershwin 39c' (Hicham 32u, Bilal 22u, Morad 30u, Anwar 32u). Geïmporteerd 13-07-2026.",
        })
        .returning({ id: purchaseOrders.id });
      for (const [name, hours] of crew) {
        await db.insert(timeEntries).values({
          projectId: PROJECT_ID,
          workerName: name,
          date: "2026-07-10",
          hours: String(hours),
          hourlyCostEur: "26.00",
          paymentMethod: "invoice",
          purchaseOrderId: po.id,
          note: "Week 06–10 juli — urenstaat bij Zerghini factura nº 2",
        });
      }
      log("Zerghini-2", `PO ${po.id} + ${crew.length} urenregels aangemaakt`);
    }
  }

  /* ---------------- 5. Ovidi Faus factura 06_25 — planos €800 ex btw */
  const existingPo3 = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(ilike(purchaseOrders.supplier, "%ovidi%"), eq(purchaseOrders.reference, "06_25")));
  if (existingPo3.length) {
    log("Ovidi", `PO bestaat al (${existingPo3[0].id}) — overslaan`);
  } else {
    log("Ovidi", "PO €800 ex / €968 incl (levantamiento de planos, 26-05-2025)");
    if (APPLY) {
      const [po] = await db
        .insert(purchaseOrders)
        .values({
          supplier: "Ovidi Faus Bertomeu",
          reference: "06_25",
          projectId: PROJECT_ID,
          countAsLabor: false,
          status: "received",
          currency: "EUR",
          orderDate: "2025-05-26",
          subtotal: "800.00",
          tax: "168.00",
          total: "968.00",
          items: [{ name: "Levantamiento de planos — Ur. Balcón al Mar C 39, Jávea", units: 1, unitPrice: 968 }],
          notes: "Arquitecto técnico (nº col. 6472), gefactureerd aan Creadores Sorprendentes SL. Geïmporteerd 13-07-2026.",
        })
        .returning({ id: purchaseOrders.id });
      log("Ovidi", `PO ${po.id} aangemaakt`);
    }
  }

  /* -------- 6b. Ontvangen betalingen (xlsx "verkoop fact en betalingen") */
  const payments: Array<{ date: string; amount: string; description: string }> = [
    { date: "2026-01-20", amount: "20578.96", description: "Factuur F260008 (Creadores)" },
    { date: "2026-06-23", amount: "26398.41", description: "Factuur F260017 minus creditnota CN260011 (Habitat)" },
    { date: "2026-06-24", amount: "21498.38", description: "Factuur F260018 (Habitat)" },
  ];
  const { projectPayments } = await import("../lib/db/schema");
  const existingPays = await db
    .select({ amountEur: projectPayments.amountEur })
    .from(projectPayments)
    .where(eq(projectPayments.projectId, PROJECT_ID));
  const haveAmounts = new Set(existingPays.map((p) => String(p.amountEur)));
  for (const p of payments) {
    if (haveAmounts.has(p.amount)) {
      log("betaling", `${p.amount} bestaat al — overslaan`);
      continue;
    }
    log("betaling", `${p.date} — €${p.amount} — ${p.description}`);
    if (APPLY) {
      await db.insert(projectPayments).values({
        projectId: PROJECT_ID,
        date: p.date,
        amountEur: p.amount,
        method: "bank",
        description: p.description,
        note: "Uit 'het Palijsje verkoop fact en betalingen.xlsx', geïmporteerd 13-07-2026",
      });
    }
  }

  /* -------------------- 6. siteAlias voor automatische factuurherkenning */
  if (!proj.siteAlias) {
    const alias = "Gershwin 39c, Villa Gershwin, Balcón al Mar C 39, Bacon del Mar";
    log("siteAlias", `zetten: "${alias}"`);
    if (APPLY) {
      await db.update(projects).set({ siteAlias: alias, updatedAt: new Date() }).where(eq(projects.id, PROJECT_ID));
    }
  }

  log("klaar", APPLY ? "alles weggeschreven" : "dry-run — niets gewijzigd (draai met --apply)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
