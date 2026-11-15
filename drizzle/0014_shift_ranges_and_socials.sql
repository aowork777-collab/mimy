DROP INDEX `one_active_reservation_per_shift`;--> statement-breakpoint
ALTER TABLE `reservations` ADD `starts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `reservations_cast_starts` ON `reservations` (`cast_id`,`starts`);--> statement-breakpoint
CREATE INDEX `reservations_customer_starts` ON `reservations` (`customer`,`starts`);--> statement-breakpoint
ALTER TABLE `cast_profiles` ADD `social_x` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cast_profiles` ADD `social_instagram` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cast_profiles` ADD `social_tiktok` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cast_profiles` ADD `social_youtube` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `ends` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE shifts SET ends=starts+3600000 WHERE ends=0;
--> statement-breakpoint
UPDATE reservations SET starts=(SELECT starts FROM shifts WHERE shifts.id=reservations.shift_id) WHERE starts=0;
--> statement-breakpoint
CREATE TRIGGER reservations_no_overlap_insert BEFORE INSERT ON reservations
WHEN NEW.status IN ('held','confirmed','completed')
BEGIN
 SELECT RAISE(ABORT,'reservation_overlap') WHERE EXISTS (
  SELECT 1 FROM reservations r WHERE r.status IN ('held','confirmed','completed')
   AND (r.cast_id=NEW.cast_id OR r.customer=NEW.customer)
   AND r.starts<NEW.starts+NEW.minutes*60000 AND r.starts+r.minutes*60000>NEW.starts
 );
END;
--> statement-breakpoint
CREATE TRIGGER reservations_no_overlap_update BEFORE UPDATE OF starts,minutes,status,cast_id,customer ON reservations
WHEN NEW.status IN ('held','confirmed','completed')
BEGIN
 SELECT RAISE(ABORT,'reservation_overlap') WHERE EXISTS (
  SELECT 1 FROM reservations r WHERE r.id<>NEW.id AND r.status IN ('held','confirmed','completed')
   AND (r.cast_id=NEW.cast_id OR r.customer=NEW.customer)
   AND r.starts<NEW.starts+NEW.minutes*60000 AND r.starts+r.minutes*60000>NEW.starts
 );
END;
--> statement-breakpoint
CREATE TRIGGER shifts_no_overlap_insert BEFORE INSERT ON shifts WHEN NEW.enabled=1
BEGIN
 SELECT RAISE(ABORT,'shift_overlap') WHERE EXISTS (
  SELECT 1 FROM shifts s WHERE s.cast_id=NEW.cast_id AND s.enabled=1
   AND s.starts<NEW.ends AND s.ends>NEW.starts
 );
END;
--> statement-breakpoint
CREATE TRIGGER shifts_no_overlap_update BEFORE UPDATE OF starts,ends,enabled ON shifts WHEN NEW.enabled=1
BEGIN
 SELECT RAISE(ABORT,'shift_overlap') WHERE EXISTS (
  SELECT 1 FROM shifts s WHERE s.id<>NEW.id AND s.cast_id=NEW.cast_id AND s.enabled=1
   AND s.starts<NEW.ends AND s.ends>NEW.starts
 );
END;
