CREATE TABLE "arrangement" (
	"id" text PRIMARY KEY,
	"song_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"rhythms" jsonb DEFAULT '[]' NOT NULL,
	"chords" text[] DEFAULT '{}'::text[] NOT NULL,
	"key" text,
	"capo" integer,
	"tempo" integer,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song" (
	"id" text PRIMARY KEY,
	"artist_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "song_artist_slug_unique" UNIQUE("artist_id","slug")
);
--> statement-breakpoint
CREATE INDEX "arrangement_song_idx" ON "arrangement" ("song_id");--> statement-breakpoint
CREATE INDEX "arrangement_author_idx" ON "arrangement" ("author_id");--> statement-breakpoint
CREATE INDEX "arrangement_chords_idx" ON "arrangement" USING gin ("chords");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_name_lower_idx" ON "artist" (lower("name"));--> statement-breakpoint
ALTER TABLE "arrangement" ADD CONSTRAINT "arrangement_song_id_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "song"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement" ADD CONSTRAINT "arrangement_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_artist_id_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE CASCADE;