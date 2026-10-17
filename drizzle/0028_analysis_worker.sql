ALTER TABLE `photos` ADD `alt_source` text;--> statement-breakpoint
ALTER TABLE `photo_bibs` ADD `confidence` real;--> statement-breakpoint
ALTER TABLE `photo_bibs` ADD `engine` text;--> statement-breakpoint
CREATE TABLE `worker_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);--> statement-breakpoint
CREATE TABLE `photo_analysis` (
	`photo_id` text NOT NULL,
	`task` text NOT NULL,
	`engine` text,
	`version` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`leased_until` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`photo_id`, `task`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `photo_analysis_task_status_idx` ON `photo_analysis` (`task`,`status`);
