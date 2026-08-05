CREATE TABLE "everytime_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"step" text,
	"reason_code" text NOT NULL,
	"semester" text,
	"elapsed_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "everytime_failures_created_at_idx" ON "everytime_failures" USING btree ("created_at");