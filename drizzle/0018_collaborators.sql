CREATE TABLE `collaborators` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`last_login_at` integer,
	`disabled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collaborators_email_unique` ON `collaborators` (`email`);--> statement-breakpoint
CREATE TABLE `gallery_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`gallery_id` text NOT NULL,
	`kind` text NOT NULL,
	`collaborator_id` text,
	`token_hash` text,
	`capabilities` text DEFAULT '["upload","organize"]' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`revoked_at` integer,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collaborator_id`) REFERENCES `collaborators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gallery_grants_gallery_idx` ON `gallery_grants` (`gallery_id`);--> statement-breakpoint
CREATE INDEX `gallery_grants_collaborator_idx` ON `gallery_grants` (`collaborator_id`);--> statement-breakpoint
CREATE TABLE `collaborator_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`collaborator_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collaborator_id`) REFERENCES `collaborators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `photos` ADD `uploaded_by` text;--> statement-breakpoint
ALTER TABLE `admin_credentials` ADD `collaborator_id` text;--> statement-breakpoint
ALTER TABLE `admin_sessions` ADD `collaborator_id` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_type` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_id` text;
