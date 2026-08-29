import Image from "next/image";

// Publiek klantportaal — per-request (sessie-cookie), nooit prerenderen.
export const dynamic = "force-dynamic";

export const metadata = { title: "Klantportaal — Habitat One" };

export default function KlantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Image src="/brand/habitat-one-logo.png" alt="Habitat One" width={140} height={36} priority />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-xs text-muted sm:px-6">
        Habitat One · Xàbia / Costa Blanca · hi@habitat-one.com
      </footer>
    </div>
  );
}
