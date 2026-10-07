CREATE TABLE `inventory_balances` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `item_id` text NOT NULL,
  `quantity` real NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_balance_org_item` ON `inventory_balances` (`organization_id`,`item_id`);
--> statement-breakpoint
CREATE INDEX `ix_balance_org` ON `inventory_balances` (`organization_id`);
--> statement-breakpoint
INSERT INTO `inventory_balances` (`id`,`organization_id`,`item_id`,`quantity`,`updated_at`)
SELECT lower(hex(randomblob(16))), organization_id, item_id,
       COALESCE(SUM(qty_in - qty_out), 0), datetime('now')
FROM `stock_ledger`
GROUP BY organization_id, item_id;
