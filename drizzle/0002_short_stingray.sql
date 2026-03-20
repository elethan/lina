CREATE TABLE `downtime_events` (
	`downtime_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`system_id` integer NOT NULL,
	`wo_id` integer NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`notes` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pm_engineers` (
	`pm_instance_id` integer,
	`engineer_id` integer,
	PRIMARY KEY(`pm_instance_id`, `engineer_id`),
	FOREIGN KEY (`pm_instance_id`) REFERENCES `asset_pm`(`pm_instance_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineer_id`) REFERENCES `engineers`(`engineer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `pm_tasks` ADD `category` text;--> statement-breakpoint
ALTER TABLE `user_requests` ADD `downtime_start_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_pm_results_pm_task_unique` ON `asset_pm_results` (`pm_instance_id`,`task_id`);