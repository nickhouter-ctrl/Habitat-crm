"use client";

import { useCallback, useEffect, useState } from "react";

import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui";
import {
  getDeliveryNoteForPicking,
  listOpenDeliveryNotes,
  markDeliveryNoteDelivered,
  type DeliveryNoteForPicking,
  type OpenDeliveryNote,
} from "./actions";

/** Uitleveren: kies een openstaande pakbon, scan de regels af, markeer afgeleverd. */
export function DeliverPicking() {
  const [notes, setNotes] = useState<OpenDeliveryNote[] | null>(null);
  const [current, setCurrent] = useState<DeliveryNoteForPicking | null>(null);
  const [scanned, setScanned] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  const loadList = useCallback(async () => {
    setNotes(await listOpenDeliveryNotes());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const n = await listOpenDeliveryNotes();
      if (active) setNotes(n);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function open(id: string) {
    setBusy(true);
    const dn = await getDeliveryNoteForPicking(id);
    setBusy(false);
    if (dn) {
      setCurrent(dn);
      setScanned({});
      setFlash(null);
    }
  }

  function backToList() {
    setCurrent(null);
    setScanned({});
    setFlash(null);
    loadList();
  }

  const onScan = useCallback(
    (code: string) => {
      if (!current) return;
      const c = code.trim();
      const line = current.lines.find((l) => l.barcode === c || l.sku === c);
      if (!line) {
        setFlash({ kind: "warn", text: `Code ${c} hoort niet bij deze pakbon` });
        return;
      }
      setScanned((prev) => {
        const have = prev[line.key] ?? 0;
        if (have >= line.units) {
          setFlash({ kind: "warn", text: `${line.name}: alle ${line.units} al afgevinkt` });
          return prev;
        }
        const now = have + 1;
        setFlash({ kind: "ok", text: `${line.name} — ${now}/${line.units}` });
        return { ...prev, [line.key]: now };
      });
    },
    [current],
  );

  function bump(key: number, units: number, delta: number) {
    setScanned((prev) => {
      const next = Math.max(0, Math.min(units, (prev[key] ?? 0) + delta));
      return { ...prev, [key]: next };
    });
  }

  async function markDelivered() {
    if (!current) return;
    setBusy(true);
    await markDeliveryNoteDelivered(current.id);
    setBusy(false);
    backToList();
  }

  // ── Pakbon-lijst ───────────────────────────────────────────────
  if (!current) {
    return (
      <div className="space-y-3">
        {notes === null ? (
          <p className="text-sm text-muted">Laden…</p>
        ) : notes.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-muted">
            Geen openstaande pakbonnen om uit te leveren.
          </div>
        ) : (
          notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => open(n.id)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-background disabled:opacity-50"
            >
              <span>
                <span className="font-medium">{n.number ?? "Pakbon"}</span>
                <span className="block text-sm text-muted">{n.contact ?? "—"}</span>
              </span>
              <span className="text-sm text-muted">
                {n.lineCount} regel{n.lineCount === 1 ? "" : "s"}
              </span>
            </button>
          ))
        )}
      </div>
    );
  }

  // ── Pick-scherm ────────────────────────────────────────────────
  const total = current.lines.reduce((s, l) => s + l.units, 0);
  const done = current.lines.reduce((s, l) => s + Math.min(scanned[l.key] ?? 0, l.units), 0);
  const allDone = total > 0 && done >= total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-2">
        <div>
          <p className="font-medium">{current.number ?? "Pakbon"}</p>
          <p className="text-sm text-muted">{current.contact ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-semibold tabular-nums ${allDone ? "text-success" : ""}`}>
            {done}/{total}
          </p>
          <button type="button" onClick={backToList} className="text-xs text-muted hover:underline">
            ← andere pakbon
          </button>
        </div>
      </div>

      {flash && (
        <div
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            flash.kind === "ok" ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-700"
          }`}
        >
          {flash.kind === "ok" ? "✓ " : "⚠ "}
          {flash.text}
        </div>
      )}

      <BarcodeScanner onScan={onScan} paused={allDone} />

      <ul className="divide-y rounded-lg border">
        {current.lines.map((l) => {
          const n = Math.min(scanned[l.key] ?? 0, l.units);
          const full = n >= l.units;
          return (
            <li key={l.key} className="flex items-center gap-3 p-3">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  full ? "bg-success text-white" : "bg-background text-muted"
                }`}
              >
                {full ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${full ? "text-muted line-through" : "font-medium"}`}>
                  {l.name}
                </span>
                {!l.barcode && !l.sku && (
                  <span className="block text-xs text-amber-600">geen barcode — handmatig afvinken</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => bump(l.key, l.units, -1)}
                  className="grid size-7 place-items-center rounded-md border text-muted hover:bg-background"
                >
                  −
                </button>
                <span className="w-12 text-center text-sm tabular-nums">
                  {n}/{l.units}
                </span>
                <button
                  type="button"
                  onClick={() => bump(l.key, l.units, +1)}
                  className="grid size-7 place-items-center rounded-md border text-muted hover:bg-background"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <Button onClick={markDelivered} disabled={busy} className="w-full">
        {allDone ? "Markeer afgeleverd" : `Markeer afgeleverd (${done}/${total} gescand)`}
      </Button>
    </div>
  );
}
