import { createMiddleware } from 'hono/factory';
import { and, eq } from 'drizzle-orm';
import type { Ctx } from '../middleware';
import * as T from '../db/schema';

export type Role = 'OWNER' | 'STAFF';
export const PERMISSION_CATALOG = [
  ['dashboard','read'],
  ['categories','read'], ['categories','create'], ['categories','edit'], ['categories','delete'],
  ['units','read'], ['units','create'], ['units','edit'], ['units','delete'],
  ['vehicles','read'], ['vehicles','create'], ['vehicles','edit'], ['vehicles','delete'],
  ['items','read'], ['items','create'], ['items','edit'], ['items','delete'],
  ['applications','read'], ['applications','create'], ['applications','edit'], ['applications','delete'],
  ['boms','read'], ['boms','create'], ['boms','edit'], ['boms','delete'],
  ['stock','read'],
  ['production','read'], ['production','create'],
  ['audit','read'],
  ['roles','read'], ['roles','create'], ['roles','edit'], ['roles','delete'],
  ['members','read'], ['members','edit'],
] as const;

export const requireRole = (...allowed: Role[]) => createMiddleware<Ctx>(async (c, next) => {
  const role = c.get('role') as Role;
  if (!allowed.includes(role)) return c.json({ error: 'Forbidden', requiredRoles: allowed }, 403);
  await next();
});

export const ownerOnly = requireRole('OWNER');
export const ownerOrStaff = requireRole('OWNER', 'STAFF');

export const requirePermission = (key: string) => createMiddleware<Ctx>(async (c, next) => {
  if (c.get('role') === 'OWNER') return next();
  const roleId = c.get('roleId');
  if (!roleId) return c.json({ error: 'Forbidden', requiredPermission: key }, 403);
  const rows = await c.get('db').select({ id: T.permissions.id })
    .from(T.rolePermissions)
    .innerJoin(T.permissions, eq(T.rolePermissions.permissionId, T.permissions.id))
    .where(and(eq(T.rolePermissions.roleId, roleId), eq(T.permissions.key, key)))
    .limit(1);
  if (!rows.length) return c.json({ error: 'Forbidden', requiredPermission: key }, 403);
  await next();
});

export const permission = requirePermission;