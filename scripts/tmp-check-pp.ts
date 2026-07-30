import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
async function main() {
  console.table(await db.execute(sql`
    select p.name, pp.date, pp.method, pp.description, pp.amount_eur, pp.note
    from project_payments pp join projects p on p.id = pp.project_id
    order by p.name, pp.date`));
  process.exit(0);
}
main();
