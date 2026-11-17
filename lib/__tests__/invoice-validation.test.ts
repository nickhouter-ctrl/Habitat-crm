import { describe, expect, it } from "vitest";
import { blockingBillingFields, isBillingComplete, missingBillingFields } from "../invoice-validation";

const bedrijf = {
  name: "MB Global SL",
  vatNumber: "B12345678",
  addressLine: "Calle Mayor 1",
  postalCode: "03730",
  city: "Jávea",
  country: "España",
};

describe("facturatiegegevens", () => {
  it("laat een volledige bedrijfsklant door", () => {
    expect(missingBillingFields(null, bedrijf)).toEqual([]);
    expect(blockingBillingFields(null, bedrijf)).toEqual([]);
    expect(isBillingComplete(null, bedrijf)).toBe(true);
  });

  // De kern van de wijziging van 17-11-2026: een ontbrekende postcode of plaats
  // wordt nog wel gemeld, maar houdt het versturen niet langer tegen.
  it("meldt postcode en plaats, maar blokkeert er niet op", () => {
    const zonderPlaats = { ...bedrijf, postalCode: "", city: "" };
    expect(missingBillingFields(null, zonderPlaats)).toEqual(["postcode", "plaats"]);
    expect(blockingBillingFields(null, zonderPlaats)).toEqual([]);
    expect(isBillingComplete(null, zonderPlaats)).toBe(false);
  });

  it("blijft blokkeren zonder naam, fiscaal nummer, adres of land", () => {
    for (const veld of ["name", "vatNumber", "addressLine", "country"] as const) {
      expect(blockingBillingFields(null, { ...bedrijf, [veld]: "" })).toHaveLength(1);
    }
  });

  it("vraagt een particulier om een NIE of BSN", () => {
    const particulier = { name: "Ana Ruiz", taxId: "", addressLine: "Calle Mayor 1", postalCode: "03730", city: "Jávea", country: "España" };
    expect(blockingBillingFields(particulier, null)).toEqual(["NIE of BSN"]);
  });

  it("neemt velden van het contact over als het bedrijf ze mist", () => {
    const contact = { name: "", taxId: "", addressLine: "", postalCode: "03730", city: "Jávea", country: "" };
    const leegBedrijf = { name: "MB Global SL", vatNumber: "B12345678", addressLine: "Calle Mayor 1", postalCode: "", city: "", country: "España" };
    expect(missingBillingFields(contact, leegBedrijf)).toEqual([]);
  });
});
