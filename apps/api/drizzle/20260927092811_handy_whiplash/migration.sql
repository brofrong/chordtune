CREATE TABLE "arrangement_like" (
	"user_id" text,
	"arrangement_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "arrangement_like_pkey" PRIMARY KEY("user_id","arrangement_id")
);
--> statement-breakpoint
CREATE TABLE "arrangement_play" (
	"user_id" text,
	"arrangement_id" text,
	"count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "arrangement_play_pkey" PRIMARY KEY("user_id","arrangement_id")
);
--> statement-breakpoint
CREATE TABLE "arrangement_save" (
	"user_id" text,
	"arrangement_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "arrangement_save_pkey" PRIMARY KEY("user_id","arrangement_id")
);
--> statement-breakpoint
CREATE TABLE "arrangement_view" (
	"arrangement_id" text,
	"viewer_key" text,
	"day" date,
	CONSTRAINT "arrangement_view_pkey" PRIMARY KEY("arrangement_id","viewer_key","day")
);
--> statement-breakpoint
ALTER TABLE "arrangement" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arrangement" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arrangement" ADD COLUMN "save_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arrangement_like" ADD CONSTRAINT "arrangement_like_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement_like" ADD CONSTRAINT "arrangement_like_arrangement_id_arrangement_id_fkey" FOREIGN KEY ("arrangement_id") REFERENCES "arrangement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement_play" ADD CONSTRAINT "arrangement_play_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement_play" ADD CONSTRAINT "arrangement_play_arrangement_id_arrangement_id_fkey" FOREIGN KEY ("arrangement_id") REFERENCES "arrangement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement_save" ADD CONSTRAINT "arrangement_save_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement_save" ADD CONSTRAINT "arrangement_save_arrangement_id_arrangement_id_fkey" FOREIGN KEY ("arrangement_id") REFERENCES "arrangement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arrangement_view" ADD CONSTRAINT "arrangement_view_arrangement_id_arrangement_id_fkey" FOREIGN KEY ("arrangement_id") REFERENCES "arrangement"("id") ON DELETE CASCADE;