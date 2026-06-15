"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Ververst de huidige (server)pagina elke N seconden — voor live-cijfers. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
