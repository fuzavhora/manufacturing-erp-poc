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
import { ownerOnly, ownerOrStaff, permission } from './lib/permissions';
import { auditStatement } from './services/audit';

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
const TENANT = ['categories', 'units', 'vehicles', 'items', 'product-applications', 'boms', 'stock', 'production', 'dashboard', 'audit', 'roles', 'members'];
for (const p of TENANT) app.use(`/api/${p}/*`, tenant);

// Every business module is protected by an action-level permission.
// OWNER is handled as an unrestricted system role by requirePermission().
const PERMISSION_PATHS: Array<[string, string]> = [
  ['/api/categories','categories'], ['/api/units','units'],
  ['/api/vehicles/makes','vehicles'], ['/api/vehicles/models','vehicles'], ['/api/vehicles/variants','vehicles'],
  ['/api/items','items'], ['/api/product-applications','applications'], ['/api/boms','boms'],
  ['/api/stock','stock'], ['/api/production','production'], ['/api/dashboard','dashboard'], ['/api/audit','audit'],
];
const permissionFor = (module: string, method: string) => {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return module + '.read';
  if (method === 'POST') return module + '.create';
  if (method === 'PATCH' || method === 'PUT') return module + '.edit';
  return module + '.delete';
};
for (const [path, module] of PERMISSION_PATHS) {
  const guard = async (c: any, next: () => Promise<void>) => permission(permissionFor(module, c.req.method))(c, next);
  app.use(path, guard); app.use(`${path}/*`, guard);
}


