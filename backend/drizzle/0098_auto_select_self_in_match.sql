-- Whether match entry starts with the user already picked as a player.
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "auto_select_self_in_match" boolean DEFAULT true NOT NULL;
