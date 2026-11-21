-- A null max_uses means the code never runs out (an open club link, a QR code on a poster).
ALTER TABLE "invitation_codes" ALTER COLUMN "max_uses" DROP NOT NULL;
