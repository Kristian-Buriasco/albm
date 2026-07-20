ALTER TABLE `galleries` ADD `storage_quota_bytes` integer;--> statement-breakpoint
ALTER TABLE `galleries` ADD `kiosk_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `kiosk_token` text;--> statement-breakpoint
ALTER TABLE `galleries` ADD `meta_title` text;--> statement-breakpoint
ALTER TABLE `galleries` ADD `meta_description` text;--> statement-breakpoint
ALTER TABLE `galleries` ADD `noindex` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`visitor_id` text,
	`rating` integer NOT NULL,
	`quote` text NOT NULL,
	`author_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `testimonials_gallery_idx` ON `testimonials` (`gallery_id`);--> statement-breakpoint
CREATE INDEX `testimonials_status_idx` ON `testimonials` (`status`);
