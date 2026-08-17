import Link from "next/link";

import { Th } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Kolomkop die op zichzelf sorteert, gedeeld door de documenten- en
 * inkooporderlijst.
 *
 * Klikken op de actieve kolom draait de richting om; een andere kolom begint
 * bij de richting die voor dát soort gegevens het nuttigst is — datums en
 * bedragen aflopend (nieuwste/grootste eerst), tekst oplopend (A→Z). Zonder dat
 * onderscheid moet je bij elke geldkolom twee keer klikken voor het antwoord
 * dat je zocht.
 *
 * De sortering staat in de URL, dus een gesorteerde lijst is te delen en te
 * bookmarken.
 */
export function SorteerbareKop({
  sleutel,
  actief,
  oplopend,
  aflopendEerst = false,
  href,
  className,
  children,
}: {
  sleutel: string;
  /** Wordt er op deze kolom gesorteerd? */
  actief: boolean;
  /** Huidige richting (alleen betekenisvol als `actief`). */
  oplopend: boolean;
  /** Eerste klik aflopend i.p.v. oplopend — voor datums en bedragen. */
  aflopendEerst?: boolean;
  /** Bouwt de link; krijgt de gewenste sleutel en richting. */
  href: (sleutel: string, richting: "asc" | "desc") => string;
  className?: string;
  children: React.ReactNode;
}) {
  const volgende: "asc" | "desc" = actief ? (oplopend ? "desc" : "asc") : aflopendEerst ? "desc" : "asc";
  return (
    <Th className={className}>
      <Link
        href={href(sleutel, volgende)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          actief ? "text-foreground" : "text-muted",
        )}
        title={`Sorteren op ${typeof children === "string" ? children : sleutel}`}
      >
        {children}
        <span aria-hidden className={cn("text-[10px]", actief ? "opacity-100" : "opacity-0")}>
          {actief && oplopend ? "▲" : "▼"}
        </span>
      </Link>
    </Th>
  );
}
