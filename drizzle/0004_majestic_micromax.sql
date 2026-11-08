CREATE TABLE `admin_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`email` text NOT NULL,
	`creator` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`accepted_by` text,
	`accepted_at` integer,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invites_hash_unique` ON `admin_invites` (`hash`);