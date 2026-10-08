CREATE TABLE IF NOT EXISTS invitations (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), email TEXT NOT NULL,
 role_id TEXT NOT NULL REFERENCES roles(id), token_hash TEXT NOT NULL UNIQUE, invited_by TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'PENDING', expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_invite_org ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS ix_invite_email ON invitations(email);
