PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_asset_info` (
	`info_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`magnetron_date` text,
	`thyratron_date` text,
	`ht_hours` real,
	`days_since_breakdown` integer DEFAULT 0,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_asset_info`("info_id", "magnetron_date", "thyratron_date", "ht_hours", "days_since_breakdown", "updated_at", "deleted_at") SELECT "info_id", "magnetron_date", "thyratron_date", "ht_hours", "days_since_breakdown", "updated_at", "deleted_at" FROM `asset_info`;--> statement-breakpoint
DROP TABLE `asset_info`;--> statement-breakpoint
ALTER TABLE `__new_asset_info` RENAME TO `asset_info`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_asset_pm` (
	`pm_instance_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`system_id` integer,
	`interval_months` integer,
	`start_at` text,
	`engineer_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineer_id`) REFERENCES `engineers`(`engineer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_asset_pm`("pm_instance_id", "asset_id", "system_id", "interval_months", "start_at", "engineer_id", "created_at", "completed_at", "updated_at", "deleted_at") SELECT "pm_instance_id", "asset_id", "system_id", "interval_months", "start_at", "engineer_id", "created_at", "completed_at", "updated_at", "deleted_at" FROM `asset_pm`;--> statement-breakpoint
DROP TABLE `asset_pm`;--> statement-breakpoint
ALTER TABLE `__new_asset_pm` RENAME TO `asset_pm`;--> statement-breakpoint
CREATE TABLE `__new_asset_pm_results` (
	`result_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pm_instance_id` integer,
	`task_id` integer,
	`status` text NOT NULL,
	`findings` text,
	`engineer` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`pm_instance_id`) REFERENCES `asset_pm`(`pm_instance_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `pm_tasks`(`task_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_asset_pm_results`("result_id", "pm_instance_id", "task_id", "status", "findings", "engineer", "updated_at", "deleted_at") SELECT "result_id", "pm_instance_id", "task_id", "status", "findings", "engineer", "updated_at", "deleted_at" FROM `asset_pm_results`;--> statement-breakpoint
DROP TABLE `asset_pm_results`;--> statement-breakpoint
ALTER TABLE `__new_asset_pm_results` RENAME TO `asset_pm_results`;--> statement-breakpoint
CREATE TABLE `__new_assets` (
	`asset_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`serial_number` text NOT NULL,
	`model_name` text,
	`warranty_years` integer,
	`cat_date` text,
	`installation_date` text,
	`status` text DEFAULT 'Operational' NOT NULL,
	`site_id` integer,
	`info_id` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`site_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`info_id`) REFERENCES `asset_info`(`info_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_assets`("asset_id", "serial_number", "model_name", "warranty_years", "cat_date", "installation_date", "status", "site_id", "info_id", "updated_at", "deleted_at") SELECT "asset_id", "serial_number", "model_name", "warranty_years", "cat_date", "installation_date", "status", "site_id", "info_id", "updated_at", "deleted_at" FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
CREATE UNIQUE INDEX `assets_serial_number_unique` ON `assets` (`serial_number`);--> statement-breakpoint
CREATE TABLE `__new_engineers` (
	`engineer_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`user_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_engineers`("engineer_id", "first_name", "last_name", "user_id", "updated_at", "deleted_at") SELECT "engineer_id", "first_name", "last_name", "user_id", "updated_at", "deleted_at" FROM `engineers`;--> statement-breakpoint
DROP TABLE `engineers`;--> statement-breakpoint
ALTER TABLE `__new_engineers` RENAME TO `engineers`;--> statement-breakpoint
CREATE TABLE `__new_pm_tasks` (
	`task_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`system_id` integer,
	`instruction` text NOT NULL,
	`doc_section` text,
	`interval_months` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pm_tasks`("task_id", "system_id", "instruction", "doc_section", "interval_months", "updated_at", "deleted_at") SELECT "task_id", "system_id", "instruction", "doc_section", "interval_months", "updated_at", "deleted_at" FROM `pm_tasks`;--> statement-breakpoint
DROP TABLE `pm_tasks`;--> statement-breakpoint
ALTER TABLE `__new_pm_tasks` RENAME TO `pm_tasks`;--> statement-breakpoint
CREATE TABLE `__new_sites` (
	`site_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_name` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_sites`("site_id", "site_name", "updated_at", "deleted_at") SELECT "site_id", "site_name", "updated_at", "deleted_at" FROM `sites`;--> statement-breakpoint
DROP TABLE `sites`;--> statement-breakpoint
ALTER TABLE `__new_sites` RENAME TO `sites`;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_site_name_unique` ON `sites` (`site_name`);--> statement-breakpoint
CREATE TABLE `__new_spare_parts` (
	`part_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`description` text NOT NULL,
	`location` text,
	`stock_level` integer DEFAULT 0,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`site_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_spare_parts`("part_id", "site_id", "description", "location", "stock_level", "updated_at", "deleted_at") SELECT "part_id", "site_id", "description", "location", "stock_level", "updated_at", "deleted_at" FROM `spare_parts`;--> statement-breakpoint
DROP TABLE `spare_parts`;--> statement-breakpoint
ALTER TABLE `__new_spare_parts` RENAME TO `spare_parts`;--> statement-breakpoint
CREATE TABLE `__new_sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`last_modified` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sync_state`("table_name", "last_modified") SELECT "table_name", "last_modified" FROM `sync_state`;--> statement-breakpoint
DROP TABLE `sync_state`;--> statement-breakpoint
ALTER TABLE `__new_sync_state` RENAME TO `sync_state`;--> statement-breakpoint
CREATE TABLE `__new_systems` (
	`system_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`system_name` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_systems`("system_id", "system_name", "updated_at", "deleted_at") SELECT "system_id", "system_name", "updated_at", "deleted_at" FROM `systems`;--> statement-breakpoint
DROP TABLE `systems`;--> statement-breakpoint
ALTER TABLE `__new_systems` RENAME TO `systems`;--> statement-breakpoint
CREATE UNIQUE INDEX `systems_system_name_unique` ON `systems` (`system_name`);--> statement-breakpoint
CREATE TABLE `__new_user_requests` (
	`request_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`system_id` integer,
	`reported_by` text NOT NULL,
	`comment_text` text NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`engineer_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineer_id`) REFERENCES `engineers`(`engineer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_requests`("request_id", "asset_id", "system_id", "reported_by", "comment_text", "status", "engineer_id", "created_at", "updated_at", "deleted_at") SELECT "request_id", "asset_id", "system_id", "reported_by", "comment_text", "status", "engineer_id", "created_at", "updated_at", "deleted_at" FROM `user_requests`;--> statement-breakpoint
DROP TABLE `user_requests`;--> statement-breakpoint
ALTER TABLE `__new_user_requests` RENAME TO `user_requests`;--> statement-breakpoint
CREATE TABLE `__new_work_order_notes` (
	`note_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wo_id` integer NOT NULL,
	`engineer_id` integer,
	`note_text` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineer_id`) REFERENCES `engineers`(`engineer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_work_order_notes`("note_id", "wo_id", "engineer_id", "note_text", "created_at") SELECT "note_id", "wo_id", "engineer_id", "note_text", "created_at" FROM `work_order_notes`;--> statement-breakpoint
DROP TABLE `work_order_notes`;--> statement-breakpoint
ALTER TABLE `__new_work_order_notes` RENAME TO `work_order_notes`;--> statement-breakpoint
CREATE TABLE `__new_work_orders` (
	`wo_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`system_id` integer,
	`description_of_fault` text NOT NULL,
	`created_at` text,
	`start_at` text,
	`end_at` text,
	`status` text DEFAULT 'Open' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`system_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_work_orders`("wo_id", "asset_id", "system_id", "description_of_fault", "created_at", "start_at", "end_at", "status", "updated_at", "deleted_at") SELECT "wo_id", "asset_id", "system_id", "description_of_fault", "created_at", "start_at", "end_at", "status", "updated_at", "deleted_at" FROM `work_orders`;--> statement-breakpoint
DROP TABLE `work_orders`;--> statement-breakpoint
ALTER TABLE `__new_work_orders` RENAME TO `work_orders`;