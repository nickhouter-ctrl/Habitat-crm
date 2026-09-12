import AccountsPage from "@/components/account-management-page";
export const metadata = { title: "Windows-accounts" };
export default async function WindowsAccountsPage({ searchParams }: { searchParams: Promise<{tab?:string;q?:string;sort?:string;page?:string;source?:string}> }) {
  return <AccountsPage searchParams={searchParams} windowsPage />;
}
