CREATE TABLE "mail_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"storage_path" text NOT NULL,
	"public_url" text,
	"category" text DEFAULT 'other' NOT NULL,
	"supplier_tag" text,
	"received_at" timestamp with time zone,
	"amount_eur" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_email_id_email_inbox_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."email_inbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_attachments_email_idx" ON "mail_attachments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "mail_attachments_category_idx" ON "mail_attachments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "mail_attachments_supplier_idx" ON "mail_attachments" USING btree ("supplier_tag");--> statement-breakpoint
CREATE INDEX "mail_attachments_received_idx" ON "mail_attachments" USING btree ("received_at");