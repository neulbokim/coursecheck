CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_name` text NOT NULL,
	`major_key` text,
	`result_bucket` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
