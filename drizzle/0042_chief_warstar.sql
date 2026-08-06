-- Indexes + partiële unique constraints uit de systeemreview (2026-08-06).
-- Vier ervan bestaan al in productie (handmatig aangemaakt); daarom IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS "contacts_source_idx" ON "contacts" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_project_idx" ON "deliveries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_contact_idx" ON "deliveries" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_deal_idx" ON "documents" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_kind_issue_idx" ON "documents" USING btree ("kind","issue_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_company_idx" ON "documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_source_doc_idx" ON "documents" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_kind_docnumber_idx" ON "documents" USING btree ("kind","doc_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_inbox_linked_po_idx" ON "email_inbox" USING btree ("linked_purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_uidx" ON "products" USING btree ("sku") WHERE sku is not null and sku <> '';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_barcode_uidx" ON "products" USING btree ("barcode") WHERE barcode is not null and barcode <> '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_paid_idx" ON "purchase_orders" USING btree ("paid_at") WHERE paid_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_suggested_project_idx" ON "purchase_orders" USING btree ("suggested_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_order_date_idx" ON "purchase_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_due_date_idx" ON "purchase_orders" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_processed_idx" ON "webhook_events" USING btree ("processed_at");