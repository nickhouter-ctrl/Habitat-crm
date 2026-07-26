import "./load-env";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const term = process.argv[2] ?? "wijnen";

async function main() {
  // 1) Waar komt de zoekterm voor (naam/bedrijf/email-kolommen)?
  const cols = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'character varying')
      and column_name in ('name', 'full_name', 'company', 'company_name', 'email', 'contact_name', 'title', 'display_name')
    order by table_name`;
  console.log(`=== "${term}" gevonden in: ===`);
  for (const c of cols) {
    try {
      const r = await sql.unsafe(
        `select count(*)::int n from public."${c.table_name}" where "${c.column_name}" ilike $1`,
        [`%${term}%`],
      );
      if (r[0].n > 0) console.log(`  ${c.table_name}.${c.column_name} → ${r[0].n}`);
    } catch {
      /* kolom niet doorzoekbaar */
    }
  }

  // 2) Toon de rijen in contacts + customer_accounts (indien aanwezig)
  for (const t of ["contacts", "customer_accounts", "accounts", "companies"]) {
    try {
      const rows = await sql.unsafe(
        `select * from public."${t}" where coalesce(name,'') ilike $1 or coalesce(email,'') ilike $1 limit 20`,
        [`%${term}%`],
      );
      if (rows.length) {
        console.log(`\n=== ${t}: ${rows.length} rij(en) ===`);
        for (const r of rows as any[])
          console.log(`  ${r.id} | ${r.name ?? "—"} | ${r.email ?? "—"} | ${r.phone ?? "—"} | created ${r.createdAt ?? r.created_at ?? "—"}`);
      }
    } catch {
      /* tabel/kolom bestaat niet */
    }
  }

  await sql.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
