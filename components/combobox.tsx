"use client";

import { ChevronsUpDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ComboOption = {
  value: string;
  label: string;
  group?: string;
  hint?: string;
};

/**
 * Type-to-filter picker. Renders a visible search box plus a hidden `<input name>`
 * for form submission. Options can carry a `group` for headed sections.
 *
 * - `allowCustom`: typed text that doesn't match an option becomes the value
 *   (useful for e.g. a product-category field where you may type a new one).
 * - `onSelect`: notified when an option (or, with `allowCustom`, a typed value) is chosen.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder = "Typ om te zoeken…",
  allowCustom = false,
  clearable = false,
  resetOnSelect = false,
  emptyText = "Niets gevonden",
  className,
  onSelect,
}: {
  name?: string;
  options: ComboOption[];
  defaultValue?: string;
  placeholder?: string;
  allowCustom?: boolean;
  clearable?: boolean;
  resetOnSelect?: boolean;
  emptyText?: string;
  className?: string;
  onSelect?: (value: string, option?: ComboOption) => void;
}) {
  const initial = options.find((o) => o.value === defaultValue);
  const [value, setValue] = useState<string>(defaultValue);
  const [query, setQuery] = useState<string>(initial?.label ?? (allowCustom ? defaultValue : ""));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) commitClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchSel = (o: ComboOption) => o.value === value && o.label.toLowerCase() === q;
    if (!q) return options;
    return options.filter(
      (o) =>
        matchSel(o) ||
        o.label.toLowerCase().includes(q) ||
        (o.group ?? "").toLowerCase().includes(q),
    );
  }, [query, options, value]);

  function pick(o: ComboOption) {
    onSelect?.(o.value, o);
    if (resetOnSelect) {
      setValue("");
      setQuery("");
    } else {
      setValue(o.value);
      setQuery(o.label);
    }
    setOpen(false);
  }

  function clear() {
    setValue("");
    setQuery("");
    setOpen(false);
    onSelect?.("");
  }

  function commitClose() {
    if (allowCustom) {
      const trimmed = query.trim();
      const exact = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());
      if (exact) {
        setValue(exact.value);
        setQuery(exact.label);
        onSelect?.(exact.value, exact);
      } else {
        setValue(trimmed);
        onSelect?.(trimmed);
      }
    } else {
      // Revert the box to the currently-selected option's label.
      const sel = options.find((o) => o.value === value);
      setQuery(sel?.label ?? "");
    }
    setOpen(false);
  }

  // Build the rendered list with optional group headers.
  const items: Array<{ kind: "header"; group: string } | { kind: "option"; o: ComboOption; idx: number }> = [];
  let optIdx = 0;
  let lastGroup: string | undefined;
  for (const o of filtered) {
    if (o.group && o.group !== lastGroup) {
      items.push({ kind: "header", group: o.group });
      lastGroup = o.group;
    }
    items.push({ kind: "option", o, idx: optIdx });
    optIdx++;
  }
  const optionCount = optIdx;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="relative">
        <input
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHi(0);
            if (!allowCustom) setValue("");
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHi((h) => Math.min(h + 1, Math.max(optionCount - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              if (open) {
                e.preventDefault();
                const target = filtered[hi];
                if (target) pick(target);
                else if (allowCustom) commitClose();
              }
            } else if (e.key === "Escape") {
              commitClose();
            }
          }}
          className="w-full rounded-md border bg-background px-3 py-2 pr-14 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        {clearable && value && (
          <button
            type="button"
            onClick={clear}
            title="Wissen"
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </div>

      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-surface py-1 text-sm shadow-lg">
          {optionCount === 0 ? (
            <li className="px-3 py-2 text-muted">{emptyText}</li>
          ) : (
            items.map((it, i) =>
              it.kind === "header" ? (
                <li
                  key={`h-${it.group}-${i}`}
                  className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted"
                >
                  {it.group}
                </li>
              ) : (
                <li key={it.o.value}>
                  <button
                    type="button"
                    onMouseEnter={() => setHi(it.idx)}
                    onClick={() => pick(it.o)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left",
                      it.idx === hi ? "bg-accent/10 text-accent" : "hover:bg-background",
                      it.o.value === value && "font-medium",
                    )}
                  >
                    <span className="truncate">{it.o.label}</span>
                    {it.o.hint && (
                      <span className="shrink-0 text-xs text-muted">{it.o.hint}</span>
                    )}
                  </button>
                </li>
              ),
            )
          )}
        </ul>
      )}
    </div>
  );
}
