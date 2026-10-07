-- Notifies the other players of a match whose finalized result was corrected, by its
-- author within the self-amend window or by an organizer at any time.
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'MATCH_RESULT_CORRECTED';
