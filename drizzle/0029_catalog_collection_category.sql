-- Bovenliggende groep voor de samplecatalogus-filter (bv. "Flexibel Stone" / "Vloeren").
ALTER TABLE "catalog_collections" ADD COLUMN IF NOT EXISTS "category" text;
UPDATE "catalog_collections"
  SET "category" = CASE WHEN "name_en" = 'PVC Vloeren' THEN 'Vloeren' ELSE 'Flexibel Stone' END
  WHERE "category" IS NULL;
