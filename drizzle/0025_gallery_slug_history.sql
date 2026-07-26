CREATE TABLE `gallery_slug_history` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`old_slug` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_slug_history_old_slug_unique` ON `gallery_slug_history` (`old_slug`);
