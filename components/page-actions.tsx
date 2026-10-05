"use client";

import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useT } from "./taal-provider";
import { ActionDialog } from "./action-dialog";

function choices(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) return [child];
    // Only presentation containers are flattened. Forms stay intact.
    if (child.type === Fragment || child.type === "div" && /\bflex\b|\bcontents\b/.test(child.props.className ?? "")) return choices(child.props.children);
    return [child];
  });
}

export function PageActions({ children }: { children: ReactNode }) {
  const t = useT(), items = choices(children);
  if (items.length <= 2) return <div className="flex flex-wrap items-center gap-2">{items}</div>;
  const primary = items.findIndex(item => isValidElement<{ className?: string; variant?: string }>(item) && (/\bbg-accent\b/.test(item.props.className ?? "") || item.props.variant === "primary"));
  const main = primary < 0 ? 0 : primary;
  const shown = new Set([main, main === 0 ? 1 : 0]);
  return <div data-page-actions className="flex flex-wrap items-center gap-2">
    {items.filter((_, i) => shown.has(i))}
    <ActionDialog title={t("Meer acties")} trigger={<><MoreHorizontal size={16}/>{t("Meer acties")}</>}>
      <div className="flex flex-col items-stretch gap-3 [&>a]:min-h-10 [&>a]:justify-start [&>a]:rounded-lg [&>a]:px-3 [&>form]:rounded-lg [&>form]:border [&>form]:p-3">{items.filter((_, i) => !shown.has(i))}</div>
    </ActionDialog>
  </div>;
}
