-- Kostopbouw (uren x ploegtarief + materiaal) en snijverlies per post.
ALTER TABLE "price_book_items" ADD COLUMN IF NOT EXISTS "waste_pct" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_book_items" ADD COLUMN IF NOT EXISTS "labor_hours" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "price_book_items" ADD COLUMN IF NOT EXISTS "material_cost_eur" numeric(14, 2);