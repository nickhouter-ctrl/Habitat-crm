"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Camera-streepjescodescanner (mobiel). Gebruikt @zxing/browser met de
 * achtercamera; roept onScan aan zodra een code is herkend. Dynamisch geïmporteerd
 * zodat er niets op de server draait.
 */
export function BarcodeScanner({
  onScan,
  paused = false,
}: {
  onScan: (code: string) => void;
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paused) return;
    let stop: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (result && !cancelled) onScanRef.current(result.getText());
          },
        );
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch {
        setError("Camera niet beschikbaar — geef toestemming, of typ de code hieronder.");
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [paused]);

  return (
    <div className="overflow-hidden rounded-xl border bg-black">
      {error ? (
        <div className="p-4 text-sm text-white">{error}</div>
      ) : (
        <div className="relative">
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          {!paused && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-3/4 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
