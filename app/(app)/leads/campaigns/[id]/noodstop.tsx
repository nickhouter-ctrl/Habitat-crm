"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui";

/**
 * De noodstop. Zet ál het campagneverzenden stil, niet alleen deze campagne —
 * dit is de knop voor "er gaat iets mis en ik wil dat het nú ophoudt". De cron
 * kijkt er bij elke ronde naar, dus het effect is er binnen tien minuten, en
 * lopende rondes stoppen na de mail waar ze mee bezig zijn.
 */
export function NoodstopKnop({
  paused,
  action,
}: {
  paused: boolean;
  action: (paused: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/50 p-3">
      <Button
        type="button"
        variant={paused ? "primary" : "ghost"}
        size="sm"
        disabled={pending}
        onClick={() => {
          const vraag = paused
            ? "Het verzenden van álle campagnes weer aanzetten?"
            : "Het verzenden van álle campagnes nu stilzetten?";
          if (!window.confirm(vraag)) return;
          start(() => action(!paused));
        }}
      >
        {pending ? "Bezig…" : paused ? "Verzenden weer aanzetten" : "Alles stilzetten"}
      </Button>
      <p className="text-xs text-muted">
        {paused
          ? "Er gaat nu niets uit, ook niet van andere campagnes."
          : "Zet in één klik al het campagneverzenden stil."}
      </p>
    </div>
  );
}
