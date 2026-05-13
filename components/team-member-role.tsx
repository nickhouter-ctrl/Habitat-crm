"use client";

import { useRef, useState, useTransition } from "react";

export function TeamMemberRoleSelect({
  initialRole,
  action,
  roles,
}: {
  initialRole: string;
  action: (formData: FormData) => Promise<void> | void;
  roles: { value: string; label: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState(initialRole);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form ref={formRef} action={action} className="flex items-center gap-1.5">
      <select
        name="role"
        value={role}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setRole(v);
          startTransition(() => {
            // Submit programmatically — server action runs, revalidates the page.
            formRef.current?.requestSubmit();
            // Brief visual confirmation.
            setTimeout(() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }, 200);
          });
        }}
        className="h-8 w-36 rounded-md border bg-background px-2 py-0 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted">{pending ? "Opslaan…" : saved ? "✓ opgeslagen" : ""}</span>
    </form>
  );
}
