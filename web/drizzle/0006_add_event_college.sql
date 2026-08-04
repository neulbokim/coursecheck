ALTER TABLE "analytics_events" ADD COLUMN "college" text;--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");