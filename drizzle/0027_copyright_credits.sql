ALTER TABLE `galleries` ADD `copyright_holder` text;--> statement-breakpoint
ALTER TABLE `galleries` ADD `show_credits` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `galleries` ADD `xmp_copyright` text;
