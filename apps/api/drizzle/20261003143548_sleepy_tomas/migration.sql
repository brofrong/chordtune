ALTER TABLE "arrangement" ADD COLUMN "tuning" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "arrangement" ADD COLUMN "voicings" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "arrangement" ADD COLUMN "zen_mode" text;