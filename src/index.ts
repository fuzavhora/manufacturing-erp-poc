import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign } from 'hono/jwt';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import * as T from './db/schema';
import { auth, tenant, type Ctx } from './middleware';
import { verifyPw } from './lib/crypto';
import { seed } from './seed';
import { requirements } from './services/bom';
import { HttpError, produce, stockMap } from './services/production';
import { ownerOnly, ownerOrStaff } from './lib/permissions';
import { audit } from './services/audit';

const app = new Hono<Ctx>();
const parse = <S extends z.ZodTypeAny>(s: S, d: unknown): z.infer<S> => s.parse(d);
const TOKEN_TTL = 60 * 60; // 1 hour

app.use('/api/*', cors({ origin: (_o, c) => c.env.ALLOWED_ORIGIN || '*', allowHeaders: ['Authorization', 'Content-Type'] }));
app.onError((e: any, c) => {
  if (e instanceof z.ZodError) return c.json({ error: 'Validation failed', issues: e.issues }, 422);
  if (e instanceof HttpError) return c.json({ error: e.message, ...e.extra }, e.status as any);
  const m = String(e?.message ?? '') + String(e?.cause?.message ?? '');
  if (m.includes('UNIQUE')) return c.json({ error: 'Duplicate value (already exists in this company)' }, 409);
  if (m.includes('FOREIGN KEY')) return c.json({ error: 'Record is referenced by other data' }, 409);
  console.error(e);
  return c.json({ error: 'Internal error' }, 500);
});

// ---------- public ----------
app.get('/health', (c) => c.json({ ok: true }));
const issue = (c: any, sub: string, org: string | null) => sign({ sub, org, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL }, c.env.JWT_SECRET, 'HS256');
const orgsOf = (db: any, userId: string) => db.select({ id: T.organizations.id, name: T.organizations.name, code: T.organizations.code, role: T.memberships.role })
  .from(T.memberships).innerJoin(T.organizations, eq(T.memberships.organizationId, T.organizations.id))
  .where(and(eq(T.memberships.userId, userId), eq(T.memberships.status, 'ACTIVE')));

app.post('/api/auth/login', async (c) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), await c.req.json());
  const db = drizzle(c.env.DB);
  const [u] = await db.select().from(T.users).where(eq(T.users.email, b.email.toLowerCase())).limit(1);
  if (!u || !(await verifyPw(b.password, u.passwordHash))) return c.json({ error: 'Invalid email or password' }, 401);
  const organizations = await orgsOf(db, u.id);
  const token = await issue(c, u.id, organizations.length === 1 ? organizations[0].id : null);
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email }, organizations });
});

app.post('/api/dev/seed', async (c) => { // dev only: wipes + reseeds
  if (c.env.ENABLE_SEED !== 'true') return c.json({ error: 'Not found' }, 404);
  await seed(c.env.DB);
  return c.json({ ok: true });
});

// ---------- authenticated (no org needed) ----------
app.use('/api/*', async (c, next) => (c.req.path === '/api/auth/login' ? next() : auth(c, next)));
const TENANT = ['categories', 'units', 'vehicles', 'items', 'product-applications', 'boms', 'stock', 'production', 'dashboard', 'audit'];
for (const p of TENANT) app.use(`/api/${p}/*`, tenant);

// Master data is readable by OWNER + STAFF, but only OWNER may create/update/delete it.
const ownerWriteOnly = async (c: any, next: () => Promise<void>) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next();
  return ownerOnly(c, next);
};
const OWNER_ONLY_PATHS = ['/api/categories', '/api/units', '/api/vehicles/makes', '/api/vehicles/models', '/api/vehicles/variants', '/api/items', '/api/product-applications', '/api/boms'];
for (const p of OWNER_ONLY_PATHS) {
  app.use(p, ownerWriteOnly);
  app.use(`${p}/*`, ownerWriteOnly);
}
app.use('/api/production', ownerOrStaff);
app.use('/api/production/*', ownerOrStaff);

app.get('/api/auth/me', async (c) => {
  const db = c.get('db');
  const [user] = await db.select({ id: T.users.id, name: T.users.name, email: T.users.email }).from(T.users).where(eq(T.users.id, c.get('userId')));
  return c.json({ user, orgId: c.get('orgId'), organizations: await orgsOf(db, c.get('userId')) });
});
app.get('/api/organizations', async (c) => c.json(await orgsOf(c.get('db'), c.get('userId'))));
app.use('/api/audit', ownerOnly);
app.use('/api/audit/*', ownerOnly);
app.get('/api/audit', async (c) => {
  const org = c.get('orgId');
  if (!org) return c.json({ error: 'Select a company first' }, 403);
  const rows = await c.get('db').select().from(T.auditLog)
    .where(eq(T.auditLog.organizationId, org))
    .orderBy(desc(T.auditLog.createdAt)).limit(100);
  return c.json(rows);
});

