/**
 * Voegt dubbele contacten samen. Dubbel = zelfde (genormaliseerde) e-mail én
 * (zelfde telefoon OF zelfde naam) — zo blijven verschillende mensen met een
 * gedeeld bedrijfs-e-mail gescheiden. Per groep wordt één "keeper" gekozen
 * (holded-gekoppeld > meeste links > oudste); alle verwijzingen (facturen,
 * projecten, deals, afspraken, …) verhuizen naar de keeper en de rest wordt
 * verwijderd.
 *
 *   npx tsx scripts/dedup-contacts.ts              (dry-run — toont het plan)
 *   npx tsx scripts/dedup-contacts.ts --apply
 *   npx tsx scripts/dedup-contacts.ts jeff         (alleen groepen die matchen)
 */
import "./load-env";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const APPLY = process.argv.includes("--apply");
const filter = process.argv.find((a) => !a.startsWith("--") && !a.includes("/") && a !== "npx" && a !== "tsx")?.toLowerCase();

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

async function main() {
  // 1) Alle kolommen die naar contacts verwijzen (FK of naam contact_id/contactId).
  const cols = await sql<{ table_name: string; column_name: string }[]>`
    select distinct tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'contacts' and ccu.column_name = 'id'`;
  const refCols = cols.map((c) => ({ t: c.table_name, c: c.column_name }));
  // Ook kolommen zonder harde FK (bv. sent_emails.contactId, kv).
  const soft = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and (column_name = 'contactId' or column_name = 'contact_id') and data_type = 'uuid'`;
  for (const s of soft) if (!refCols.some((r) => r.t === s.table_name && r.c === s.column_name)) refCols.push({ t: s.table_name, c: s.column_name });
  console.log(`Verwijzende kolommen (${refCols.length}):`, refCols.map((r) => `${r.t}.${r.c}`).join(", "), "\n");

  // 2) Alle contacten ophalen en groeperen.
  const all = await sql<{ id: string; name: string | null; email: string | null; phone: string | null; company: string | null; created: string }[]>`
    select id, name, email, phone, company_id as company, created_at as created from contacts`;
  // Groeperen op e-mail (standaard) of op naam (--by-name, voor dubbelen zonder
  // gedeeld e-mail zoals leveranciers).
  const BYNAME = process.argv.includes("--by-name");
  const groups = new Map<string, typeof all>();
  for (const c of all) {
    const key = BYNAME ? norm(c.name) : norm(c.email);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, [] as unknown as typeof all);
    groups.get(key)!.push(c);
  }

  const refCount = async (id: string) => {
    let n = 0;
    for (const r of refCols) {
      const res = await sql.unsafe(`select count(*)::int c from public."${r.t}" where "${r.c}" = $1`, [id]);
      n += res[0].c;
    }
    return n;
  };

  let mergeGroups = 0, mergedDupes = 0;
  for (const [email, members] of groups) {
    // Alleen echte dubbels: zelfde e-mail + (zelfde telefoon of naam).
    const dupes = members.length > 1;
    if (!dupes) continue;
    if (filter && !members.some((m) => norm(m.name).includes(filter) || norm(m.email).includes(filter))) continue;

    // Sub-clusters: alleen samenvoegen bij ZELFDE niet-lege telefoon of identieke
    // naam. Zo blijven verschillende bedrijven met een gedeeld e-mail gescheiden.
    const clusters = new Map<string, typeof members>();
    for (const m of members) {
      // Naam-modus: alles met identieke naam is één cluster. E-mailmodus:
      // alleen samen bij zelfde niet-lege telefoon of identieke naam.
      const ck = BYNAME ? "all" : norm(m.phone) || norm(m.name) || m.id;
      if (!clusters.has(ck)) clusters.set(ck, [] as unknown as typeof members);
      clusters.get(ck)!.push(m);
    }
    const skipped = [...clusters.values()].filter((c) => c.length < 2).flat();
    if (skipped.length > 1) {
      console.log(`○ ${email} — gedeeld e-mail, ${skipped.length} verschillende contacten → NIET samengevoegd: ${skipped.map((m) => m.name ?? "—").join(" · ")}`);
    }

    for (const cluster of clusters.values()) {
      if (cluster.length < 2) continue;
      const companyLike = (n: string | null) => /\b(s\.?l\.?|b\.?v\.?|ltd|gmbh|s\.?a\.?|inc)\b/i.test(n ?? "");
      const withCounts = await Promise.all(cluster.map(async (m) => ({ m, refs: await refCount(m.id) })));
      withCounts.sort((a, b) => {
        // keeper: persoon vóór bedrijfsnaam, dan meeste links, dan oudste.
        if (companyLike(a.m.name) !== companyLike(b.m.name)) return companyLike(a.m.name) ? 1 : -1;
        if (b.refs !== a.refs) return b.refs - a.refs;
        return new Date(a.m.created).getTime() - new Date(b.m.created).getTime();
      });
      const keeper = withCounts[0];
      const losers = withCounts.slice(1);
      mergeGroups++;
      mergedDupes += losers.length;
      console.log(`● ${email} — keeper: ${keeper.m.name ?? "—"} (${keeper.m.id.slice(0, 8)}, ${keeper.refs} links${keeper.m.company ? ", bedrijf" : ""})`);
      for (const l of losers) console.log(`    ↳ merge & verwijder: ${l.m.name ?? "—"} (${l.m.id.slice(0, 8)}, ${l.refs} links)`);

      if (APPLY) {
        for (const l of losers) {
          for (const r of refCols) {
            await sql.unsafe(`update public."${r.t}" set "${r.c}" = $1 where "${r.c}" = $2`, [keeper.m.id, l.m.id]);
          }
          // Vul lege keeper-velden aan met die van de loser (bedrijf/telefoon/naam).
          await sql.unsafe(
            `update public."contacts" k set
               company_id = coalesce(k.company_id, l.company_id),
               first_name = coalesce(nullif(k.first_name,''), nullif(l.first_name,'')),
               last_name  = coalesce(nullif(k.last_name,''),  nullif(l.last_name,'')),
               phone      = coalesce(nullif(k.phone,''),      nullif(l.phone,'')),
               mobile     = coalesce(nullif(k.mobile,''),     nullif(l.mobile,'')),
               job_title  = coalesce(nullif(k.job_title,''),  nullif(l.job_title,''))
             from public."contacts" l where k.id = $1 and l.id = $2`,
            [keeper.m.id, l.m.id],
          );
          await sql.unsafe(`delete from public."contacts" where id = $1`, [l.m.id]);
        }
      }
    }
  }
  console.log(`\n${mergeGroups} groep(en), ${mergedDupes} dubbele contacten ${APPLY ? "SAMENGEVOEGD & VERWIJDERD" : "te mergen"}.`);
  console.log(APPLY ? "→ WEGGESCHREVEN." : "→ dry-run (draai met --apply).");
  await sql.end();
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
