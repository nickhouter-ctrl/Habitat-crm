import { redirect } from "next/navigation";
import { and, count, eq, isNull, ne } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { emailInbox, purchaseOrders, quoteRequests } from "@/lib/db/schema";
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

  // Badge-tellers in de zijbalk: open aanvragen, nieuwe mails, te-betalen inkoop.
  const [[pending], [inboxNew], [poUnpaid]] = await Promise.all([
    db.select({ value: count() }).from(quoteRequests).where(eq(quoteRequests.status, "pending")),
    db.select({ value: count() }).from(emailInbox).where(eq(emailInbox.status, "new")),
    db
      .select({ value: count() })
      .from(purchaseOrders)
      .where(and(ne(purchaseOrders.status, "draft"), isNull(purchaseOrders.paidAt))),
  ]);
  const badges: Record<string, number> = {
    "/aanvragen": pending?.value ?? 0,
    "/inbox": inboxNew?.value ?? 0,
    "/inkooporders": poUnpaid?.value ?? 0,
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar user={session.user} badges={badges} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[96rem] px-4 pb-10 pt-20 sm:px-6 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
