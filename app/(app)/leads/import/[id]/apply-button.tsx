"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";

type Uitkomst = { klaar: boolean; verwerkt: number; totaal: number; toegevoegd: number };

/**
 * Importeren in rondes. Eén ronde schrijft een paar duizend rijen weg en geeft
 * terug hoe ver hij kwam; is het nog niet klaar, dan gaat de knop automatisch
 * door. Zo kan een lijst van 7.000 rijen niet stranden op een time-out, en zie
 * je ondertussen hoe ver het is.
 */
export function ApplyButton({
  id,
  aantal,
  applyAction,
}: {
  id: string;
  aantal: number;
  applyAction: (id: string) => Promise<Uitkomst>;
}) {
  const uiT = useUiTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stand, setStand] = useState<Uitkomst | null>(null);
  const [fout, setFout] = useState("");

  async function start() {
    if (!confirm(uiT("{v0} bedrijven als prospect toevoegen? Ze komen NIET in je contactenlijst.", { v0: aantal }))) return;
    setBusy(true);
    setFout("");
    try {
      let u = await applyAction(id);
      setStand(u);
      // Doorgaan tot het klaar is; elke ronde schrijft z'n eigen cursor weg.
      let rondes = 0;
      while (!u.klaar && rondes < 20) {
        rondes++;
        u = await applyAction(id);
        setStand(u);
      }
      router.refresh();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Importeren mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} disabled={busy || aantal === 0}>
        {busy ? uiT("Importeren…") : uiT("Definitief importeren ({v0})", { v0: aantal })}
      </Button>
      {stand && (
        <p className="text-sm text-muted">
          {stand.klaar
            ? uiT("Klaar: {v0} prospects toegevoegd.", { v0: stand.toegevoegd })
            : uiT("{v0} van {v1} verwerkt…", { v0: stand.verwerkt, v1: stand.totaal })}
        </p>
      )}
      {fout && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{fout}</p>}
    </div>
  );
}
