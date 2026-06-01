"use client";

import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui";

/**
 * Submit-knop die direct uitschakelt zodra het formulier verstuurt — voorkomt
 * dubbel-klikken (en dus dubbele verzending) en toont meteen een "bezig"-label.
 */
export function SubmitButton({
  children,
  pendingLabel = "Bezig…",
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
