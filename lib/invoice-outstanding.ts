/** Remaining invoice balance in cents; unissued/cancelled credits have no effect. */
export function invoiceOutstanding(
  invoice: { totalEur: string | null; paidEur: string | null },
  credits: { totalEur: string | null; status: string }[],
): number {
  const cents = (value: string | null) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) throw new Error("Invalid invoice amount");
    return Math.round(amount * 100);
  };
  const credited = credits
    .filter(c => !["draft", "void", "rejected"].includes(c.status))
    .reduce((sum, c) => sum + cents(c.totalEur), 0);
  return Math.max(0, cents(invoice.totalEur) - cents(invoice.paidEur) - credited) / 100;
}
