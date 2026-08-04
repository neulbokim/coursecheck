CREATE TABLE "feedback_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"visitor_id" text,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
