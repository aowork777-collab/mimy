CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`cast` text NOT NULL,
	`slot` text NOT NULL,
	`course` text NOT NULL,
	`minutes` integer NOT NULL,
	`price` integer NOT NULL,
	`status` text NOT NULL,
	`payment` text NOT NULL,
	`expires` integer NOT NULL,
	`created` integer NOT NULL,
	`terms` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`booking` text NOT NULL,
	`type` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slot_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`cast` text NOT NULL,
	`slot` text NOT NULL,
	`booking` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_slot` ON `slot_locks` (`owner`,`cast`,`slot`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`booking` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`booking` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
