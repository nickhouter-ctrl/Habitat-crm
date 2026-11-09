import { describe, expect, it } from "vitest";
import { invoiceOutstanding } from "../invoice-outstanding";

describe("invoice reminder balance", () => {
  const invoice = { totalEur: "14792.01", paidEur: "0" };
  it("requests only the remaining fee after a return credit", () => {
    expect(invoiceOutstanding(invoice, [{ totalEur: "12107.26", status: "sent" }])).toBe(2684.75);
  });
  it("ignores draft, rejected and cancelled credits", () => {
    expect(invoiceOutstanding(invoice, [
      { totalEur: "12107.26", status: "sent" },
      ...["draft", "void", "rejected"].map(status => ({ status, totalEur: "2684.75" })),
    ])).toBe(2684.75);
  });
  it("deducts payments and multiple issued credits", () => {
    expect(invoiceOutstanding({ totalEur: "100.00", paidEur: "20.00" }, [
      { totalEur: "10.01", status: "sent" }, { totalEur: "15.99", status: "paid" },
    ])).toBe(54);
  });
  it("does not request payment on fully credited or overpaid invoices", () => {
    expect(invoiceOutstanding(invoice, [{ totalEur: "14792.01", status: "sent" }])).toBe(0);
    expect(invoiceOutstanding({ totalEur: "10", paidEur: "11" }, [])).toBe(0);
  });
  it("rejects invalid amounts before sending a reminder", () => {
    expect(() => invoiceOutstanding({ totalEur: "invalid", paidEur: "0" }, [])).toThrow();
  });
});
