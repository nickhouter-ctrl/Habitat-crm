"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { queueMailInvoice } from "./queue-invoice";
export function QueueInvoiceButton({ emailId, attachmentId, status, purchaseOrderId }: { emailId: string; attachmentId: string; status: string | null; purchaseOrderId: string | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = status || result?.status;
  if (current === "pending") return <Link href={`/inkooporders/te-verwerken#mail-${emailId}`} className="text-xs font-medium text-accent">Staat klaar · Keuren →</Link>;
  if (current) return purchaseOrderId ? <Link href={`/inkooporders/${purchaseOrderId}`} className="text-xs text-success">Verwerkt · Inkoop openen →</Link> : <span className="text-xs text-muted">{{ approved: "Al goedgekeurd", rejected: "Afgekeurd", ignored: "Genegeerd", superseded: "Vervangen door een andere factuur" }[current] || "Al verwerkt"}</span>;
  return <span className="flex flex-wrap items-center gap-2"><button type="button" disabled={pending} onClick={() => start(async () => {
    setError(null); try { setResult(await queueMailInvoice(emailId, attachmentId)); } catch (e) { setError(e instanceof Error ? e.message : "Klaarzetten mislukt."); }
  })} className="rounded-md bg-accent/10 px-3 py-2 text-xs font-medium text-accent disabled:opacity-50">{pending ? "Klaarzetten…" : "Klaarzetten voor keuring"}</button>{error && <span role="alert" className="text-xs text-warning">{error}</span>}</span>;
}
