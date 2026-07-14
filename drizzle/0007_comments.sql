CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`visitor_id` text,
	`commenter_token` text,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`is_photographer` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
