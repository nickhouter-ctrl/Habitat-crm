import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { AppSidebar } from "@/components/app-sidebar";

// The whole authenticated app is per-request (session + live data) — never
// prerender it at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Aantal openstaande offerte-aanvragen — badge-melding in de zijbalk.
  const [pending] = await db
    .select({ value: count() })
    .from(quoteRequests)
    .where(eq(quoteRequests.status, "pending"));

  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar user={session.user} pendingCount={pending?.value ?? 0} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[96rem] px-4 pb-10 pt-20 sm:px-6 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
