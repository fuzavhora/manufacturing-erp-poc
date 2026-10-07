CREATE TABLE `bom_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`bom_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_id` text NOT NULL,
	`scrap_percent` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bom_id`) REFERENCES `boms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_bomline_org_bom` ON `bom_lines` (`organization_id`,`bom_id`);--> statement-breakpoint
CREATE TABLE `boms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`finished_item_id` text NOT NULL,
	`vehicle_application_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`output_quantity` real DEFAULT 1 NOT NULL,
	`output_unit_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`finished_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_application_id`) REFERENCES `product_vehicle_applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`output_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_bom_org_item` ON `boms` (`organization_id`,`finished_item_id`,`vehicle_application_id`);--> statement-breakpoint
CREATE TABLE `item_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_cat_org_name` ON `item_categories` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`item_type` text NOT NULL,
	`category_id` text,
	`base_unit_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`base_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_org_sku` ON `items` (`organization_id`,`sku`);--> statement-breakpoint
CREATE INDEX `ix_item_org_name` ON `items` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `ix_item_org_created` ON `items` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_membership` ON `memberships` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `ix_mem_org` ON `memberships` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_code_unique` ON `organizations` (`code`);--> statement-breakpoint
CREATE TABLE `product_vehicle_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`item_id` text NOT NULL,
	`vehicle_variant_id` text NOT NULL,
	`year_from` integer NOT NULL,
	`year_to` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_variant_id`) REFERENCES `vehicle_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_app_org_item` ON `product_vehicle_applications` (`organization_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `stock_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`item_id` text NOT NULL,
	`qty_in` real DEFAULT 0 NOT NULL,
	`qty_out` real DEFAULT 0 NOT NULL,
	`unit_id` text NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_led_org_item` ON `stock_ledger` (`organization_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `ix_led_org_created` ON `stock_ledger` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`unit_type` text NOT NULL,
	`decimal_precision` integer DEFAULT 2 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_unit_org_name` ON `units` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `vehicle_makes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_make_org_name` ON `vehicle_makes` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `vehicle_models` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`make_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`make_id`) REFERENCES `vehicle_makes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_model_org_name` ON `vehicle_models` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `vehicle_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`engine` text,
	`fuel_type` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_variant_org_name` ON `vehicle_variants` (`organization_id`,`name`);