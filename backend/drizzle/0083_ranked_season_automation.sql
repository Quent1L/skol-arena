-- A ranked season has always been driven entirely by hand: three admin calls (create, start,
-- end) with nothing in the server watching a date. Chaining one season into the next therefore
-- meant re-entering every setting, and — the part that actually hurts — every player had to
-- register again, because the match creation form builds its player picker from
-- tournament_participants. A fresh season starts with that table empty, so nobody can create
-- the first match until each of them has re-joined.
--
-- This table is what turns a season into a link in a chain. It is deliberately NOT columns on
-- ranked_season_configs: that row holds the MMR maths of one season, and ranked-season.service
-- replays the whole season whenever one of its fields moves. Changing a season's duration must
-- never recalculate an MMR.
--
-- next_season_id is what makes the rollover idempotent and resumable. It records the successor
-- once it exists, so a job that dies between "end the old season" and "create the new one" is
-- picked up again on the next tick instead of either stalling or creating a second successor.

CREATE TABLE IF NOT EXISTS "ranked_season_automations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "duration_days" integer NOT NULL,
  "name_template" text NOT NULL,
  "season_number" integer DEFAULT 1 NOT NULL,
  "carry_participants" boolean DEFAULT true NOT NULL,
  "participants_min_matches" integer DEFAULT 0 NOT NULL,
  "carry_tiers" boolean DEFAULT true NOT NULL,
  "tier_scaling_mode" text DEFAULT 'keep' NOT NULL,
  "carry_mmr" boolean DEFAULT true NOT NULL,
  "soft_reset_factor" real DEFAULT 0.5 NOT NULL,
  "next_rollover_at" timestamp with time zone,
  "next_season_id" uuid,
  "last_rollover_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ranked_season_automations"
    ADD CONSTRAINT "ranked_season_automations_tournament_id_unique" UNIQUE ("tournament_id");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ranked_season_automations"
    ADD CONSTRAINT "ranked_season_automations_tournament_id_tournaments_id_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ranked_season_automations"
    ADD CONSTRAINT "ranked_season_automations_next_season_id_tournaments_id_fk"
    FOREIGN KEY ("next_season_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- The scheduler scans for due rollovers every hour; a partial index keeps that scan on the
-- handful of live chains rather than on every season that ever ran.
CREATE INDEX IF NOT EXISTS "ranked_season_automations_due_idx"
  ON "ranked_season_automations" ("next_rollover_at")
  WHERE "enabled" AND "next_season_id" IS NULL;
