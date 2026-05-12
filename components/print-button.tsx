"use client";

import { Printer } from "lucide-react";

import { buttonClass } from "@/components/ui";

export function PrintButton({ label = "Printen" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass()}>
      <Printer className="size-4" />
      {label}
    </button>
  );
}
