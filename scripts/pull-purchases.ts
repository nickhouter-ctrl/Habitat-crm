import "./load-env";
import { pullPurchaseOrdersFromHolded } from "../lib/holded/sync";
(async()=>{ const r = await pullPurchaseOrdersFromHolded(); console.log("aankopen:", r); process.exit(0); })().catch(e=>{console.error(e);process.exit(1);});
