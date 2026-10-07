ALTER TABLE `stock_ledger` ADD COLUMN `created_by` text REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_audit`
AFTER INSERT ON `stock_ledger`
WHEN NEW.ref_type = 'PRODUCTION' AND NEW.created_by IS NOT NULL
BEGIN
  INSERT INTO `audit_log`
    (`id`, `organization_id`, `user_id`, `action`, `entity_type`, `entity_id`, `metadata`, `created_at`)
  SELECT lower(hex(randomblob(16))), NEW.organization_id, NEW.created_by,
         'CREATE', 'production', NEW.ref_id,
         json_object('itemId', NEW.item_id, 'qtyIn', NEW.qty_in, 'qtyOut', NEW.qty_out),
         NEW.created_at;
END;
