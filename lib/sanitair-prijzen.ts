import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Houdt de "eigen collectie"-badkamerposten in het prijzenboek gelijk aan de
 * catalogus: gemiddelde kost- en verkoopprijs per productgroep, zodat de
 * calculator automatisch met de eigen verkoopprijzen rekent. Draait bij de
 * knop op /prijzenboek en wekelijks mee met de weekcontrole-cron.
 *
 * De montageposten (Badkamers & sanitair) blijven vast — dit ververst alleen
 * de productprijzen onder "Eigen producten".
 */

type Gem = { kost: number; verkoop: number };

/** Afvoerset zit niet als eigen categorie in de catalogus — vast bedrag. */
const AFVOERSET: Gem = { kost: 90, verkoop: 124 };

/** Vrijstaande badkraan: hoort automatisch bij elk bad (verkoop ± € 1.000,
 *  keuze Nick 06-08-2026). Zit NIET in de eigen collectie — wordt los
 *  ingekocht (bv. in Spanje); vast bedrag tot er een catalogus-categorie is. */
const BADKRAAN: Gem = { kost: 300, verkoop: 1000 };

export async function syncSanitairPrijzen(): Promise<number> {
  const per = new Map<string, Gem>();
  const cats = await db.execute<{ cat: string; kost: number | null; verkoop: number | null }>(sql`
    select category cat, avg(cost_eur)::float8 kost, avg(price_eur)::float8 verkoop
    from products
    where price_eur is not null and category in ('Douchebakken','Douchesets','Douchewanden','Baden','Kranen')
    group by category`);
  for (const c of cats) per.set(c.cat, { kost: c.kost ?? 0, verkoop: c.verkoop ?? 0 });

  // Meubels binnen "Wastafels" (losse waskommen tellen niet mee), hangtoiletten
  // binnen "Toiletten".
  const [meubel] = await db.execute<{ kost: number | null; verkoop: number | null }>(sql`
    select avg(cost_eur)::float8 kost, avg(price_eur)::float8 verkoop from products
    where category = 'Wastafels' and name ~* 'cabinet' and price_eur is not null`);
  const [toilet] = await db.execute<{ kost: number | null; verkoop: number | null }>(sql`
    select avg(cost_eur)::float8 kost, avg(price_eur)::float8 verkoop from products
    where category = 'Toiletten' and name ~* 'wall.?hung' and price_eur is not null`);

  const posten: { naam: string; g: Gem }[] = [];
  const bak = per.get("Douchebakken");
  const set = per.get("Douchesets");
  const wand = per.get("Douchewanden");
  if (bak && set && wand)
    posten.push({
      naam: "Doucheset compleet",
      g: { kost: bak.kost + set.kost + wand.kost, verkoop: bak.verkoop + set.verkoop + wand.verkoop },
    });
  const bad = per.get("Baden");
  if (bad?.verkoop)
    posten.push({
      naam: "Bad + badkraan",
      g: { kost: bad.kost + BADKRAAN.kost, verkoop: bad.verkoop + BADKRAAN.verkoop },
    });
  const kraan = per.get("Kranen");
  if (meubel?.verkoop && kraan)
    posten.push({
      naam: "Wastafelmeubel + kraan",
      g: {
        kost: (meubel.kost ?? 0) + kraan.kost + AFVOERSET.kost,
        verkoop: meubel.verkoop + kraan.verkoop + AFVOERSET.verkoop,
      },
    });
  if (toilet?.verkoop)
    posten.push({ naam: "Hangtoilet", g: { kost: toilet.kost ?? 0, verkoop: toilet.verkoop } });

  let bijgewerkt = 0;
  for (const p of posten) {
    const kost = Math.round(p.g.kost);
    const verkoop = Math.round(p.g.verkoop);
    if (verkoop <= 0) continue;
    await db.execute(sql`
      update price_book_items set cost_eur=${kost}, price_eur=${verkoop},
        margin_pct=${Math.round(((verkoop - kost) / verkoop) * 100)}, needs_review=false, updated_at=now()
      where chapter='Eigen producten' and name=${p.naam}`);
    bijgewerkt++;
  }
  return bijgewerkt;
}
