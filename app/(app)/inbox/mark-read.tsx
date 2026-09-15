"use client";

import { useEffect, useState } from "react";
import { markMailRead } from "./read-actions";

/** Runs only for an explicitly opened message, never during link prefetch. */
export function MarkRead({ id }: { id: string }) {
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
  }}>Markeren als gelezen is niet gelukt. Opnieuw proberen</button>;
}
