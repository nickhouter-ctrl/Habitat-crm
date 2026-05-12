/**
 * Tell the public website (habitat-one) to revalidate pages — e.g. after a
 * property is published/changed. No-op until WEBSITE_REVALIDATE_URL is set.
 */
export async function revalidateWebsite(
  paths: string[] = ["/properties"],
): Promise<void> {
  const url = process.env.WEBSITE_REVALIDATE_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ paths }),
      cache: "no-store",
    });
  } catch (err) {
    console.warn("[habitat-crm] website revalidation failed:", err);
  }
}
