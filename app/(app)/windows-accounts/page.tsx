import { tekst as uiTranslation } from '@/lib/i18n/server';
import AccountsPage from "@/components/account-management-page";
export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Windows-accounts") };
}
export default async function WindowsAccountsPage({ searchParams }: { searchParams: Promise<{tab?:string;q?:string;sort?:string;page?:string;source?:string}> }) {
  return <AccountsPage searchParams={searchParams} windowsPage />;
}
