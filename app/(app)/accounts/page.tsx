import { tekst as uiTranslation } from '@/lib/i18n/server';
import { redirect } from "next/navigation";
import AccountsPage from "@/components/account-management-page";
export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Website-accounts") };
}
export default async function WebsiteAccountsPage({ searchParams }: { searchParams: Promise<{tab?:string;q?:string;sort?:string;page?:string;source?:string}> }) {
  if ((await searchParams).source === "windows") redirect("/windows-accounts");
  return <AccountsPage searchParams={searchParams} />;
}
