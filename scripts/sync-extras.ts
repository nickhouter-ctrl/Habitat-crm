import "./load-env";
import { db, pgClient } from "../lib/db";
import { pullProjectsFromHolded, pullDocumentsFromHolded } from "../lib/holded/sync";
(async()=>{
  const proj = await pullProjectsFromHolded();
  console.log("projecten:", proj);
  const docs = await pullDocumentsFromHolded(["deliverynote"]);
  console.log("pakbonnen (waybills):", docs);
  await pgClient.end(); process.exit(0);
})().catch(async e=>{console.error(e); try{await pgClient.end();}catch{} process.exit(1);});
