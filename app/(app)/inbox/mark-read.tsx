"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useEffect, useState } from "react";
import { markMailRead } from "./read-actions";

/** Runs only for an explicitly opened message, never during link prefetch. */
export function MarkRead({ id }: { id: string }) {
  const uiT = useUiTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    markMailRead(id).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id]);
  if (!failed) return null;
  return <button type="button" className="m-4 text-sm text-warning" onClick={() => {
    setFailed(false);
    markMailRead(id).catch(() => setFailed(true));
  }}>{uiT("Markeren als gelezen is niet gelukt. Opnieuw proberen")}</button>;
}