app.post('/api/organizations/switch', async (c) => {
  const { organizationId } = parse(z.object({ organizationId: z.string() }), await c.req.json());
  const mine = await orgsOf(c.get('db'), c.get('userId'));
  if (!mine.some((o: any) => o.id === organizationId)) return c.json({ error: 'No active membership for this company' }, 403);
  return c.json({ token: await issue(c, c.get('userId'), organizationId), organizationId });
});

// ---------- generic tenant-scoped CRUD ----------
const owns = async (db: any, t: any, id: string, org: string) =>
  (await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.organizationId, org))).limit(1)).length > 0;

function crud(path: string, t: any, zs: z.ZodObject<any>, refs: Record<string, any> = {}, pre?: (db: any, org: string, b: any) => Promise<void>) {
  const check = async (c: any, b: any) => {
    const org = c.get('orgId');
    if (!org) throw new HttpError(403, 'Select a company first');
    for (const [k, rt] of Object.entries(refs)) if (b[k] && !(await owns(c.get('db'), rt, b[k], org))) throw new HttpError(422, `${k} not found in this company`);
    await pre?.(c.get('db'), org, b);
  };
  const scope = (c: any) => eq(t.organizationId, c.get('orgId') as string); // org ALWAYS from token
  app.get(path, async (c) => c.json(await c.get('db').select().from(t).where(scope(c))));
  app.get(`${path}/:id`, async (c) => {
    const [r] = await c.get('db').select().from(t).where(and(eq(t.id, c.req.param('id')), scope(c)));
    return r ? c.json(r) : c.json({ error: 'Not found' }, 404);
  });
  app.post(path, async (c) => {
    const b = parse(zs, await c.req.json()); // zod strips unknown keys, incl. any client-sent organizationId
    await check(c, b);
    const [r] = await c.get('db').insert(t).values({ ...b, organizationId: c.get('orgId') }).returning();
    await audit(c.get('db'), { organizationId: c.get('orgId') as string, userId: c.get('userId'), action: 'CREATE', entityType: path, entityId: r.id });
    return c.json(r, 201);
  });
  app.patch(`${path}/:id`, async (c) => {
    const b = parse(zs.partial(), await c.req.json());
    await check(c, b);
    const [r] = await c.get('db').update(t).set(b).where(and(eq(t.id, c.req.param('id')), scope(c))).returning();
    if (r) await audit(c.get('db'), { organizationId: c.get('orgId') as string, userId: c.get('userId'), action: 'UPDATE', entityType: path, entityId: r.id });
    return r ? c.json(r) : c.json({ error: 'Not found' }, 404);
  });
  app.delete(`${path}/:id`, async (c) => { // soft-deactivate when the table supports it
    const w = and(eq(t.id, c.req.param('id')), scope(c));
    const q = 'isActive' in t ? c.get('db').update(t).set({ isActive: false }).where(w) : c.get('db').delete(t).where(w);
    const r = await q.returning();
    if (r.length) await audit(c.get('db'), { organizationId: c.get('orgId') as string, userId: c.get('userId'), action: 'DELETE', entityType: path, entityId: r[0].id });
    return r.length ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404);
  });
}
const s = z.string().min(1), opt = z.string().nullish();
crud('/api/categories', T.itemCategories, z.object({ name: s, parentId: opt, isActive: z.boolean().optional() }), { parentId: T.itemCategories });
crud('/api/units', T.units, z.object({ name: s, symbol: s, unitType: s, decimalPrecision: z.number().int().min(0).max(6), isActive: z.boolean().optional() }));
crud('/api/vehicles/makes', T.vehicleMakes, z.object({ name: s }));
crud('/api/vehicles/models', T.vehicleModels, z.object({ makeId: s, name: s }), { makeId: T.vehicleMakes });
crud('/api/vehicles/variants', T.vehicleVariants, z.object({ modelId: s, name: s, engine: opt, fuelType: opt }), { modelId: T.vehicleModels });
crud('/api/items', T.items, z.object({ sku: s, name: s, itemType: z.enum(['RAW_MATERIAL', 'FINISHED_GOOD']), categoryId: opt, baseUnitId: s, isActive: z.boolean().optional() }),
  { categoryId: T.itemCategories, baseUnitId: T.units });
crud('/api/product-applications', T.productVehicleApplications, z.object({ itemId: s, vehicleVariantId: s, yearFrom: z.number().int(), yearTo: z.number().int() }),
  { itemId: T.items, vehicleVariantId: T.vehicleVariants }, async (db, org, b) => {
    if (!b.itemId) return;
    const [i] = await db.select().from(T.items).where(and(eq(T.items.id, b.itemId), eq(T.items.organizationId, org)));
    if (i.itemType !== 'FINISHED_GOOD') throw new HttpError(422, 'Vehicle applications are only for FINISHED_GOOD items');
  });

