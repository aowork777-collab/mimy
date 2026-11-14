ALTER TABLE `reservations` ADD `payment_provider` text DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `stripe_session_id` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `stripe_checkout_expires` integer;--> statement-breakpoint
ALTER TABLE `reservations` ADD `stripe_payment_intent` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `stripe_paid_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_stripe_session` ON `reservations` (`stripe_session_id`);