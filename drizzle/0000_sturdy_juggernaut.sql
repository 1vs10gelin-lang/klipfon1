CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_date` ON `audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`rules` text NOT NULL,
	`source_url` text NOT NULL,
	`platform` text NOT NULL,
	`category` text NOT NULL,
	`budget` integer NOT NULL,
	`cap` integer NOT NULL,
	`rate` integer NOT NULL,
	`fee_bps` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`deadline` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "campaign_money" CHECK("campaigns"."budget">0 AND "campaigns"."cap">0 AND "campaigns"."cap"<="campaigns"."budget" AND "campaigns"."rate">0 AND "campaigns"."fee_bps">=0 AND "campaigns"."fee_bps"<=10000)
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_owner` ON `campaigns` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_status` ON `campaigns` (`status`);--> statement-breakpoint
CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft_url` text DEFAULT '' NOT NULL,
	`video_url` text,
	`video_key` text,
	`cap` integer NOT NULL,
	`eligible_views` integer DEFAULT 0 NOT NULL,
	`total_views` integer DEFAULT 0 NOT NULL,
	`earned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`published_at` integer,
	`measurement_ends` integer,
	`review_ends` integer,
	`last_measured_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`settled_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "clip_values" CHECK("clips"."cap">0 AND "clips"."earned">=0 AND "clips"."earned"<="clips"."cap" AND "clips"."eligible_views">=0 AND "clips"."total_views">="clips"."eligible_views")
);
--> statement-breakpoint
CREATE INDEX `idx_clips_campaign_status` ON `clips` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_clips_user` ON `clips` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clip_user_campaign` ON `clips` (`campaign_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clip_video_unique` ON `clips` (`video_key`);--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sender` text NOT NULL,
	`transfer_date` text NOT NULL,
	`reference` text NOT NULL,
	`bank_snapshot` text NOT NULL,
	`proof_id` text,
	`bank_ref` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "deposit_amount" CHECK("deposits"."amount">0)
);
--> statement-breakpoint
CREATE INDEX `idx_deposits_user` ON `deposits` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deposit_bank_ref_unique` ON `deposits` (`bank_ref`);--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_user` ON `ledger` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_event` ON `ledger` (`kind`,`reference`);--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text NOT NULL,
	`total_views` integer NOT NULL,
	`eligible_views` integer NOT NULL,
	`source` text NOT NULL,
	`note` text NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_measurements_clip` ON `measurements` (`clip_id`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_owner` (
	`slot` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "single_owner" CHECK("admin_owner"."slot"=1)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_user` ON `tickets` (`user_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`iban` text DEFAULT '' NOT NULL,
	`account_name` text DEFAULT '' NOT NULL,
	`social_url` text DEFAULT '' NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`terms_version` text DEFAULT '2026-09-18' NOT NULL,
	CONSTRAINT "user_role" CHECK("users"."role" in ('creator','clipper','admin'))
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`iban` text NOT NULL,
	`account_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`bank_ref` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "withdrawal_amount" CHECK("withdrawals"."amount">0)
);
--> statement-breakpoint
CREATE INDEX `idx_withdrawals_user` ON `withdrawals` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_bank_ref_unique` ON `withdrawals` (`bank_ref`);