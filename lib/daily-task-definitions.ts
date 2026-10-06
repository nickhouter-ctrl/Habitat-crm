import type { ModuleKey } from "@/lib/auth/modules";

export const DAILY_TASKS = {
  mail: { title: "Mails lezen en beantwoorden", href: "/inbox", module: "inbox" },
  purchase_reviews: { title: "Inkoopfacturen keuren", href: "/inkooporders/te-verwerken", module: "inkoop" },
} satisfies Record<string, { title: string; href: string; module: ModuleKey }>;

export type DailyTaskKind = keyof typeof DAILY_TASKS;
