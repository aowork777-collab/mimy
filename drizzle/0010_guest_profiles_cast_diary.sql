CREATE TABLE `cast_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`cast_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`cast_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cast_posts_cast_created` ON `cast_posts` (`cast_id`,`created`);--> statement-breakpoint
CREATE TABLE `guest_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`topics` text DEFAULT '' NOT NULL,
	`style` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
