ALTER TABLE `galleries` ADD `auto_publish_on_upload` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `deliver_raw` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `forensic_watermark` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `download_offer_web` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `download_offer_print` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `download_offer_original` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `keep_exif_on_download` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `allow_gps_in_download` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `is_raw` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `format` text;--> statement-breakpoint
CREATE TABLE `download_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`mark_key` text NOT NULL,
	`photo_id` text NOT NULL,
	`gallery_id` text NOT NULL,
	`visitor_id` text,
	`account_id` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_marks_mark_key_idx` ON `download_marks` (`mark_key`);--> statement-breakpoint
CREATE INDEX `download_marks_photo_idx` ON `download_marks` (`photo_id`);--> statement-breakpoint
CREATE INDEX `download_marks_at_idx` ON `download_marks` (`at`);
