import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { verzamelNavBadges } from "@/lib/nav-badges";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";

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

  const badges = await verzamelNavBadges();

  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar user={session.user} badges={badges} />
      <div className="min-w-0 flex-1">
        {/* Desktop top-bar met globale zoekbalk (mobiel zit zoeken in de bovenbalk). */}
        <header className="sticky top-0 z-20 hidden h-14 items-center border-b bg-surface/95 px-6 backdrop-blur lg:flex">
          <GlobalSearch className="w-full max-w-xl" />
        </header>
        <main className="mx-auto max-w-[96rem] px-4 pb-10 pt-20 sm:px-6 lg:pt-6">{children}</main>
      </div>
    </div>
  );
}
