CREATE TABLE `work_order_engineers` (
	`wo_id` integer,
	`engineer_id` integer,
	PRIMARY KEY(`wo_id`, `engineer_id`),
	FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineer_id`) REFERENCES `engineers`(`engineer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `asset_pm` ADD `system_id` integer REFERENCES systems(system_id);--> statement-breakpoint
ALTER TABLE `asset_pm` ADD `interval_months` integer;--> statement-breakpoint
ALTER TABLE `asset_pm` ADD `start_at` integer;--> statement-breakpoint
ALTER TABLE `asset_pm_results` ADD `engineer` text;--> statement-breakpoint
ALTER TABLE `user_requests` ADD `created_at` integer DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `system_id` integer REFERENCES systems(system_id);