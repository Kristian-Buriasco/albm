CREATE TABLE `upload_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `gallery_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `galleries` ADD COLUMN `folder_id` text REFERENCES `gallery_folders`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `selection_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `selection_lists_gallery_visitor_idx` ON `selection_lists` (`gallery_id`,`visitor_id`);
--> statement-breakpoint
CREATE TABLE `selections_new` (
	`photo_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`list_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `selection_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `selections_new` (`photo_id`, `visitor_id`, `list_id`, `created_at`)
SELECT `photo_id`, `visitor_id`, NULL, `created_at` FROM `selections`;
--> statement-breakpoint
DROP TABLE `selections`;
--> statement-breakpoint
ALTER TABLE `selections_new` RENAME TO `selections`;
--> statement-breakpoint
CREATE UNIQUE INDEX `selections_photo_visitor_list_idx` ON `selections` (`photo_id`,`visitor_id`,COALESCE(`list_id`, ''));
--> statement-breakpoint
CREATE TABLE `client_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_accounts_email_unique` ON `client_accounts` (`email`);
--> statement-breakpoint
ALTER TABLE `visitors` ADD COLUMN `account_id` text REFERENCES `client_accounts`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`gallery_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `client_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
