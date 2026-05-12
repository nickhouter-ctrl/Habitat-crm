import "./load-env";
import { pullProductsFromHolded, pullContactsFromHolded, pullDocumentsFromHolded } from "../lib/holded/sync";

async function main() {
  const onlyDocs = process.argv.includes("--docs-only");
  if (!onlyDocs) {
    const p = await pullProductsFromHolded();
    console.log("products:", p);
    const c = await pullContactsFromHolded();
    console.log("contacts:", c);
  }
  const d = await pullDocumentsFromHolded(["estimate", "invoice", "creditnote"]);
  console.log("documents:", d);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
