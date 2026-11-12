ALTER TABLE `auth_identities` ADD `verified_email` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `test_paid_at` integer;--> statement-breakpoint
CREATE INDEX `reservations_customer_created` ON `reservations` (`customer`,`created`);--> statement-breakpoint
CREATE INDEX `reservations_cast_created` ON `reservations` (`cast_id`,`created`);--> statement-breakpoint
CREATE INDEX `audit_events_target_action` ON `audit_events` (`target`,`action`);