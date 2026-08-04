CREATE TABLE `user_profiles` (
	`visitor_id` text PRIMARY KEY NOT NULL,
	`cohort_year` integer NOT NULL,
	`completed_semesters` integer NOT NULL,
	`major_1` text NOT NULL,
	`major_2` text,
	`major_3` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
