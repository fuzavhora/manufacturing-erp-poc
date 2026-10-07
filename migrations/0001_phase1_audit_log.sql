CREATE TABLE `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `user_id` text NOT NULL,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text,
  `metadata` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_audit_org_created` ON `audit_log` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_audit_org_entity` ON `audit_log` (`organization_id`,`entity_type`,`entity_id`);