// ---------- BOM ----------
const bomZ = z.object({
  finishedItemId: s, vehicleApplicationId: s, version: z.number().int().default(1), outputQuantity: z.number().positive().default(1),
  lines: z.array(z.object({ itemId: s, quantity: z.number().positive(), scrapPercent: z.number().min(0).default(0) })).min(1),
});
app.post('/api/boms', async (c) => {
  const b = parse(bomZ, await c.req.json()), db = c.get('db'), org = c.get('orgId')!;
  const [fg] = await db.select().from(T.items).where(and(eq(T.items.id, b.finishedItemId), eq(T.items.organizationId, org)));
  if (!fg || fg.itemType !== 'FINISHED_GOOD') throw new HttpError(422, 'finishedItemId must be a FINISHED_GOOD in this company');
  const [ap] = await db.select().from(T.productVehicleApplications).where(and(eq(T.productVehicleApplications.id, b.vehicleApplicationId), eq(T.productVehicleApplications.organizationId, org)));
  if (!ap || ap.itemId !== fg.id) throw new HttpError(422, 'vehicleApplicationId does not belong to this product');
  const lineItems = await Promise.all(b.lines.map(async (l) => {
    const [i] = await db.select().from(T.items).where(and(eq(T.items.id, l.itemId), eq(T.items.organizationId, org)));
    if (!i) throw new HttpError(422, `Line item ${l.itemId} not found in this company`);
    return i;
  }));
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(T.boms).values({ id, organizationId: org, finishedItemId: fg.id, vehicleApplicationId: ap.id, version: b.version, outputQuantity: b.outputQuantity, outputUnitId: fg.baseUnitId, status: 'ACTIVE' }),
    db.insert(T.bomLines).values(b.lines.map((l, k) => ({ organizationId: org, bomId: id, itemId: l.itemId, quantity: l.quantity, unitId: lineItems[k].baseUnitId, scrapPercent: l.scrapPercent }))),
  ]);
  await audit(db, { organizationId: org, userId: c.get('userId'), action: 'CREATE', entityType: 'boms', entityId: id });
  return c.json({ id }, 201);
});
const bomWithLines = async (db: any, org: string, where: any) => {
  const bs = await db.select().from(T.boms).where(where);
  const ls = await db.select().from(T.bomLines).where(eq(T.bomLines.organizationId, org));
  return bs.map((x: any) => ({ ...x, lines: ls.filter((l: any) => l.bomId === x.id) }));
};
app.get('/api/boms', async (c) => c.json(await bomWithLines(c.get('db'), c.get('orgId')!, eq(T.boms.organizationId, c.get('orgId')!))));
app.get('/api/boms/:id', async (c) => {
  const org = c.get('orgId')!;
  const [bom] = await bomWithLines(c.get('db'), org, and(eq(T.boms.id, c.req.param('id')), eq(T.boms.organizationId, org)));
  if (!bom) return c.json({ error: 'Not found' }, 404);
  const qty = Number(c.req.query('qty') ?? bom.outputQuantity);
  return c.json({ ...bom, productionQuantity: qty, requirements: requirements(bom.lines, bom.outputQuantity, qty) });
});

// ---------- stock / production / dashboard ----------
const stockRows = async (db: any, org: string) => {
  const [its, us, sm] = await Promise.all([db.select().from(T.items).where(eq(T.items.organizationId, org)),
    db.select().from(T.units).where(eq(T.units.organizationId, org)), stockMap(db, org)]);
  return its.map((i: any) => ({ itemId: i.id, sku: i.sku, name: i.name, itemType: i.itemType, unit: us.find((u: any) => u.id === i.baseUnitId)?.symbol,
    stockIn: sm[i.id]?.in ?? 0, stockOut: sm[i.id]?.out ?? 0, current: sm[i.id]?.current ?? 0 }));
};
app.get('/api/stock', async (c) => c.json(await stockRows(c.get('db'), c.get('orgId')!)));
app.post('/api/production', async (c) => {
  const b = parse(z.object({ finishedItemId: s, vehicleApplicationId: s, quantity: z.number().positive() }), await c.req.json());
  const result = await produce(c.get('db'), c.get('orgId')!, b);
  await audit(c.get('db'), { organizationId: c.get('orgId')!, userId: c.get('userId'), action: 'CREATE', entityType: 'production', entityId: result.productionRef, metadata: { finishedItemId: b.finishedItemId, quantity: b.quantity } });
  return c.json(result, 201);
});
const LOW_STOCK = 20; // PoC threshold
app.get('/api/dashboard', async (c) => {
  const org = c.get('orgId')!, rows = await stockRows(c.get('db'), org);
  const entries = await c.get('db').select({ id: T.stockLedger.id }).from(T.stockLedger).where(eq(T.stockLedger.organizationId, org));
  const [o] = await c.get('db').select().from(T.organizations).where(eq(T.organizations.id, org));
  return c.json({ company: o.name, totalItems: rows.length, rawMaterials: rows.filter((r: any) => r.itemType === 'RAW_MATERIAL').length,
    finishedGoods: rows.filter((r: any) => r.itemType === 'FINISHED_GOOD').length, lowStock: rows.filter((r: any) => r.current < LOW_STOCK).length,
    ledgerEntries: entries.length, });
});

export default app;
