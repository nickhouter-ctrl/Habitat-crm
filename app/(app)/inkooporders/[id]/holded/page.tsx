import { notFound } from "next/navigation";
import { Card, CardContent, LinkButton, PageHeader } from "@/components/ui";
import { requireModuleRead } from "@/lib/auth/guards";
import { tekst } from "@/lib/i18n/server";
import { loadPurchasePush } from "@/lib/holded/purchase-push";
import { HoldedPushForm, LinkExisting, RecoverUncertain } from "./form";

export const metadata = { title: "Boek in Holded" };

export default async function HoldedPushPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleRead("inkoop");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await tekst();

  let ctx: Awaited<ReturnType<typeof loadPurchasePush>>;
  try {
    ctx = await loadPurchasePush(id);
  } catch (e) {
    if (e instanceof Error && e.message === "Inkooporder niet gevonden.") notFound();
    return (
      <div className="max-w-3xl">
        <PageHeader title={t("Boek in Holded")} actions={<LinkButton href={`/inkooporders/${id}`} variant="ghost">{t("← Terug")}</LinkButton>} />
        <Card><CardContent className="py-6 text-sm text-red-700">{t("Holded is nu niet bereikbaar. Probeer het zo opnieuw.")}</CardContent></Card>
      </div>
    );
  }
  const { po } = ctx;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={t("Boek in Holded")}
        subtitle={`${ctx.supplier}${ctx.docNumber ? ` · ${ctx.docNumber}` : ""}`}
        actions={<LinkButton href={`/inkooporders/${id}`} variant="ghost">{t("← Terug")}</LinkButton>}
      />

      {(po.holdedPushStatus === "posting" || po.holdedPushStatus === "unknown") && !po.holdedId ? (
        <RecoverUncertain poId={id} />
      ) : po.holdedId || ctx.existing ? (
        <Card>
          <CardContent className="space-y-3 py-5 text-sm">
            {po.holdedId ? (
              <p>
                {t("Deze factuur staat in Holded")}
                {ctx.existing ? ` (${ctx.existing.docNumber}, ${ctx.existing.draft ? t("concept") : t("definitief")})` : ""}.
                {po.holdedPushError ? <span className="mt-2 block text-amber-700">{po.holdedPushError}</span> : null}
              </p>
            ) : (
              <LinkExisting poId={id} holdedId={ctx.existing!.id} docNumber={ctx.existing!.docNumber} total={ctx.existing!.total} />
            )}
          </CardContent>
        </Card>
      ) : ctx.blocked ? (
        <Card><CardContent className="py-5 text-sm text-amber-800">{ctx.blocked}</CardContent></Card>
      ) : (
        <HoldedPushForm
          poId={id}
          docNumber={ctx.docNumber}
          exVat={ctx.exVat}
          invoiceTotal={ctx.invoiceTotal}
          contact={ctx.contact}
          lines={ctx.lines}
          accounts={ctx.accounts.map((a) => ({ id: a.id, label: `${String(a.num).replace(/0+$/, "").padEnd(3, "0")} · ${a.name.trim()}` }))}
          taxes={ctx.taxes.map((x) => ({ key: x.key, name: x.name, amount: x.amount, group: x.group }))}
          holdedProjects={ctx.holdedProjects}
          lastError={po.holdedPushStatus === "error" ? po.holdedPushError : null}
          exemptionNote={ctx.ai?.vatExemptionNote ?? null}
        />
      )}
    </div>
  );
}
