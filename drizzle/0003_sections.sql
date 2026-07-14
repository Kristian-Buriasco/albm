CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `photos` ADD `section_id` text REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE set null;