app.get('/api/auth/me', async (c) => {
  const db = c.get('db'), orgId = c.get('orgId');
  const [user] = await db.select({ id: T.users.id, name: T.users.name, email: T.users.email }).from(T.users).where(eq(T.users.id, c.get('userId')));
  let permissions:string[] = [];
  if (orgId) {
    const [m] = await db.select({role:T.memberships.role,roleId:T.memberships.roleId}).from(T.memberships)
      .where(and(eq(T.memberships.userId,c.get('userId')),eq(T.memberships.organizationId,orgId),eq(T.memberships.status,'ACTIVE'))).limit(1);
    if (m?.role === 'OWNER') permissions = (await db.select({key:T.permissions.key}).from(T.permissions)).map((p:any)=>p.key);
    else if (m?.roleId) permissions = (await db.select({key:T.permissions.key}).from(T.rolePermissions).innerJoin(T.permissions,eq(T.rolePermissions.permissionId,T.permissions.id)).where(eq(T.rolePermissions.roleId,m.roleId))).map((p:any)=>p.key);
  }
  return c.json({ user, orgId, organizations: await orgsOf(db, c.get('userId')), permissions });
});
app.get('/api/organizations', async (c) => c.json(await orgsOf(c.get('db'), c.get('userId'))));
app.get('/api/permissions', async (c) => {
  const rows = await c.get('db').select().from(T.permissions);
  return c.json(rows);
});
app.get('/api/roles', async (c) => {
  const org = c.get('orgId') as string;
  return c.json(await c.get('db').select().from(T.roles).where(eq(T.roles.organizationId, org)));
});
app.get('/api/roles/:id', async (c) => {
  const org = c.get('orgId') as string;
  const [role] = await c.get('db').select().from(T.roles).where(and(eq(T.roles.id,c.req.param('id')),eq(T.roles.organizationId,org))).limit(1);
  if (!role) return c.json({error:'Not found'},404);
  const permissions = await c.get('db').select({ key:T.permissions.key }).from(T.rolePermissions)
    .innerJoin(T.permissions,eq(T.rolePermissions.permissionId,T.permissions.id)).where(eq(T.rolePermissions.roleId,role.id));
  return c.json({...role, permissions: permissions.map((p:any)=>p.key)});
});
app.post('/api/roles', async (c) => {
  const b = parse(z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(200).optional(),permissionKeys:z.array(z.string()).default([])}), await c.req.json());
  const org=c.get('orgId') as string, db=c.get('db'), id=crypto.randomUUID();
  const perms=await db.select({id:T.permissions.id,key:T.permissions.key}).from(T.permissions);
  const selected=perms.filter((p:any)=>b.permissionKeys.includes(p.key));
  await db.batch([
    db.insert(T.roles).values({id,organizationId:org,name:b.name,description:b.description ?? null,isSystem:false}),
    ...selected.map((p:any)=>db.insert(T.rolePermissions).values({roleId:id,permissionId:p.id})),
    auditStatement(db,{organizationId:org,userId:c.get('userId'),action:'CREATE',entityType:'/api/roles',entityId:id}),
  ]);
  return c.json(await db.select().from(T.roles).where(eq(T.roles.id,id)).limit(1).then((r:any)=>r[0]),201);
});
app.patch('/api/roles/:id', async (c) => {
  const b=parse(z.object({name:z.string().trim().min(2).max(80).optional(),description:z.string().trim().max(200).nullable().optional()}),await c.req.json());
  const org=c.get('orgId') as string, db=c.get('db'), id=c.req.param('id');
  const [role]=await db.select().from(T.roles).where(and(eq(T.roles.id,id),eq(T.roles.organizationId,org))).limit(1);
  if(!role || role.isSystem) return c.json({error: role ? 'System role cannot be edited' : 'Not found'},role?409:404);
  await db.update(T.roles).set(b).where(and(eq(T.roles.id,id),eq(T.roles.organizationId,org)));
  return c.json(await db.select().from(T.roles).where(eq(T.roles.id,id)).limit(1).then((r:any)=>r[0]));
});
app.put('/api/roles/:id/permissions', async (c) => {
  const b=parse(z.object({permissionKeys:z.array(z.string())}),await c.req.json());
  const org=c.get('orgId') as string, db=c.get('db'), id=c.req.param('id');
  const [role]=await db.select().from(T.roles).where(and(eq(T.roles.id,id),eq(T.roles.organizationId,org))).limit(1);
  if(!role || role.isSystem) return c.json({error: role ? 'System role cannot be edited' : 'Not found'},role?409:404);
  const perms=await db.select({id:T.permissions.id,key:T.permissions.key}).from(T.permissions);
  const selected=perms.filter((p:any)=>b.permissionKeys.includes(p.key));
  await db.batch([db.delete(T.rolePermissions).where(eq(T.rolePermissions.roleId,id)),...selected.map((p:any)=>db.insert(T.rolePermissions).values({roleId:id,permissionId:p.id})),auditStatement(db,{organizationId:org,userId:c.get('userId'),action:'UPDATE',entityType:'/api/roles/permissions',entityId:id})]);
  return c.json({ok:true,permissions:selected.map((p:any)=>p.key)});
});
app.delete('/api/roles/:id', async (c) => {
  const org=c.get('orgId') as string, db=c.get('db'), id=c.req.param('id');
  const [role]=await db.select().from(T.roles).where(and(eq(T.roles.id,id),eq(T.roles.organizationId,org))).limit(1);
  if(!role) return c.json({error:'Not found'},404);
  if(role.isSystem) return c.json({error:'System role cannot be deleted'},409);
  const used=await db.select({id:T.memberships.id}).from(T.memberships).where(and(eq(T.memberships.roleId,id),eq(T.memberships.organizationId,org))).limit(1);
  if(used.length) return c.json({error:'Role is assigned to a member'},409);
  await db.batch([db.delete(T.rolePermissions).where(eq(T.rolePermissions.roleId,id)),db.delete(T.roles).where(eq(T.roles.id,id)),auditStatement(db,{organizationId:org,userId:c.get('userId'),action:'DELETE',entityType:'/api/roles',entityId:id})]);
  return c.json({ok:true});
});
app.get('/api/members', async (c) => {
  const org=c.get('orgId') as string, db=c.get('db');
  const rows=await db.select({id:T.memberships.id,userId:T.users.id,name:T.users.name,email:T.users.email,role:T.memberships.role,roleId:T.memberships.roleId,status:T.memberships.status,roleName:T.roles.name})
    .from(T.memberships).innerJoin(T.users,eq(T.memberships.userId,T.users.id)).leftJoin(T.roles,eq(T.memberships.roleId,T.roles.id))
    .where(eq(T.memberships.organizationId,org));
  return c.json(rows);
});
app.patch('/api/members/:id/role', async (c) => {
  const b=parse(z.object({roleId:z.string().nullable()}),await c.req.json());
  const org=c.get('orgId') as string, db=c.get('db'), id=c.req.param('id');
  const [m]=await db.select().from(T.memberships).where(and(eq(T.memberships.id,id),eq(T.memberships.organizationId,org))).limit(1);
  if(!m) return c.json({error:'Member not found'},404);
  if(b.roleId){
    const [r]=await db.select().from(T.roles).where(and(eq(T.roles.id,b.roleId),eq(T.roles.organizationId,org))).limit(1);
    if(!r) return c.json({error:'Role not found in this company'},422);
    if(r.name==='OWNER') return c.json({error:'Owner is a system account role'},422);
    await db.update(T.memberships).set({role:r.name,roleId:r.id}).where(eq(T.memberships.id,id));
  } else {
    const [r]=await db.select().from(T.roles).where(and(eq(T.roles.organizationId,org),eq(T.roles.name,'Staff'))).limit(1);
    if(!r) return c.json({error:'Default Staff role not found'},500);
    await db.update(T.memberships).set({role:r.name,roleId:r.id}).where(eq(T.memberships.id,id));
  }
  return c.json({ok:true});
});

