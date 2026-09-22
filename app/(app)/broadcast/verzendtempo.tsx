import { eq } from "drizzle-orm";

import { Card, CardContent, CardHeader, CardTitle, Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { bulkMailSettings } from "@/lib/db/schema";
import { tekst } from "@/lib/i18n/server";
import { dagCap, HARD_MAX, rondeVorm, WARMUP_STAPPEN } from "@/lib/leads/warmup";

import { setVerzendtempo } from "./actions";

/**
 * Het verzendtempo, met de afweging erbij in plaats van alleen een invulveld.
 *
 * De vraag "kan het niet in één keer?" is terecht: technisch past er ruim
 * 10.000 per dag in het verzendvenster. De grens zit bij de ontvangende kant.
 * Gmail en Outlook kijken naar hoeveel een domein gewend is te sturen, en dit
 * is hetzelfde domein waar de offertes en facturen vandaan komen. Daarom staat
 * hier wat elke keuze betekent in dagen én in risico, en kiest een mens.
 */
export async function Verzendtempo({ teGaan }: { teGaan: number }) {
  const [inst] = await db.select().from(bulkMailSettings).where(eq(bulkMailSettings.id, "default"));
  const nu = new Date();
  const huidig = dagCap(inst?.warmupStartedAt ?? null, nu, inst?.dailyCapOverride ?? null);
  const vorm = rondeVorm(huidig);
  const t = await tekst();
  const dagen = (cap: number) => (cap > 0 ? Math.ceil(Math.max(teGaan, 1) / cap) : "—");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Verzendtempo")}</CardTitle>
        <span className="text-xs text-muted">{t("nu {n} per dag", { n: huidig })}</span>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted">
          Standaard bouwt het tempo zichzelf op: {WARMUP_STAPPEN.join(" · ")} per dag. Dat is niet omdat de software
          niet sneller kan — er past ruim 10.000 per dag in het venster — maar omdat Gmail en Outlook kijken naar
          hoeveel een domein gewend is te sturen. En dit is hetzelfde domein waar jullie offertes en facturen vandaan
          komen: raakt de reputatie beschadigd, dan komen die in de spammap.
        </p>

        <form action={setVerzendtempo} className="space-y-3 rounded-lg border bg-background/50 p-3">
          <Field
            label={t("Eigen dagcap")}
            htmlFor="cap"
            hint={t("Leeg = het opwarmschema volgen. Maximaal {max} per dag.", { max: HARD_MAX })}
          >
            <Select id="cap" name="dailyCap" defaultValue={inst?.dailyCapOverride?.toString() ?? ""}>
              <option value="">{t("Opwarmschema volgen (aanbevolen)")}</option>
              {[200, 500, 1000, 2000, 3000, 5000].map((c) => (
                <option key={c} value={c}>
                  {t("{c} per dag — klaar in {d} verzenddagen", { c, d: dagen(c) })}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="opnieuwOpwarmen" />
            {t("Opwarmschema opnieuw beginnen (na een lange pauze of een slechte ronde)")}
          </label>
          <SubmitButton size="sm" variant="secondary" pendingLabel="Bezig…">
            {t("Tempo instellen")}
          </SubmitButton>
        </form>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted">
          <dt>{t("Nu per dag")}</dt>
          <dd className="tabular-nums">{huidig}</dd>
          <dt>{t("Per ronde")}</dt>
          <dd className="tabular-nums">
            {t("{n} mails, {s}s ertussen (elke tien minuten een ronde)", { n: vorm.perRonde, s: vorm.throttleSeconds })}
          </dd>
          <dt>{t("Nog te versturen")}</dt>
          <dd className="tabular-nums">
            {teGaan} — ongeveer {dagen(huidig)} verzenddagen
          </dd>
          <dt>{t("Opwarmen begon")}</dt>
          <dd>{inst?.warmupStartedAt ? inst.warmupStartedAt.toLocaleDateString("nl-NL") : "nog niet verstuurd"}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
