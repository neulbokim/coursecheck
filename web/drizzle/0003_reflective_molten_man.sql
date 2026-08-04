CREATE TABLE "admin_login_attempts" (
	"client_hash" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
