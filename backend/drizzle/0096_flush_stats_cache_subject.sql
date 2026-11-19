-- The tournament stats now carry a `subject` ("player" | "team"), and fixed-team
-- tournaments rank teams instead of each teammate. Cached payloads lack the field and
-- still list static teams per player. This cache is read-through: dropping the rows
-- only costs one recompute on the next read.
DELETE FROM "computed_data" WHERE "key" = 'stats';
