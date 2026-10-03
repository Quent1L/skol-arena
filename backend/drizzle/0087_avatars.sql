ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "avatar_version" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_blobs" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" bytea NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
