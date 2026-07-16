CREATE TABLE `rate_limit_hits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_hits_key_at_idx` ON `rate_limit_hits` (`key`,`at`);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`user_agent_hash` text,
	`ip_hash` text,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_revoked_idx` ON `admin_sessions` (`revoked_at`);
