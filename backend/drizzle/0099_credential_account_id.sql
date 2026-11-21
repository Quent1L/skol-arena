-- Better Auth 1.7 finds a password account by (provider_id 'credential', account_id = user_id).
-- Accounts written by init-admin and the demo builders carried the email as account_id: the
-- bootstrap admin could no longer sign in with a password. Idempotent.
UPDATE "account" SET "account_id" = "user_id" WHERE "provider_id" = 'credential' AND "account_id" <> "user_id";
