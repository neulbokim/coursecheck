CREATE TABLE "course_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"course_count" integer NOT NULL,
	"courses" jsonb NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
