-- Every win rate is now wins over matches played, and a tie in a tournament without
-- draws is no longer counted as a draw. The global player stats cache is also keyed by
-- the organizations a viewer may see, so the old "stats:global" rows are never read
-- again. Both caches are read-through: dropping the rows only costs one recompute.
DELETE FROM "player_computed_data";
--> statement-breakpoint
DELETE FROM "computed_data" WHERE "key" = 'stats';
