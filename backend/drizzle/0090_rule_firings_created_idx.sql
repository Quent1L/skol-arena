-- The global rules-engine stats screen reads the firings of every rule at once,
-- newest first. The existing indexes all lead with the rule or the player, so the
-- feed and the global timeline would otherwise scan the whole table.
CREATE INDEX IF NOT EXISTS "rule_firings_created_idx"
  ON "rule_firings" ("created_at" DESC, "id" DESC);
