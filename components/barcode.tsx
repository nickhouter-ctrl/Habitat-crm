"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

import { barcodeFormat } from "@/lib/barcode";

/** Renders `value` as an SVG barcode (EAN-13 if it's a valid GTIN, otherwise Code 128). */
export function Barcode({
  value,
  height = 50,
  width = 1.6,
  fontSize = 13,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: barcodeFormat(value),
        height,
        width,
        fontSize,
        margin: 6,
        displayValue: true,
        background: "transparent",
      });
    } catch {
      // invalid value for the chosen format — leave it blank
    }
  }, [value, height, width, fontSize]);
  if (!value) return null;
  return <svg ref={ref} className={className} aria-label={`Barcode ${value}`} />;
}
