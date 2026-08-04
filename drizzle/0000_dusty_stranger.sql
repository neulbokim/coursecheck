CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"major_key" text,
	"result_bucket" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"visitor_id" text PRIMARY KEY NOT NULL,
	"cohort_year" integer NOT NULL,
	"completed_semesters" integer NOT NULL,
	"major_1" text NOT NULL,
	"major_2" text,
	"major_3" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
