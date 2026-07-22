CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`event_type` text,
	`event_date` integer,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `inquiries_status_created_idx` ON `inquiries` (`status`,`created_at`);
