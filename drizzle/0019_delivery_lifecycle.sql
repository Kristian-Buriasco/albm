ALTER TABLE `galleries` ADD `delivery_state` text DEFAULT 'proofing' NOT NULL;--> statement-breakpoint
CREATE TABLE `gallery_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gallery_id` text NOT NULL,
	`type` text NOT NULL,
	`from_state` text,
	`to_state` text,
	`note` text,
	`actor_type` text DEFAULT 'owner' NOT NULL,
	`actor_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gallery_events_gallery_created_idx` ON `gallery_events` (`gallery_id`,`created_at`);
