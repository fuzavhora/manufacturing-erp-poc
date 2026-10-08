import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const pk = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => text('created_at').notNull().$defaultFn(() => new Date().toISOString());
const orgCol = () => text('organization_id').notNull().references(() => organizations.id);

export const users = sqliteTable('users', {
  id: pk(), name: text('name').notNull(), email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(), createdAt: created(),
});
export const organizations = sqliteTable('organizations', {
  id: pk(), name: text('name').notNull(), code: text('code').notNull().unique(), createdAt: created(),
});
export const memberships = sqliteTable('memberships', {
  id: pk(), userId: text('user_id').notNull().references(() => users.id),
  organizationId: orgCol(), role: text('role').notNull(), roleId: text('role_id'),
  status: text('status').notNull().default('ACTIVE'),
}, (t) => [uniqueIndex('uq_membership').on(t.userId, t.organizationId), index('ix_mem_org').on(t.organizationId)]);

export const roles = sqliteTable('roles', {
  id: pk(), organizationId: orgCol(), name: text('name').notNull(), description: text('description'),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false), createdAt: created(),
}, (t) => [uniqueIndex('uq_role_org_name').on(t.organizationId, t.name), index('ix_role_org').on(t.organizationId)]);

export const permissions = sqliteTable('permissions', {
  id: pk(), key: text('key').notNull().unique(), module: text('module').notNull(), action: text('action').notNull(),
});

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => roles.id),
  permissionId: text('permission_id').notNull().references(() => permissions.id),
}, (t) => [uniqueIndex('uq_role_permission').on(t.roleId, t.permissionId), index('ix_rp_role').on(t.roleId)]);

export const itemCategories = sqliteTable('item_categories', {
  id: pk(), organizationId: orgCol(), name: text('name').notNull(),
  parentId: text('parent_id'), isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
}, (t) => [index('ix_cat_org_name').on(t.organizationId, t.name)]);
export const units = sqliteTable('units', {
  id: pk(), organizationId: orgCol(), name: text('name').notNull(), symbol: text('symbol').notNull(),
  unitType: text('unit_type').notNull(), decimalPrecision: integer('decimal_precision').notNull().default(2),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
}, (t) => [index('ix_unit_org_name').on(t.organizationId, t.name)]);

export const vehicleMakes = sqliteTable('vehicle_makes', {
  id: pk(), organizationId: orgCol(), name: text('name').notNull(),
}, (t) => [index('ix_make_org_name').on(t.organizationId, t.name)]);
export const vehicleModels = sqliteTable('vehicle_models', {
  id: pk(), organizationId: orgCol(), makeId: text('make_id').notNull().references(() => vehicleMakes.id), name: text('name').notNull(),
}, (t) => [index('ix_model_org_name').on(t.organizationId, t.name)]);
export const vehicleVariants = sqliteTable('vehicle_variants', {
  id: pk(), organizationId: orgCol(), modelId: text('model_id').notNull().references(() => vehicleModels.id),
  name: text('name').notNull(), engine: text('engine'), fuelType: text('fuel_type'),
}, (t) => [index('ix_variant_org_name').on(t.organizationId, t.name)]);

export const items = sqliteTable('items', {
  id: pk(), organizationId: orgCol(), sku: text('sku').notNull(), name: text('name').notNull(),
  itemType: text('item_type', { enum: ['RAW_MATERIAL', 'FINISHED_GOOD'] }).notNull(),
  categoryId: text('category_id').references(() => itemCategories.id),
  baseUnitId: text('base_unit_id').notNull().references(() => units.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true), createdAt: created(),
}, (t) => [uniqueIndex('uq_item_org_sku').on(t.organizationId, t.sku), index('ix_item_org_name').on(t.organizationId, t.name),
  index('ix_item_org_created').on(t.organizationId, t.createdAt)]);
export const productVehicleApplications = sqliteTable('product_vehicle_applications', {
  id: pk(), organizationId: orgCol(), itemId: text('item_id').notNull().references(() => items.id),
  vehicleVariantId: text('vehicle_variant_id').notNull().references(() => vehicleVariants.id),
  yearFrom: integer('year_from').notNull(), yearTo: integer('year_to').notNull(),
}, (t) => [index('ix_app_org_item').on(t.organizationId, t.itemId)]);

export const boms = sqliteTable('boms', {
  id: pk(), organizationId: orgCol(), finishedItemId: text('finished_item_id').notNull().references(() => items.id),
  vehicleApplicationId: text('vehicle_application_id').notNull().references(() => productVehicleApplications.id),
  version: integer('version').notNull().default(1), outputQuantity: real('output_quantity').notNull().default(1),
  outputUnitId: text('output_unit_id').notNull().references(() => units.id),
  status: text('status').notNull().default('ACTIVE'),
  effectiveFrom: text('effective_from').notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => [index('ix_bom_org_item').on(t.organizationId, t.finishedItemId, t.vehicleApplicationId)]);
export const bomLines = sqliteTable('bom_lines', {
  id: pk(), organizationId: orgCol(), bomId: text('bom_id').notNull().references(() => boms.id),
  itemId: text('item_id').notNull().references(() => items.id), quantity: real('quantity').notNull(),
  unitId: text('unit_id').notNull().references(() => units.id), scrapPercent: real('scrap_percent').notNull().default(0),
}, (t) => [index('ix_bomline_org_bom').on(t.organizationId, t.bomId)]);

// Append-only. Current stock = SUM(qty_in - qty_out). Never updated, never deleted.
export const stockLedger = sqliteTable('stock_ledger', {
  id: pk(), organizationId: orgCol(), itemId: text('item_id').notNull().references(() => items.id),
  qtyIn: real('qty_in').notNull().default(0), qtyOut: real('qty_out').notNull().default(0),
  createdBy: text('created_by').references(() => users.id),
  unitId: text('unit_id').notNull().references(() => units.id),
  refType: text('ref_type').notNull(), refId: text('ref_id').notNull(), createdAt: created(),
}, (t) => [index('ix_led_org_item').on(t.organizationId, t.itemId), index('ix_led_org_created').on(t.organizationId, t.createdAt)]);

export const auditLog = sqliteTable('audit_log', {
  id: pk(), organizationId: orgCol(), userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), entityType: text('entity_type').notNull(), entityId: text('entity_id'),
  metadata: text('metadata'), createdAt: created(),
}, (t) => [index('ix_audit_org_created').on(t.organizationId, t.createdAt), index('ix_audit_org_entity').on(t.organizationId, t.entityType, t.entityId)]);
