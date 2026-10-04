import { redirect } from "next/navigation";
import { requireModuleRead } from "@/lib/auth/guards";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireModuleRead("prijzen");
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(sp)) if (typeof value === "string") query.set(key,value);
  redirect(`/wederverkopers/prijzen?${query}`);
}
