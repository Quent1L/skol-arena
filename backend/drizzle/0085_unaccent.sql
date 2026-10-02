-- Player and user searches should ignore accents as well as case: "eloise" has to find
-- "Éloïse". `unaccent` ships with the PostgreSQL contrib modules and is a trusted
-- extension since PG13, but creating it still needs CREATE on the database, which a
-- role that only owns its schema does not have.
--
-- Accent folding is an improvement, not a requirement, so a refusal must not take the
-- instance down: the error is downgraded to a warning and the migration commits anyway.
-- At startup the backend checks whether `unaccent(text)` is callable and falls back to a
-- plain case-insensitive ILIKE when it is not (see utils/accent-folding.ts).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'unaccent extension not installed (%): searches stay case-insensitive but accent-sensitive', SQLERRM;
END
$$;
