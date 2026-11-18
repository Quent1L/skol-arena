-- Fair-play and MVP votes: optional per tournament (tournament_vote_configs), open for
-- 48h after a match is entered (created_at), MVP frozen into matches.mvp_player_ids at the close.
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'FAIR_PLAY_ALERT';
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."fair_play_vote_value" AS ENUM('up', 'down');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."mvp_voter_role" AS ENUM('player', 'spectator');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."mvp_tie_rule" AS ENUM('co_mvp', 'none');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."mvp_same_target_limit" AS ENUM('none', 'daily', 'weekly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vote_prompt_outcome" AS ENUM('voted', 'skipped', 'dismissed', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "mvp_player_ids" uuid[];
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_vote_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL UNIQUE REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "fair_play_enabled" boolean DEFAULT false NOT NULL,
  "fair_play_min_votes" integer DEFAULT 5 NOT NULL,
  "fair_play_alert_threshold" integer DEFAULT 3 NOT NULL,
  "fair_play_public_negative_award" boolean DEFAULT false NOT NULL,
  "mvp_enabled" boolean DEFAULT false NOT NULL,
  "mvp_spectators_enabled" boolean DEFAULT true NOT NULL,
  "mvp_min_votes" integer DEFAULT 2 NOT NULL,
  "mvp_tie_rule" "mvp_tie_rule" DEFAULT 'co_mvp' NOT NULL,
  "mvp_same_target_limit" "mvp_same_target_limit" DEFAULT 'none' NOT NULL,
  "rewind_voter_awards" boolean DEFAULT true NOT NULL,
  "prompt_max_match_age_minutes" integer DEFAULT 60 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fair_play_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "voter_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "target_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "value" "fair_play_vote_value" NOT NULL,
  "tags" text[],
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fair_play_votes_match_voter_target_uq" UNIQUE ("match_id", "voter_id", "target_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fair_play_votes_target_idx" ON "fair_play_votes" ("target_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_spectators" (
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "match_spectators_match_id_user_id_pk" PRIMARY KEY ("match_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mvp_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "voter_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "target_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "voter_role" "mvp_voter_role" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mvp_votes_match_voter_uq" UNIQUE ("match_id", "voter_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mvp_votes_voter_target_idx" ON "mvp_votes" ("voter_id", "target_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vote_prompts" (
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "shown_at" timestamp with time zone DEFAULT now() NOT NULL,
  "outcome" "vote_prompt_outcome" NOT NULL,
  CONSTRAINT "vote_prompts_match_id_user_id_pk" PRIMARY KEY ("match_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_vote_prompt_states" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "consecutive_ignored" integer DEFAULT 0 NOT NULL,
  "snoozed_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fair_play_reveal_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "admin_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "target_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fair_play_reveal_logs_tournament_idx" ON "fair_play_reveal_logs" ("tournament_id", "created_at" DESC);
