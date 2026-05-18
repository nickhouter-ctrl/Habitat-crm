"use client";

import { useTransition } from "react";

import { CATEGORIES } from "@/lib/email-categories";
import { updateAttachmentCategory } from "./actions";

const CATEGORY_KEYS = Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>;

export function CategorySelect({
  attachmentId,
  current,
}: {
  attachmentId: string;
  current: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={current}
      disabled={pending}
      onChange={(e) => {
        const newCat = e.target.value;
        if (newCat === current) return;
        start(async () => {
          await updateAttachmentCategory({ id: attachmentId, category: newCat });
        });
      }}
      className="w-full rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
    >
      {CATEGORY_KEYS.map((k) => (
        <option key={k} value={k}>
          {CATEGORIES[k]}
        </option>
      ))}
    </select>
  );
}
