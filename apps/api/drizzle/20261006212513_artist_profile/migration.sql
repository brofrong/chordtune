ALTER TABLE "artist" ADD COLUMN "deezer_id" bigint;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "picture_url" text;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "picture_small_url" text;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "wikidata_id" text;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "wiki" jsonb;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
ALTER TABLE "artist" ADD CONSTRAINT "artist_deezer_id_key" UNIQUE("deezer_id");