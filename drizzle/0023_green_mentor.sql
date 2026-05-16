CREATE TABLE "email_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"imap_uid" integer,
	"thread_id" text,
	"from_email" text,
	"from_name" text,
	"to_email" text,
	"cc_email" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"received_at" timestamp with time zone,
	"attachments" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"linked_purchase_order_id" uuid,
	"linked_quote_request_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sync_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"last_imap_uid" integer DEFAULT 0 NOT NULL,
	"last_polled_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_linked_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("linked_purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_linked_quote_request_id_quote_requests_id_fk" FOREIGN KEY ("linked_quote_request_id") REFERENCES "public"."quote_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_inbox_message_id_idx" ON "email_inbox" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_inbox_status_idx" ON "email_inbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_inbox_received_at_idx" ON "email_inbox" USING btree ("received_at");