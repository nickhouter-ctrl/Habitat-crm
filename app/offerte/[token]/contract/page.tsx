import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { shortHash } from "@/lib/canonical-json";
import { COMPANY } from "@/lib/company";
import {
  CONTRACT_T,
  buildSnapshot,
  contractArticles,
  contractChecks,
  contractLang,
  contractSnapshotHash,
} from "@/lib/contract-terms";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { SignForm } from "./sign-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overeenkomst · Habitat One" };

/**
 * De aannemingsovereenkomst, publiek bereikbaar met het offerte-token.
 *
 * Deze GET schrijft niets en verandert geen status: mailscanners halen links
 * vooraf op, dus alleen een echte POST (het formulier) mag iets beslissen. Dat
 * is dezelfde regel als bij het keuren van inkoopfacturen.
 *
 * De hele overeenkomst staat leesbaar op het scherm, niet alleen in de PDF — een
 * handtekening onder een document dat de tekenaar alleen als bijlage kon
 * bemachtigen is een stuk makkelijker aan te vechten.
 */
export default async function ContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.acceptToken, token),
    // In SQL, niet met Date.now(): een klokaflezing tijdens het renderen is geen
    // zuivere functie. Zelfde patroon als bij het keuren van inkoopfacturen.
    extras: {
      verlopen: sql<boolean>`coalesce(${documents.acceptTokenExpiresAt} < now(), false)`.as("verlopen"),
    },
    with: { contact: { columns: { name: true, email: true, preferredLanguage: true, taxId: true } } },
  });
  if (!doc || doc.kind !== "estimate") notFound();

  const lang = contractLang(doc.contact?.preferredLanguage);
  const t = CONTRACT_T[lang];
  const getekend = doc.signature ?? null;
  const verlopen = doc.verlopen;

  // Bij een getekende overeenkomst tonen we de bevroren snapshot, niet de
  // huidige rij — anders zou de pagina iets anders laten zien dan wat er
  // ondertekend is.
  const snapshot = getekend?.snapshot ?? buildSnapshot(doc, lang);
  const hash = getekend?.snapshotSha256 ?? contractSnapshotHash(snapshot);
  const artikelen = getekend?.snapshot.articles ?? contractArticles(lang);
  const termijnen = snapshot.paymentSchedule ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/habitat-one-logo.png" alt="Habitat One" className="h-10 w-auto" />
        <p className="mt-1.5 text-xs text-muted">Xàbia · Costa Blanca</p>
      </div>

      <div className="rounded-xl border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{t.heading}</h1>
        <p className="mt-1 text-xs text-muted">
          {snapshot.docNumber ?? ""} · {t.fingerprint}: <span className="font-mono">{shortHash(hash)}</span>
        </p>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{t.parties}</h2>
        <div className="mt-2 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted">{t.contractor}</div>
            <div className="font-medium">{COMPANY.legalName}</div>
            <div className="text-muted">{COMPANY.vatNumber}</div>
          </div>
          <div>
            <div className="text-xs text-muted">{t.client}</div>
            <div className="font-medium">{getekend?.name ?? doc.contact?.name ?? "—"}</div>
            <div className="text-muted">{getekend?.email ?? doc.contact?.email ?? ""}</div>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{t.object}</h2>
        <p className="mt-2 text-sm">{snapshot.title || snapshot.docNumber || "—"}</p>
        <div className="mt-3 ml-auto w-full max-w-xs space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">{t.exVat}</span>
            <span className="tabular-nums">{formatEUR(snapshot.subtotalEur)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{t.vat}</span>
            <span className="tabular-nums">{formatEUR(snapshot.taxEur)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>{t.price}</span>
            <span className="tabular-nums">{formatEUR(snapshot.totalEur)}</span>
          </div>
        </div>

        {termijnen.length > 0 && (
          <>
            <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{t.schedule}</h2>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y">
                {termijnen.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 tabular-nums text-muted">{r.pct}%</td>
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatEUR(r.amountEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{t.articles}</h2>
        <ol className="mt-2 space-y-3 text-sm">
          {artikelen.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 text-xs text-muted">
                {t.article} {i + 1}
              </span>
              <span className="leading-relaxed">{a}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap gap-4 border-t pt-4 text-sm">
          <a href={`/offerte/${token}/contract/pdf`} className="text-accent hover:underline">
            ↓ {t.downloadPdf}
          </a>
          <Link href={`/offerte/${token}`} className="text-muted hover:underline">
            {t.backToQuote}
          </Link>
        </div>
      </div>

      {getekend ? (
        <p className="mt-6 rounded-xl border bg-green-50 px-5 py-4 text-sm text-success">
          ✓ {t.signedOn} {formatDate(getekend.signedAt)} — {getekend.name}
        </p>
      ) : verlopen ? (
        <p className="mt-6 rounded-xl border bg-background px-5 py-4 text-sm text-muted">{t.expired}</p>
      ) : doc.rejectedAt || doc.status === "void" ? (
        <p className="mt-6 rounded-xl border bg-background px-5 py-4 text-sm text-muted">{t.expired}</p>
      ) : (
        <SignForm
          token={token}
          checks={contractChecks(lang)}
          snapshotSha256={hash}
          vraagTaxId={!doc.contact?.taxId}
          defaultEmail={doc.contact?.email ?? ""}
          defaultName={doc.contact?.name ?? ""}
          t={t}
        />
      )}
    </main>
  );
}
