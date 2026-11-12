CREATE TABLE `cast_favorites` (
	`member_id` text NOT NULL,
	`cast_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cast_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cast_favorites_pair` ON `cast_favorites` (`member_id`,`cast_id`);--> statement-breakpoint
CREATE INDEX `cast_favorites_cast` ON `cast_favorites` (`cast_id`,`created`);--> statement-breakpoint
CREATE TABLE `diary_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `diary_photos_owner_created` ON `diary_photos` (`owner`,`created`);--> statement-breakpoint
ALTER TABLE `cast_posts` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `cast_posts` ADD `photo_id` text REFERENCES diary_photos(id);