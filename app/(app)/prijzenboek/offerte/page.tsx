/**
 * De offerte-calculator is verhuisd naar /calculator (eigen plek in het
 * Verkoop-menu — het Prijzenboek is puur prijsbeheer). Oude links en
 * bladwijzers, inclusief "opnieuw calculeren"-links met maten in de query,
 * komen hier nog binnen en gaan één-op-één door.
 */
import { redirect } from "next/navigation";

export default async function OfferteRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] != null),
  ).toString();
  redirect(query ? `/calculator?${query}` : "/calculator");
}
