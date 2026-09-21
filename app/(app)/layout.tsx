import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { huidigeToegangOfNull } from "@/lib/auth/access";
import { isLocale } from "@/lib/i18n";
import { TaalProvider } from "@/components/taal-provider";
import { TaalKeuze } from "@/components/taal-keuze";
import { zetTaal } from "@/lib/i18n/actions";
import { magAlles, startPadVoorRol } from "@/lib/auth/modules";
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
  // De rol komt uit de database, niet uit het sessiecookie: dat leeft 30 dagen
  // en loopt na een rolwijziging een dag achter.
  const toegang = await huidigeToegangOfNull();
  if (!toegang) redirect("/login");

  // Rollen met volledige toegang hoeven niet op pad gecontroleerd te worden —
  // en dan kan een ontbrekende header ze ook nooit buitensluiten.
  if (!magAlles(toegang.rol)) {
    const pad = (await headers()).get("x-pathname");
    // Geen pad bekend? Dan kunnen we niet controleren, en valt het dicht.
    if (!pad || !toegang.magPad(pad)) {
      const start = startPadVoorRol(toegang.rol);
      // Nooit naar het pad waar we al staan omleiden — dat is een lus.
      redirect(pad === start ? "/login" : `${start}?geen-toegang=1`);
    }
  }

  const badges = await verzamelNavBadges(toegang.rol, toegang.email);
  const locale = isLocale(toegang.locale) ? toegang.locale : "nl";

  return (
    <TaalProvider locale={locale}>
    <div className="flex min-h-dvh bg-background">
      {/* Alleen platte velden: de zijbalk is een client-component. */}
      <AppSidebar user={{ name: toegang.name, email: toegang.email, role: toegang.rol }} badges={badges} />
      <div className="min-w-0 flex-1">
        {/* Desktop top-bar met globale zoekbalk (mobiel zit zoeken in de bovenbalk). */}
        <header className="sticky top-0 z-20 hidden h-14 items-center gap-4 border-b bg-surface/95 px-6 backdrop-blur lg:flex">
          <GlobalSearch className="w-full max-w-xl" />
          {/* Taal bovenaan, niet weggestopt in Instellingen: wie het systeem
              niet in zijn eigen taal ziet, vindt dat menu juist niet. */}
          <TaalKeuze huidig={locale} zet={zetTaal} compact className="ml-auto" />
        </header>
        <main className="mx-auto max-w-[96rem] px-4 pb-10 pt-20 sm:px-6 lg:pt-6">{children}</main>
      </div>
    </div>
    </TaalProvider>
  );
}
