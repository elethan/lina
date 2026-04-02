PRAGMA foreign_keys=OFF;

--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text DEFAULT 'therapist' NOT NULL
);

--> statement-breakpoint
INSERT INTO `__new_user` (`id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `role`)
SELECT
	`id`,
	`name`,
	`email`,
	`email_verified`,
	`image`,
	`created_at`,
	`updated_at`,
	CASE
		WHEN `role` = 'user' THEN 'therapist'
		ELSE `role`
	END
FROM `user`;

--> statement-breakpoint
DROP TABLE `user`;

--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;

--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

--> statement-breakpoint
UPDATE `role_permissions`
SET `role` = 'therapist'
WHERE `role` = 'user';

--> statement-breakpoint
PRAGMA foreign_keys=ON;
