/**
 * De stand-pagina: bezoekers vastleggen tijdens de beurs.
 *
 * Alles op één scherm, want op een stand heb je geen twee handen vrij: links
 * invoeren, rechts de QR-code die bezoekers naar ons eigen formulier op
 * habitat-one.com stuurt, eronder wie er vandaag al is langs geweest.
 */
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import QRCode from "qrcode";

import { Badge, Card, CardContent, CardHeader, CardTitle, LinkButton, PageHeader, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { contacts, quoteRequests } from "@/lib/db/schema";
import { BEURS, ROLLEN, rolOmschrijving } from "@/lib/beurs";
import { legBezoekerVast } from "./actions";
import { BeursForm } from "./beurs-form";

export const metadata = { title: "Beursstand" };
export const dynamic = "force-dynamic";

/** Rol uit de tags van het contact ("rol:architect"). */
function rolUitTags(tags: string[] | null): string | null {
  const t = (tags ?? []).find((x) => x.startsWith("rol:"));
  return t ? t.slice(4) : null;
}

export default async function BeursPage() {
  const [rijen, qr] = await Promise.all([
    db
      .select({
        id: quoteRequests.id,
        naam: quoteRequests.name,
        email: quoteRequests.email,
        telefoon: quoteRequests.phone,
        bedrijf: quoteRequests.company,
        bericht: quoteRequests.message,
        wanneer: quoteRequests.createdAt,
        contactId: quoteRequests.contactId,
        tags: contacts.tags,
      })
      .from(quoteRequests)
      .leftJoin(contacts, eq(contacts.id, quoteRequests.contactId))
      .where(eq(quoteRequests.source, BEURS.bron))
      .orderBy(desc(quoteRequests.createdAt))
      .limit(300),
    // Als SVG, zodat hij op elk scherm scherp blijft en er geen bestand of
    // externe dienst aan te pas komt.
    QRCode.toString(BEURS.formulierUrl, { type: "svg", margin: 1, width: 240 }),
  ]);

  const perRol = new Map<string, number>();
  for (const r of rijen) {
    const rol = rolUitTags(r.tags) ?? "anders";
    perRol.set(rol, (perRol.get(rol) ?? 0) + 1);
  }
  const vandaag = new Date().toISOString().slice(0, 10);
  const vandaagAantal = rijen.filter((r) => r.wanneer?.toISOString().slice(0, 10) === vandaag).length;

  return (
    <>
      <PageHeader
        title="Beursstand"
        subtitle={`${BEURS.naam} · ${BEURS.plaats} · stand ${BEURS.stand}`}
        actions={<LinkButton href="/beurs/contacten">Alle beurscontacten</LinkButton>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Bezoeker vastleggen</CardTitle>
            <span className="text-xs text-muted">
              De bezoeker krijgt meteen een bevestigingsmail; de gegevens staan bij Contacten en in
              de opvolglijst op Aanvragen.
            </span>
          </CardHeader>
          <CardContent>
            <BeursForm opslaan={legBezoekerVast} />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Laat de bezoeker zelf invullen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className="mx-auto w-full max-w-[15rem] [&_svg]:h-auto [&_svg]:w-full"
                // Vaste, zelf gemaakte SVG uit de qrcode-bibliotheek.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="text-center text-xs text-muted">
                Scan met de telefoon —{" "}
                <span className="font-medium text-foreground">{BEURS.formulierLabel}</span>
              </p>
              <p className="text-xs text-muted">
                Deze pagina staat op onze eigen website, los van het CRM. De bezoeker ziet alleen
                het formulier; zijn gegevens komen hier binnen.
              </p>
              <p className="border-t pt-3 text-xs text-muted">
                <span className="font-medium text-foreground">Op de iPad op de balie</span> gebruik je
                hetzelfde formulier — groot, zonder menu, en na het opslaan meteen leeg voor de
                volgende:{" "}
                <a href={BEURS.standUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {BEURS.standUrl.replace("https://www.", "")}
                </a>
                . Dan hoeft dit scherm daar niet open te staan.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Geteld</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted">Vandaag</span>
                <span className="text-2xl font-semibold tabular-nums">{vandaagAantal}</span>
              </div>
              <div className="flex items-baseline justify-between border-t pt-2">
                <span className="text-muted">Hele beurs</span>
                <span className="font-semibold tabular-nums">{rijen.length}</span>
              </div>
              <ul className="space-y-1 border-t pt-2 text-xs text-muted">
                {ROLLEN.filter((r) => perRol.get(r.key)).map((r) => (
                  <li key={r.key} className="flex justify-between">
                    <span>{r.nl}</span>
                    <span className="tabular-nums">{perRol.get(r.key)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Laatst gesproken</CardTitle>
          <span className="text-xs text-muted">
            De hele beurs, met zoeken en sorteren, staat bij{" "}
            <Link href="/beurs/contacten" className="text-accent hover:underline">Beurscontacten</Link>. Ook terug te
            vinden bij <Link href="/contacts?bron=beurs" className="text-accent hover:underline">Contacten</Link> en{" "}
            <Link href="/aanvragen" className="text-accent hover:underline">Aanvragen</Link>.
          </span>
        </CardHeader>
        <CardContent>
          {rijen.length === 0 ? (
            <p className="text-sm text-muted">Nog niemand vastgelegd.</p>
          ) : (
            <Table wrapperClassName="rounded-lg border">
              <THead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <Th>Naam</Th>
                  <Th>Bedrijf</Th>
                  <Th>Soort</Th>
                  <Th>Contact</Th>
                  <Th>Waar het over ging</Th>
                  <Th>Wanneer</Th>
                </tr>
              </THead>
              <TBody>
                {rijen.slice(0, 10).map((r) => {
                  const rol = rolUitTags(r.tags);
                  return (
                    <Tr key={r.id}>
                      <Td>
                        {r.contactId ? (
                          <Link href={`/contacts/${r.contactId}`} className="font-medium text-accent hover:underline">
                            {r.naam}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.naam}</span>
                        )}
                      </Td>
                      <Td className="text-muted">{r.bedrijf || "—"}</Td>
                      <Td className="space-x-1 whitespace-nowrap">
                        {rol ? (
                          <Badge tone="neutral">
                            {rolOmschrijving(rol, (r.tags ?? []).find((x) => x.startsWith("rol-anders:"))?.slice(11) ?? null)}
                          </Badge>
                        ) : (
                          "—"
                        )}
                        {(r.tags ?? []).includes("beurs:qr") ? (
                          <Badge tone="accent">Zelf ingevuld</Badge>
                        ) : null}
                      </Td>
                      <Td className="text-muted">
                        <span className="block">{r.email}</span>
                        {r.telefoon ? <span className="block text-xs">{r.telefoon}</span> : null}
                      </Td>
                      <Td className="max-w-md text-muted">
                        <span className="line-clamp-2 text-xs">
                          {(r.bericht ?? "").split("\n").slice(1).join(" ").trim() || "—"}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {r.wanneer?.toLocaleString("nl-NL", {
                          timeZone: "Europe/Madrid",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
