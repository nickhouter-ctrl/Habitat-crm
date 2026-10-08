CREATE TABLE "project_funding_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"amount_eur" numeric(14, 2) NOT NULL,
	"description" text NOT NULL,
	"internal_note" text,
	"reference_key" text NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_funding_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_funding_adjustments" ADD CONSTRAINT "project_funding_adjustments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_funding_adjustments_project_idx" ON "project_funding_adjustments" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_funding_adjustments_reference_uidx" ON "project_funding_adjustments" USING btree ("reference_key");
--> statement-breakpoint
INSERT INTO "project_funding_adjustments" (
	"project_id", "amount_eur", "description", "internal_note", "reference_key", "effective_date"
) VALUES (
	'7b06cf54-d07e-420e-aa6a-bb6e85628e0a',
	'12231.23',
	'Tegoed eerdere productbedragen Creadores, toegevoegd aan voorschotruimte',
	'Bedrag van € 12.231,23 bevestigd door Nick. De drie bedragen in de bewaarde F260014-regels tellen op tot € 12.321,23; dit tegoed volgt expliciet het bevestigde bedrag en wijzigt de historische factuurregels niet.',
	'finca-lisa-creadores-earlier-product-credit-2026-10',
	'2026-10-08'
) ON CONFLICT ("reference_key") DO NOTHING;
