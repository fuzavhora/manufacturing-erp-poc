import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { memberships } from './db/schema';

export type Env = { DB: D1Database; JWT_SECRET: string; ALLOWED_ORIGIN: string; ENABLE_SEED?: string };
export type Ctx = { Bindings: Env; Variables: { userId: string; orgId: string | null; role: string; roleId: string | null; db: any } };

export const auth = createMiddleware<Ctx>(async (c, next) => {
  const h = c.req.header('Authorization') ?? '';
  if (!h.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const p: any = await verify(h.slice(7), c.env.JWT_SECRET, 'HS256');
    if (typeof p?.sub !== 'string' || !p.sub) return c.json({ error: 'Unauthorized' }, 401);
    c.set('userId', p.sub); c.set('orgId', typeof p.org === 'string' ? p.org : null);
  } catch { return c.json({ error: 'Unauthorized' }, 401); }
  c.set('db', drizzle(c.env.DB));
  await next();
});

// Org context comes ONLY from the signed token, and the membership is re-checked on every request.
export const tenant = createMiddleware<Ctx>(async (c, next) => {
  const org = c.get('orgId');
  if (!org) return c.json({ error: 'Select a company first' }, 403);
  const [m] = await c.get('db').select().from(memberships)
    .where(and(eq(memberships.userId, c.get('userId')), eq(memberships.organizationId, org), eq(memberships.status, 'ACTIVE'))).limit(1);
  if (!m) return c.json({ error: 'No active membership for this company' }, 403);
  c.set('role', m.role); c.set('roleId', m.roleId ?? null);
  await next();
});
