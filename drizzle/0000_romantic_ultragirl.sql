CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`expires_at` integer,
	`password` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `asset_info` (
	`info_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`magnetron_date` integer,
	`thyratron_date` integer,
	`ht_hours` real,
	`days_since_breakdown` integer DEFAULT 0,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `asset_pm` (
	`pm_instance_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`engineer_id` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`completed_at` integer,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineer_id`) REFERENCES `engineers`(`engineer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `asset_pm_results` (
	`result_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pm_instance_id` integer,
	`task_id` integer,
	`status` text NOT NULL,
	`findings` text,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`pm_instance_id`) REFERENCES `asset_pm`(`pm_instance_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `pm_tasks`(`task_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `asset_systems` (
	`asset_id` integer,
	`system_id` integer,
	PRIMARY KEY(`asset_id`, `system_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`asset_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`serial_number` text NOT NULL,
	`model_name` text,
	`warranty_years` integer,
	`cat_date` integer,
	`installation_date` integer,
	`status` text DEFAULT 'Operational' NOT NULL,
	`site_id` integer,
	`info_id` integer,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`site_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`info_id`) REFERENCES `asset_info`(`info_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_serial_number_unique` ON `assets` (`serial_number`);--> statement-breakpoint
CREATE TABLE `engineers` (
	`engineer_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`user_id` text,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pm_tasks` (
	`task_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`system_id` integer,
	`instruction` text NOT NULL,
	`doc_section` text,
	`interval_months` integer NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`site_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_name` text NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_site_name_unique` ON `sites` (`site_name`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`last_modified` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `systems` (
	`system_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`system_name` text NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `systems_system_name_unique` ON `systems` (`system_name`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text DEFAULT 'radiographer'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_requests` (
	`request_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`system_id` integer,
	`reported_by` text NOT NULL,
	`comment_text` text NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_order_requests` (
	`wo_id` integer,
	`request_id` integer,
	PRIMARY KEY(`wo_id`, `request_id`),
	FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `user_requests`(`request_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`wo_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`description_of_fault` text NOT NULL,
	`start_at` integer DEFAULT CURRENT_TIMESTAMP,
	`end_at` integer,
	`status` text DEFAULT 'Open' NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action
);