app.use('/api/roles', ownerOnly);
app.use('/api/roles/*', ownerOnly);
app.use('/api/members', ownerOnly);
app.use('/api/members/*', ownerOnly);
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

app.post('/api/organizations', async (c) => {
  const b = parse(z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
  }), await c.req.json());

  const db = c.get('db');
  const userId = c.get('userId');

  // Company creation is an account-owner capability, never a STAFF capability.
  const ownedMemberships = await db.select({ id: T.memberships.id })
    .from(T.memberships)
    .where(and(
      eq(T.memberships.userId, userId),
      eq(T.memberships.role, 'OWNER'),
      eq(T.memberships.status, 'ACTIVE'),
    ));
  if (ownedMemberships.length === 0) return c.json({ error: 'Only a company owner can create another company' }, 403);
  const organizationId = crypto.randomUUID();
  const baseCode = (b.code || b.name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'COMPANY';
  const code = b.code ? b.code.toUpperCase() : baseCode + '-' + crypto.randomUUID().slice(0, 6).toUpperCase();
  const membershipId = crypto.randomUUID();
  const defaultRoleId = crypto.randomUUID();
  const staffPermissionKeys = ['dashboard.read','categories.read','units.read','vehicles.read','items.read','applications.read','boms.read','stock.read','production.read','production.create'];
  const allPerms = await db.select({ id:T.permissions.id, key:T.permissions.key }).from(T.permissions);
  const staffPerms = allPerms.filter((p:any)=>staffPermissionKeys.includes(p.key));

  await db.batch([
    db.insert(T.organizations).values({ id: organizationId, name: b.name, code }),
    db.insert(T.roles).values({ id: defaultRoleId, organizationId, name: 'Staff', description: 'Default operational staff role', isSystem: true }),
    ...staffPerms.map((p:any)=>db.insert(T.rolePermissions).values({ roleId: defaultRoleId, permissionId: p.id })),
    db.insert(T.memberships).values({ id: membershipId, userId, organizationId, role: 'OWNER', roleId: null, status: 'ACTIVE' }),
  ]);

  const organizations = await orgsOf(db, userId);
  return c.json({
    organization: organizations.find((o: any) => o.id === organizationId),
    organizations,
    token: await issue(c, userId, organizationId),
  }, 201);
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
  const scope = (c: any) => eq(t.organizationId, c.get('orgId') as string);
  app.get(path, async (c) => c.json(await c.get('db').select().from(t).where(scope(c))));
  app.get(`${path}/:id`, async (c) => {
    const [r] = await c.get('db').select().from(t).where(and(eq(t.id, c.req.param('id')), scope(c)));
    return r ? c.json(r) : c.json({ error: 'Not found' }, 404);
  });
  app.post(path, async (c) => {
    const b = parse(zs, await c.req.json());
    await check(c, b);
    const org = c.get('orgId') as string;
    const db = c.get('db');
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(t).values({ ...b, id, organizationId: org }),
      auditStatement(db, { organizationId: org, userId: c.get('userId'), action: 'CREATE', entityType: path, entityId: id }),
    ]);
    const [r] = await db.select().from(t).where(and(eq(t.id, id), eq(t.organizationId, org))).limit(1);
    if (!r) throw new HttpError(500, 'Create failed');
    return c.json(r, 201);
  });
  app.patch(`${path}/:id`, async (c) => {
    const b = parse(zs.partial(), await c.req.json());
    await check(c, b);
    const org = c.get('orgId') as string;
    const db = c.get('db');
    const id = c.req.param('id');
    const [before] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.organizationId, org))).limit(1);
    if (!before) return c.json({ error: 'Not found' }, 404);
    await db.batch([
      db.update(t).set(b).where(and(eq(t.id, id), eq(t.organizationId, org))),
      auditStatement(db, { organizationId: org, userId: c.get('userId'), action: 'UPDATE', entityType: path, entityId: id }),
    ]);
    const [r] = await db.select().from(t).where(and(eq(t.id, id), eq(t.organizationId, org))).limit(1);
    return r ? c.json(r) : c.json({ error: 'Not found' }, 404);
  });
  app.delete(`${path}/:id`, async (c) => {
    const org = c.get('orgId') as string;
    const db = c.get('db');
    const id = c.req.param('id');
    const [before] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.organizationId, org))).limit(1);
    if (!before) return c.json({ error: 'Not found' }, 404);
    const w = and(eq(t.id, id), eq(t.organizationId, org));
    const q = 'isActive' in t ? db.update(t).set({ isActive: false }).where(w) : db.delete(t).where(w);
    await db.batch([
      q,
      auditStatement(db, { organizationId: org, userId: c.get('userId'), action: 'DELETE', entityType: path, entityId: id }),
    ]);
    return c.json({ ok: true });
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
    auditStatement(db, { organizationId: org, userId: c.get('userId'), action: 'CREATE', entityType: 'boms', entityId: id }),
  ]);
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
  const result = await produce(c.get('db'), c.get('orgId')!, b, c.get('userId'));
  return c.json(result, 201);
});
const LOW_STOCK = 20; // PoC threshold
app.get('/api/dashboard', async (c) => {
  const org = c.get('orgId')!, db = c.get('db');
  const rows = await stockRows(db, org);
  const entries = await db.select().from(T.stockLedger).where(eq(T.stockLedger.organizationId, org));
  const [o] = await db.select().from(T.organizations).where(eq(T.organizations.id, org));

  const monthKey = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 7);
  };
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short' });
  };
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const movement = months.map((key) => {
    const e = entries.filter((x: any) => monthKey(x.createdAt) === key);
    return { month: monthLabel(key), stockIn: e.reduce((n: number, x: any) => n + Number(x.qtyIn || 0), 0),
      stockOut: e.reduce((n: number, x: any) => n + Number(x.qtyOut || 0), 0),
      production: e.filter((x: any) => x.refType === 'PRODUCTION' && Number(x.qtyIn || 0) > 0).reduce((n: number, x: any) => n + Number(x.qtyIn || 0), 0) };
  });
  const lowStockItems = rows.filter((r: any) => Number(r.current) < LOW_STOCK).sort((a: any, b: any) => Number(a.current) - Number(b.current)).slice(0, 5);
  const topStock = [...rows].filter((r: any) => Number(r.current) > 0).sort((a: any, b: any) => Number(b.current) - Number(a.current)).slice(0, 5);
  const productionRuns = new Set(entries.filter((x: any) => x.refType === 'PRODUCTION').map((x: any) => x.refId)).size;
  const today = new Date().toISOString().slice(0, 10);
  const todayProduction = entries.filter((x: any) => x.refType === 'PRODUCTION' && String(x.createdAt).slice(0, 10) === today && Number(x.qtyIn || 0) > 0)
    .reduce((n: number, x: any) => n + Number(x.qtyIn || 0), 0);

  return c.json({
    company: o.name, totalItems: rows.length, rawMaterials: rows.filter((r: any) => r.itemType === 'RAW_MATERIAL').length,
    finishedGoods: rows.filter((r: any) => r.itemType === 'FINISHED_GOOD').length, lowStock: rows.filter((r: any) => r.current < LOW_STOCK).length,
    ledgerEntries: entries.length, productionRuns, todayProduction, movement, lowStockItems, topStock
  });
});

export default app;
