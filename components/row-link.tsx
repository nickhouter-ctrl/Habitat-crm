"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Een tabelrij (<tr>) die als geheel klikbaar is en naar `href` navigeert. */
export function RowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      tabIndex={0}
      className={cn("cursor-pointer transition-colors hover:bg-background/60", className)}
    >
      {children}
    </tr>
  );
}

/** Een link binnen een klikbare rij die zijn eigen bestemming houdt (klik bubbelt niet door). */
export function StopLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className={cn("relative z-10", className)}
    >
      {children}
    </Link>
  );
}
