ALTER TABLE `members` ADD `blocked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `block_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `admin_protected` integer DEFAULT 0 NOT NULL;