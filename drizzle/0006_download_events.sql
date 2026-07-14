CREATE TABLE `download_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gallery_id` text NOT NULL,
	`photo_id` text,
	`visitor_id` text,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
