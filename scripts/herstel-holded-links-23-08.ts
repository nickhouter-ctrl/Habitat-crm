/**
 * Herstel verkeerde/dode Holded-koppelingen van inkooporders (23-08-2026).
 *
 * Gevonden via de nieuwe betaalsync-guards + handmatig onderzoek:
 *  - Stocktile 2026V205: gekoppeld aan verdwenen Holded-doc; het echte doc
 *    ("2026 V 205", € 10.913,15, betaald) staat ernaast.
 *  - Pieter/HM 260039: gekoppeld aan Holded-doc 260036 (verkeerd); echt doc
 *    260039 bestaat. Plus een reeks 260038–260049 die nooit gekoppeld is,
 *    terwijl nummer én bedrag exact in Holded staan.
 *  - Jaime Sirerol 14735/1: gekoppeld aan een leeg spook-doc (nr=null, € 0,
 *    status "betaald"); het echte doc 14735/1 (€ 1.599,09, onbetaald) bestaat.
 *  - Respekt Trans: koppeling klopt, alleen de referentie wijkt af van het
 *    Holded-nummer ("2026-07-28") waardoor de nummer-guard blokkeert.
 *  - Foshan Hanhai HANH002604010001: lokaal als € 16 geïmporteerd (parse-fout
 *    uit de Excel-bijlage); het Holded-doc is de echte factuur ($ 22.036,35
 *    via ALLPACK, deels betaald). Lokale bedragen worden op de EUR-omrekening
 *    van het Holded-doc gezet.
 *
 * Elke koppeling wordt vóór het schrijven geverifieerd tegen het live
 * Holded-doc (nummer + bedrag) — geest van guard 8c14574: nooit blind koppelen.
 * paid_at/paid_eur alleen vooruit. Idempotent. Dry-run standaard; --apply schrijft.
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { holded } from "@/lib/holded/client";

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Relink {
  poId: string;
  label: string;
  /** Nieuw (of te bevestigen) Holded-doc. */
  holdedId: string;
  /** Verwacht docNumber in Holded — moet exact kloppen. */
  expectNumber: string;
  /** Verwacht totaal (EUR) in Holded — moet op de cent na kloppen. */
  expectTotal: number;
  /** Nieuwe lokale referentie (= Holded-docNumber, zodat de nummer-guard slaagt). */
  newRef: string;
  /** Volledig betaald volgens Holded → paid_eur + paid_at zetten (alleen vooruit). */
  markPaid: number | null;
}

const RELINKS: Relink[] = [
  { poId: "ec2b77a5-2193-4d81-9f8d-86afe3367f10", label: "Stocktile 2026V205",   holdedId: "6a58d9b8be78558fb1056d98", expectNumber: "2026 V 205", expectTotal: 10913.15, newRef: "2026 V 205", markPaid: 10913.15 },
  { poId: "f4ed505f-1138-4738-9add-142f289da1fd", label: "Pieter/HM 260039",     holdedId: "6a5491747d1ac863490399a2", expectNumber: "260039",     expectTotal: 297.21,   newRef: "260039",     markPaid: 297.21 },
  { poId: "67bfcea8-925a-4926-a5bc-e7f77dc349f0", label: "Pieter/HM 260045",     holdedId: "6a5def9599be73fdc403eab5", expectNumber: "260045",     expectTotal: 819.0,    newRef: "260045",     markPaid: 819.0 },
  { poId: "81e8579e-80db-48a8-b89e-35150cd9ca17", label: "Jaime Sirerol 14735/1",holdedId: "6a7dd2fe8612070e2c065834", expectNumber: "14735/1",    expectTotal: 1599.09,  newRef: "14735/1",    markPaid: null },
  { poId: "b4597f8e-5193-486e-b65c-0dd7ca87340d", label: "Pieter/HM 260038",     holdedId: "6a54912d3cccb82ffb0d15bf", expectNumber: "260038",     expectTotal: 120.2,    newRef: "260038",     markPaid: 120.2 },
  { poId: "6183e57f-cb3c-4c5a-bde3-9114722e0e08", label: "Pieter/HM 260041",     holdedId: "6a5de63ba0185da762076196", expectNumber: "260041",     expectTotal: 121.97,   newRef: "260041",     markPaid: 121.97 },
  { poId: "6a55363c-eef9-4284-9a4f-57a8438ef73b", label: "Pieter/HM 260043",     holdedId: "6a5de6df175eeb7d3a00497e", expectNumber: "260043",     expectTotal: 69.93,    newRef: "260043",     markPaid: 69.93 },
  { poId: "7acdac9c-563f-45f8-bbde-5ab7c376cb1c", label: "Pieter/HM 260046",     holdedId: "6a676417327b737baf01589c", expectNumber: "260046",     expectTotal: 174.48,   newRef: "260046",     markPaid: 174.48 },
  { poId: "066c2d07-14a8-4f53-b5ff-37a1291ff614", label: "Pieter/HM 260047",     holdedId: "6a6764a1b4b3ef81240f4bb7", expectNumber: "260047",     expectTotal: 203.45,   newRef: "260047",     markPaid: 203.45 },
  { poId: "ef096bd7-9423-464e-aff5-62eb37a11390", label: "Pieter/HM 260048",     holdedId: "6a6764e8aca024f7bd0faedc", expectNumber: "260048",     expectTotal: 1397.55,  newRef: "260048",     markPaid: 1397.55 },
  { poId: "129949b0-20e8-430c-af25-fd3e1f0fdbfc", label: "Pieter/HM 260049",     holdedId: "6a6b4e94354d8dd78b0e4d37", expectNumber: "260049",     expectTotal: 260.85,   newRef: "260049",     markPaid: 260.85 },
  { poId: "44769410-dfdd-456b-bd93-bf1fbb804e86", label: "Pieter/HM 260040",     holdedId: "6a5491c5a1524fbe8f053a65", expectNumber: "260040",     expectTotal: 1706.1,   newRef: "260040",     markPaid: null },
  { poId: "71309d71-8ca6-493e-8bfd-89fa9510ae35", label: "Pieter/HM 260044",     holdedId: "6a5ded644843db19020e2a57", expectNumber: "260044",     expectTotal: 1421.75,  newRef: "260044",     markPaid: null },
];

