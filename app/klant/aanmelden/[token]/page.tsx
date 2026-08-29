import Link from "next/link";

import { Card, CardContent, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { kiesTaal, verifieerAanmeldToken } from "@/lib/klant-portal";

import { klantT } from "../../_t";
import { verwerkAanmelding } from "../../actions";

const TALEN = [
  { key: "nl", label: "🇳🇱 NL" },
  { key: "en", label: "🇬🇧 EN" },
  { key: "es", label: "🇪🇸 ES" },
] as const;

export default async function KlantAanmeldenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const taal = kiesTaal(typeof sp.lang === "string" ? sp.lang : "nl");
  const t = klantT(taal);

  if (!verifieerAanmeldToken(token)) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t.linkOngeldig}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex justify-end gap-1">
        {TALEN.map((l) => (
          <Link
            key={l.key}
            href={`/klant/aanmelden/${token}?lang=${l.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${taal === l.key ? "bg-accent text-white" : "bg-surface text-muted hover:bg-border"}`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.aanmelden}</h1>
      <p className="mb-5 text-sm text-muted">{t.aanmeldUitleg}</p>

      <Card>
        <CardContent className="pt-5">
          <form action={verwerkAanmelding.bind(null, token)} className="space-y-4">
            <input type="hidden" name="lang" value={taal} />
            <Field label={t.naam} htmlFor="ka-name">
              <Input id="ka-name" name="name" required />
            </Field>
            <Field label={t.emailLabel} htmlFor="ka-email">
              <Input id="ka-email" name="email" type="email" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.telefoon} htmlFor="ka-phone">
                <Input id="ka-phone" name="phone" />
              </Field>
              <Field label={t.mobiel} htmlFor="ka-mobile">
                <Input id="ka-mobile" name="mobile" />
              </Field>
            </div>
            <Field label={t.nifNie} htmlFor="ka-taxid">
              <Input id="ka-taxid" name="taxId" />
            </Field>
            <Field label={t.adres} htmlFor="ka-address">
              <Input id="ka-address" name="addressLine" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.postcode} htmlFor="ka-postal">
                <Input id="ka-postal" name="postalCode" />
              </Field>
              <Field label={t.plaats} htmlFor="ka-city">
                <Input id="ka-city" name="city" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.provincie} htmlFor="ka-province">
                <Input id="ka-province" name="province" />
              </Field>
              <Field label={t.land} htmlFor="ka-country">
                <Input id="ka-country" name="country" defaultValue="ES" />
              </Field>
            </div>
            <Field label={t.taalVoorkeur} htmlFor="ka-lang">
              <Select id="ka-lang" name="preferredLanguage" defaultValue={taal}>
                <option value="nl">Nederlands</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </Select>
            </Field>
            <SubmitButton pendingLabel="…">{t.opslaan}</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
