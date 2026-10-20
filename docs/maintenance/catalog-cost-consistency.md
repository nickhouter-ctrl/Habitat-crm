# Catalogue cost consistency — 20 October 2026

Document, contact, project, funding, dashboard and weekly-report calculations use
`loadCatalogLineCost`. It resolves exact variant SKUs before a parent product.
Saved document cost snapshots remain authoritative. Product margin excludes
labor and missing costs; incomplete coverage is explicit.

The catalogue picker requires a positive price for the selected variant and does
not borrow the parent's sale price. Unknown costs remain unknown. Data-check lists
missing variant costs, missing variant prices and nonpositive margins separately.

## Data repair

`scripts/repair-catalog-cost-consistency.ts` defaults to a dry run. Pass `--csv=`
with the original Caracole supplier export. `--apply` also requires an absolute
`--backup=` path. The backup is private, created exclusively before mutation;
updates run in a transaction with row locks. Do not commit the backup.

Applied on 20 October 2026 to 276 products:

- 328 Caracole variant costs from exact supplier SKU matches. The original import
  contract identifies `Product variant price` as purchase ex VAT; landed cost is
  purchase where separate freight is not known. Do not treat this as a fresh
  supplier quote or infer a cost from the retail price.
- 115 missing panel variant costs copied only from the same product with exactly
  matching dimensions. No area-based interpolation or sibling-colour assumption.
- 39 panel base costs aligned with an already-priced, unique variant matching the
  base dimensions. Its purchase and total landed cost are canonical. The remainder
  is aggregate other costs, because the variant does not specify individual duty,
  transport and freight amounts. The old breakdown is in the backup.

No sale prices, stock, existing document snapshots or supplier records changed.

## Remaining evidence needed

After repair: 11,615 variants, 115 missing positive costs (88 Cornelius, 25 panels,
2 Caracole), 8 missing positive sale prices. No known positive sale price is below
its known positive cost, for either variants or base products. This is a consistency
check, not independent verification of every supplier price.

Cornelius is explicitly excluded from further data repair by the owner. For the
other 27 variants, obtain the exact supplier SKU, size/colour, purchase price and
applicable landed costs. Two Caracole variants also lack SKU and price; never copy
another colour's price. Open `/rapporten/data-check` for the current editable list.

The available 8 October Magic Stone quotation covers different series/sizes and
does not establish the missing 25 panel prices. The old general stone spreadsheet
and the 2026 CNY price list also do not establish those exact landed costs.

## Verification

35 targeted tests pass, including variant identity, legacy SKU-only lines, saved
costs, discounts, credits, missing costs and idempotent repair. TypeScript passes.
Authenticated browser checks cover the quote picker, both reported stone sizes,
unknown-cost warnings, unpriced variants, dashboard, project detail, catalogue and
data-check. No test document was saved.

The full suite reports 1,040 passing tests and three baseline failures reproduced
on the unchanged main commit: client-funding-report fixture, identical i18n keys
and existing translation coverage gaps. New translation keys are included.
