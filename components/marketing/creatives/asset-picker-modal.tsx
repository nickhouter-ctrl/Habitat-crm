"use client";

/**
 * Popup-beeldkiezer voor de editor (taak U6): volledige bibliotheek in een
 * toegankelijke modal (native <dialog>: focus-trap en Esc gratis), met
 * zoeken, groeperen op categorie/bron/tag, het IG-signaal ("organisch
 * sterk", §8 — hint, geen bewijs) en multi-select met teller. Meerdere
 * beelden gekozen = "Maak set" genereert straks specs per beeld × formaat ×
 * taal.
 */
import { Check, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge, Input, buttonClass } from "@/components/ui";
import {
  allSubcategories,
  groupForSubcategory,
  OVERIG,
} from "@/lib/marketing/taxonomy";
import { cn } from "@/lib/utils";

export interface PickerAsset {
  id: string;
  url: string | null;
  label: string;
  productId: string | null;
  category: string | null;
  source: string;
  tags: string[];
  /** Organische IG-post scoorde bovengemiddeld — hint, geen bewijs. */
  organicStrong: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  instagram: "Instagram",
  upload: "Upload",
  generated: "Gegenereerd",
};

type GroupBy = "categorie" | "bron" | "tag";

export function AssetPickerModal({
  open,
  assets,
  selected,
  onClose,
  onConfirm,
}: {
  open: boolean;
  assets: PickerAsset[];
  selected: string[];
  onClose: () => void;
  /** Bevestigde selectie (in klikvolgorde — het eerste beeld stuurt de preview). */
  onConfirm: (ids: string[]) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("categorie");
  const [picked, setPicked] = useState<string[]>(selected);

  /* Native dialog aansturen + selectie verversen bij openen. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPicked(selected);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectie alleen bij openen overnemen
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) =>
      [a.label, a.category ?? "", SOURCE_LABELS[a.source] ?? a.source, ...a.tags]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [assets, query]);

  const groups = useMemo(() => {
    const map = new Map<string, PickerAsset[]>();
    const add = (key: string, asset: PickerAsset) => {
      map.set(key, [...(map.get(key) ?? []), asset]);
    };
    for (const asset of filtered) {
      if (groupBy === "categorie") {
        // Taxonomie-subcategorie, getoond mét de websitemenu-groep ervoor;
        // beelden zonder (gemapte) categorie landen expliciet in "Overig".
        const sub = asset.category ?? OVERIG;
        add(sub === OVERIG ? OVERIG : `${groupForSubcategory(sub)} · ${sub}`, asset);
      } else if (groupBy === "bron") {
        add(SOURCE_LABELS[asset.source] ?? asset.source, asset);
      } else if (asset.tags.length === 0) {
        add("Zonder tag", asset);
      } else {
        for (const tag of asset.tags) add(`#${tag}`, asset);
      }
    }
    if (groupBy === "categorie") {
      // Menuvolgorde aanhouden; "Overig" achteraan.
      const order = allSubcategories().map((s) => `${groupForSubcategory(s)} · ${s}`);
      return [...map.entries()].sort(([a], [b]) => {
        if (a === OVERIG) return 1;
        if (b === OVERIG) return -1;
        return order.indexOf(a) - order.indexOf(b);
      });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "nl"));
  }, [filtered, groupBy]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="asset-picker-title"
      className="m-auto w-[min(60rem,92vw)] rounded-xl border bg-surface p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 id="asset-picker-title" className="font-semibold">
            Kies beeld(en)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op naam, categorie, bron of tag…"
            aria-label="Zoeken in de bibliotheek"
            className="w-64"
          />
          <label htmlFor="asset-picker-group" className="text-sm text-muted">
            Groepeer op
          </label>
          <select
            id="asset-picker-group"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="categorie">Categorie</option>
            <option value="bron">Bron</option>
            <option value="tag">Tag</option>
          </select>
          <span className="ml-auto text-sm text-muted" aria-live="polite">
            {filtered.length} beeld{filtered.length === 1 ? "" : "en"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Geen beelden gevonden voor deze zoekopdracht.
            </p>
          ) : (
            groups.map(([groupName, groupAssets]) => (
              <section key={groupName} className="mb-5" aria-label={groupName}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {groupName}{" "}
                  <span className="font-normal">({groupAssets.length})</span>
                </h3>
                <ul className="grid list-none grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                  {groupAssets.map((asset) => {
                    const isPicked = picked.includes(asset.id);
                    return (
                      <li key={`${groupName}-${asset.id}`}>
                        <button
                          type="button"
                          onClick={() => toggle(asset.id)}
                          aria-pressed={isPicked}
                          aria-label={`${isPicked ? "Deselecteer" : "Selecteer"} ${asset.label}`}
                          className={cn(
                            "relative block w-full overflow-hidden rounded-md border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                            isPicked ? "border-accent" : "border-transparent hover:border-border",
                          )}
                        >
                          {asset.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.url}
                              alt={asset.label}
                              loading="lazy"
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <span className="flex aspect-square w-full items-center justify-center text-[10px] text-muted">
                              geen opslag
                            </span>
                          )}
                          {isPicked && (
                            <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                              <Check className="size-3.5" aria-hidden />
                            </span>
                          )}
                          {asset.organicStrong && (
                            <span
                              className="absolute left-1 top-1"
                              title="Organisch sterk op Instagram — hint, geen bewijs"
                            >
                              <Badge tone="success" className="bg-background/85 px-1 text-[9px]">
                                <Sparkles className="size-3" aria-hidden />
                              </Badge>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t px-5 py-3.5">
          <span className="text-sm" aria-live="polite">
            {picked.length === 0
              ? "Nog niets geselecteerd"
              : `${picked.length} beeld${picked.length === 1 ? "" : "en"} geselecteerd`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost" })}>
              Annuleer
            </button>
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => onConfirm(picked)}
              className={buttonClass()}
            >
              Gebruik selectie
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
