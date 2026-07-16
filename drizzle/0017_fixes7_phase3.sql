ALTER TABLE `galleries` ADD `bib_search` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `face_search` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `event_page` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `face_batch_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `face_batch_done` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `face_batch_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `face_batch_error` text;--> statement-breakpoint
ALTER TABLE `galleries` ADD `face_batch_updated_at` integer;--> statement-breakpoint
CREATE TABLE `photo_bibs` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`gallery_id` text NOT NULL,
	`number` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_bibs_gallery_number_idx` ON `photo_bibs` (`gallery_id`,`number`);--> statement-breakpoint
CREATE INDEX `photo_bibs_photo_idx` ON `photo_bibs` (`photo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `photo_bibs_photo_number_idx` ON `photo_bibs` (`photo_id`,`number`);--> statement-breakpoint
CREATE TABLE `photo_faces` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`gallery_id` text NOT NULL,
	`face_idx` integer NOT NULL,
	`embedding` blob NOT NULL,
	`bbox_x` integer NOT NULL,
	`bbox_y` integer NOT NULL,
	`bbox_w` integer NOT NULL,
	`bbox_h` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_faces_gallery_idx` ON `photo_faces` (`gallery_id`);--> statement-breakpoint
CREATE INDEX `photo_faces_photo_idx` ON `photo_faces` (`photo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `photo_faces_photo_face_idx` ON `photo_faces` (`photo_id`,`face_idx`);
