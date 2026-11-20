-- Opening a match marks its notifications read, and the announcements list counts each
-- one's recipients: both filter notifications by these columns, as do the cascades.
CREATE INDEX IF NOT EXISTS "notifications_match_idx" ON "notifications" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_announcement_idx" ON "notifications" USING btree ("announcement_id");
