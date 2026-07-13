CREATE TABLE `galleries` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`event_date` integer,
	`password_hash` text,
	`client_info_mode` text DEFAULT 'off' NOT NULL,
	`watermark_enabled` integer DEFAULT false NOT NULL,
	`download_enabled` integer DEFAULT false NOT NULL,
	`selection_export_enabled` integer DEFAULT true NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`cover_photo_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `galleries_slug_unique` ON `galleries` (`slug`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`filename` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_gallery_id_filename_unique` ON `photos` (`gallery_id`,`filename`);--> statement-breakpoint
CREATE TABLE `selections` (
	`photo_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`photo_id`, `visitor_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`name` text,
	`email` text,
	`session_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitors_session_token_unique` ON `visitors` (`session_token`);