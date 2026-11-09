CREATE TABLE `auth_identities` (
	`auth_id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_member_id_unique` ON `auth_identities` (`member_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer NOT NULL
);
