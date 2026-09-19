ALTER TABLE `users` ADD `bio` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_users_community ON users(verified,status,role);
