-- A season automation used to mean one thing: chain into a successor at term. Some disciplines
-- only want the season closed on the date the admin typed, with nobody opening the next one.
--
-- `mode` keeps both on the same row and the same hourly job rather than adding a second
-- mechanism. 'chain' is the existing behaviour, so every row already stored keeps it. In
-- 'close' mode the term is the season's own end_date, and the chain settings (duration, name
-- template, carry-over) stay stored but are ignored — switching back restores them.

ALTER TABLE "ranked_season_automations"
  ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'chain' NOT NULL;

--> statement-breakpoint
-- `season_number` was a counter the chain carried itself: 1 on the first automation, +1 per
-- rollover. It ignored every season created by hand, so enabling the chain after three manual
-- seasons named the fourth one "Saison 2".
--
-- The number is now derived from how many ranked seasons the scope already holds, and the column
-- only caches the result for the form's preview — hence the new name: it is the number the NEXT
-- season will take, not this one's.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ranked_season_automations' AND column_name = 'season_number'
  ) THEN
    ALTER TABLE "ranked_season_automations" RENAME COLUMN "season_number" TO "next_season_number";
  END IF;
END $$;
