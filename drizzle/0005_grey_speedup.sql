CREATE INDEX IF NOT EXISTS `work_orders_asset_created_at_idx`
ON `work_orders` (`asset_id`, `created_at`);