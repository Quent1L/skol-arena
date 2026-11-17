-- Announcements written by an organizer for every player of one tournament, or by a
-- super admin for every player of the app. Delivered in the notification feed, as a
-- pop-up, or both; `announcement_views` records which pop-ups a player dismissed.
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."announcement_audience" AS ENUM('all', 'tournament');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "audience" "announcement_audience" NOT NULL,
  "tournament_id" uuid REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "in_feed" boolean DEFAULT true NOT NULL,
  "as_popup" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_tournament_created_idx"
  ON "announcements" ("tournament_id", "created_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_views" (
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "announcement_views_announcement_id_user_id_pk" PRIMARY KEY ("announcement_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "announcement_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_announcements_id_fk"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
