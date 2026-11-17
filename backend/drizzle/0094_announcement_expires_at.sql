-- Optional end date of an announcement: past it, its pop-up stops showing.
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
