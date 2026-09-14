CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`picture` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `listings` ADD `seller_sub` text;--> statement-breakpoint
ALTER TABLE `listings` ADD `claimed_by_sub` text;