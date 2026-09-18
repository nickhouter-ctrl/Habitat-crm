ALTER TABLE "email_inbox" ADD COLUMN "mailbox_user" text;--> statement-breakpoint
CREATE INDEX "email_inbox_mailbox_idx" ON "email_inbox" USING btree ("mailbox_user");