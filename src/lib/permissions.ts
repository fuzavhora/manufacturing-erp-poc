import { createMiddleware } from 'hono/factory';
import type { Ctx } from './middleware';

export type Role = 'OWNER' | 'STAFF';

export const requireRole = (...allowed: Role[]) =>
  createMiddleware<Ctx>(async (c, next) => {
    const role = c.get('role') as Role;
    if (!allowed.includes(role)) {
      return c.json({ error: 'Forbidden', requiredRoles: allowed }, 403);
    }
    await next();
  });

export const ownerOnly = requireRole('OWNER');
export const ownerOrStaff = requireRole('OWNER', 'STAFF');
