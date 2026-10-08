CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_org_name ON roles(organization_id, name);
CREATE INDEX IF NOT EXISTS ix_role_org ON roles(organization_id);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS ix_rp_role ON role_permissions(role_id);

ALTER TABLE memberships ADD COLUMN role_id TEXT REFERENCES roles(id);

INSERT OR IGNORE INTO permissions (id,key,module,action) VALUES
('perm-dashboard-read','dashboard.read','dashboard','read'),
('perm-categories-read','categories.read','categories','read'),('perm-categories-create','categories.create','categories','create'),('perm-categories-edit','categories.edit','categories','edit'),('perm-categories-delete','categories.delete','categories','delete'),
('perm-units-read','units.read','units','read'),('perm-units-create','units.create','units','create'),('perm-units-edit','units.edit','units','edit'),('perm-units-delete','units.delete','units','delete'),
('perm-vehicles-read','vehicles.read','vehicles','read'),('perm-vehicles-create','vehicles.create','vehicles','create'),('perm-vehicles-edit','vehicles.edit','vehicles','edit'),('perm-vehicles-delete','vehicles.delete','vehicles','delete'),
('perm-items-read','items.read','items','read'),('perm-items-create','items.create','items','create'),('perm-items-edit','items.edit','items','edit'),('perm-items-delete','items.delete','items','delete'),
('perm-applications-read','applications.read','applications','read'),('perm-applications-create','applications.create','applications','create'),('perm-applications-edit','applications.edit','applications','edit'),('perm-applications-delete','applications.delete','applications','delete'),
('perm-boms-read','boms.read','boms','read'),('perm-boms-create','boms.create','boms','create'),('perm-boms-edit','boms.edit','boms','edit'),('perm-boms-delete','boms.delete','boms','delete'),
('perm-stock-read','stock.read','stock','read'),
('perm-production-read','production.read','production','read'),('perm-production-create','production.create','production','create'),
('perm-audit-read','audit.read','audit','read'),
('perm-roles-read','roles.read','roles','read'),('perm-roles-create','roles.create','roles','create'),('perm-roles-edit','roles.edit','roles','edit'),('perm-roles-delete','roles.delete','roles','delete'),
('perm-members-read','members.read','members','read'),('perm-members-edit','members.edit','members','edit');

INSERT OR IGNORE INTO roles (id,organization_id,name,description,is_system)
SELECT 'staff-' || id,id,'Staff','Default operational staff role',1 FROM organizations;

UPDATE memberships SET role_id='staff-' || organization_id WHERE role='STAFF' AND role_id IS NULL;

INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r, permissions p
WHERE r.is_system=1 AND r.name='Staff' AND p.key IN (
'dashboard.read','categories.read','units.read','vehicles.read','items.read','applications.read','boms.read','stock.read','production.read','production.create'
);
