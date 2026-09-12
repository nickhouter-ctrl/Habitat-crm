import { redirect } from "next/navigation";
import AccountsPage from "@/components/account-management-page";
export const metadata = { title: "Website-accounts" };
export default async function WebsiteAccountsPage({ searchParams }: { searchParams: Promise<{tab?:string;q?:string;sort?:string;page?:string;source?:string}> }) {
  if ((await searchParams).source === "windows") redirect("/windows-accounts");
  return <AccountsPage searchParams={searchParams} />;
}
