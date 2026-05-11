"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { buttonClass } from "@/components/ui";
import { syncHoldedNow } from "@/lib/holded/actions";
import { cn } from "@/lib/utils";

export function SyncHoldedButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className={cn("text-xs", ok ? "text-muted" : "text-danger")}>
          {message}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncHoldedNow();
            setOk(result.ok);
            setMessage(result.message);
          })
        }
        className={buttonClass({ variant: "secondary", className })}
      >
        <RefreshCw className={cn("size-4", pending && "animate-spin")} />
        {pending ? "Synchroniseren…" : "Sync Holded"}
      </button>
    </div>
  );
}
