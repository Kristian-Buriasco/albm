ALTER TABLE `galleries` ADD `watermark_position` text DEFAULT 'br' NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `watermark_opacity` integer DEFAULT 70 NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `watermark_scale` integer DEFAULT 25 NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `favorites_download_enabled` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `show_exif` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `show_location` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `location_name` text;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `location_lat` text;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `location_lng` text;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `comments_mode` text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `auto_expire` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `selection_limit` integer;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `limit_selections` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `track_downloads` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `galleries` ADD `social_preview` integer DEFAULT false NOT NULL;