/** Alleen referentie rechtzetten (koppeling klopt al). */
const REF_FIXES = [
  { poId: "1a0ce05f-ab5f-4608-a745-61038ff1c6f6", label: "Respekt Trans", holdedId: "6a64c3afd747af419503c19e", expectNumber: "2026-07-28", newRef: "2026-07-28" },
];

/** Foshan Hanhai: lokale bedragen op de EUR-omrekening van het Holded-doc zetten. */
const FOSHAN = {
  poId: "3f7d42b9-76ec-41ae-abdb-af3f9f2e0005",
  holdedId: "6a3d175c7c934f4d05033421",
  expectNumber: "HANH002604010001",
};

async function main() {
  let ok = 0, failed = 0;

  for (const c of RELINKS) {
    const d = (await holded.documents.get("purchase", c.holdedId)) as {
      docNumber?: string; total?: number; status?: number; currency?: string;
    };
    const nr = d.docNumber?.trim();
    const tot = r2(Number(d.total ?? 0));
    if (nr !== c.expectNumber || Math.abs(tot - c.expectTotal) > 0.02 || (d.currency ?? "eur").toLowerCase() !== "eur") {
      console.log(`❌ ${c.label}: Holded-doc ${c.holdedId} matcht niet (nr=${nr}, tot=${tot} ${d.currency}) — overgeslagen`);
      failed++;
      continue;
    }
    const paid = c.markPaid !== null && d.status === 1;
    console.log(`✔ ${c.label}: koppel aan ${c.holdedId} (nr ${nr}, € ${tot})${paid ? ` + betaald € ${c.markPaid}` : ""}`);
    if (APPLY) {
      await db.execute(sql`
        update purchase_orders set
          holded_id = ${c.holdedId},
          reference = ${c.newRef},
          paid_eur = ${paid ? sql`coalesce(paid_eur, ${String(c.markPaid)}::numeric)` : sql`paid_eur`},
          paid_at = ${paid ? sql`coalesce(paid_at, now())` : sql`paid_at`},
          updated_at = now()
        where id = ${c.poId}::uuid`);
    }
    ok++;
  }

  for (const c of REF_FIXES) {
    const d = (await holded.documents.get("purchase", c.holdedId)) as { docNumber?: string };
    if (d.docNumber?.trim() !== c.expectNumber) {
      console.log(`❌ ${c.label}: docNumber is ${d.docNumber}, niet ${c.expectNumber} — overgeslagen`);
      failed++;
      continue;
    }
    console.log(`✔ ${c.label}: referentie → "${c.newRef}"`);
    if (APPLY) {
      await db.execute(sql`
        update purchase_orders set reference = ${c.newRef}, updated_at = now()
        where id = ${c.poId}::uuid and holded_id = ${c.holdedId}`);
    }
    ok++;
  }

  // Foshan: bedragen uit het (USD-)doc omrekenen naar EUR, zoals de gewone pull doet.
  const fd = (await holded.documents.get("purchase", FOSHAN.holdedId)) as {
    docNumber?: string; total?: number; subtotal?: number; tax?: number;
    paymentsTotal?: number; currency?: string; currencyChange?: number;
  };
  if (fd.docNumber?.trim() !== FOSHAN.expectNumber) {
    console.log(`❌ Foshan: docNumber is ${fd.docNumber} — overgeslagen`);
    failed++;
  } else {
    const rate = Number(fd.currencyChange) || 1;
    const toEur = (v: unknown) => r2(Number(v ?? 0) / rate);
    const totalEur = toEur(fd.total);
    const paidEur = toEur(fd.paymentsTotal);
    const origNote = `Origineel: ${Number(fd.total ?? 0).toLocaleString("nl-NL")} ${String(fd.currency ?? "USD").toUpperCase()} (koers ${rate})`;
    console.log(`✔ Foshan ${FOSHAN.expectNumber}: € 16 → € ${totalEur}, betaald € ${paidEur} (deelbetaling)`);
    if (APPLY) {
      await db.execute(sql`
        update purchase_orders set
          total = ${String(totalEur)}::numeric,
          subtotal = ${fd.subtotal != null ? String(toEur(fd.subtotal)) : null}::numeric,
          tax = ${fd.tax != null ? String(toEur(fd.tax)) : null}::numeric,
          items = jsonb_set(items, '{0,unitPrice}', to_jsonb(${totalEur}::numeric)),
          paid_eur = greatest(coalesce(paid_eur, 0), ${String(paidEur)}::numeric),
          notes = case when notes like '%Origineel:%' then notes else coalesce(notes || ' — ', '') || ${origNote} end,
          updated_at = now()
        where id = ${FOSHAN.poId}::uuid and total <= 20`);
    }
    ok++;
  }

  console.log(`\n${APPLY ? "Doorgevoerd" : "DRY-RUN"}: ${ok} gepland/gedaan, ${failed} niet gematcht.`);
  if (!APPLY) console.log("Draai met --apply om door te voeren.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
