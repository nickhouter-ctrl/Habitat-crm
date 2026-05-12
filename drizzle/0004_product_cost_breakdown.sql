ALTER TABLE "products" ADD COLUMN "purchase_cost_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "freight_cost_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "transport_cost_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "other_cost_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "duty_pct" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "target_margin_pct" numeric(6, 2);