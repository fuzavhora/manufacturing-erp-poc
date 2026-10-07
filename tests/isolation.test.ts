// Integration tests against a RUNNING local worker: `npm run dev` (needs .dev.vars with ENABLE_SEED=true), then `npm test`.
import { beforeAll, describe, expect, it } from 'vitest';
const BASE = process.env.API_URL ?? 'http://localhost:8787';
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function call(path: string, token?: string, method = 'GET', body?: any) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
async function login(email: string) { const r = await call('/api/auth/login', undefined, 'POST', { email, password: 'Demo@123' }); return { ...r, token: r.json?.token as string, orgs: r.json?.organizations as any[] }; }
async function into(email: string, orgName: string) {
  const l = await login(email); const o = l.orgs.find((x) => x.name === orgName);
  const s = await call('/api/organizations/switch', l.token, 'POST', { organizationId: o?.id ?? 'not-mine' });
  return { ...s, token: s.json?.token as string, orgId: o?.id as string };
}
const stock = async (t: string) => Object.fromEntries((await call('/api/stock', t)).json.map((r: any) => [r.sku, r.current]));
const newItem = (t: string, sku: string, unitId: string, name = 'Test') => call('/api/items', t, 'POST', { sku, name, itemType: 'RAW_MATERIAL', baseUnitId: unitId });

let car: string, amin: string, carUnit: string, aminUnit: string;
beforeAll(async () => {
  expect((await call('/api/dev/seed', undefined, 'POST')).status).toBe(200);
  car = (await into('owner@demo.com', 'Carstuff')).token; amin = (await into('owner@demo.com', 'Amin Enterprise')).token;
  carUnit = (await call('/api/units', car)).json[0].id; aminUnit = (await call('/api/units', amin)).json[0].id;
});

describe('auth + tenancy', () => {
  it('1 user can login', async () => { const l = await login('owner@demo.com'); expect(l.status).toBe(200); expect(l.token).toBeTruthy(); });
  it('2 owner can access Carstuff', async () => { expect((await call('/api/items', car)).status).toBe(200); });
  it('3 owner can switch to Amin Enterprise', async () => { expect((await call('/api/items', amin)).json.map((i: any) => i.sku)).toContain('AE-BOX-001'); });
  it('4 Carstuff data invisible to Amin (even with forged org id)', async () => {
    const sku = 'ISO-' + rnd(); const r = await call('/api/items', car, 'POST', { sku, name: 'A', itemType: 'RAW_MATERIAL', baseUnitId: carUnit, organizationId: 'forged' });
    expect(r.status).toBe(201);
    const aminItems = (await call('/api/items?organizationId=' + r.json.organizationId, amin, 'GET')).json;
    expect(aminItems.find((i: any) => i.sku === sku)).toBeUndefined();
    expect((await call('/api/items/' + r.json.id, amin)).status).toBe(404);
  });
  it('5 staff can access Carstuff', async () => { const s = await into('staff@demo.com', 'Carstuff'); expect((await call('/api/items', s.token)).status).toBe(200); });
  it('6 staff cannot access Amin Enterprise', async () => {
    const l = await login('staff@demo.com'); const aminId = (await call('/api/organizations', car)).json.find((o: any) => o.name === 'Amin Enterprise').id;
    expect((await call('/api/organizations/switch', l.token, 'POST', { organizationId: aminId })).status).toBe(403);
  });
});

describe('items', () => {
  it('7 duplicate SKU rejected in same org', async () => { const sku = 'DUP-' + rnd(); expect((await newItem(car, sku, carUnit)).status).toBe(201); expect((await newItem(car, sku, carUnit)).status).toBe(409); });
  it('8 same SKU allowed in different orgs', async () => { const sku = 'SAME-' + rnd(); expect((await newItem(car, sku, carUnit)).status).toBe(201); expect((await newItem(amin, sku, aminUnit)).status).toBe(201); });
});

describe('BOM + production', () => {
  let fg: any, app: any, bom: any;
  beforeAll(async () => {
    fg = (await call('/api/items', car)).json.find((i: any) => i.sku === 'FG-MAT-001');
    app = (await call('/api/product-applications', car)).json.find((a: any) => a.itemId === fg.id);
    bom = (await call('/api/boms', car)).json[0];
  });
  it('9 BOM calculates requirements (qty 10 → PVC 125, carpet 80, thread 150, adhesive 2.5)', async () => {
    const r = (await call(`/api/boms/${bom.id}?qty=10`, car)).json.requirements.map((x: any) => x.required).sort((a: number, b: number) => a - b);
    expect(r).toEqual([2.5, 80, 125, 150]);
  });
  it('10+11 production deducts raw stock and adds finished stock', async () => {
    const before = await stock(car);
    const r = await call('/api/production', car, 'POST', { finishedItemId: fg.id, vehicleApplicationId: app.id, quantity: 2 });
    expect(r.status).toBe(201);
    const after = await stock(car);
    expect(after['RM-PVC-001']).toBeCloseTo(before['RM-PVC-001'] - 25); expect(after['RM-ADH-001']).toBeCloseTo(before['RM-ADH-001'] - 0.5);
    expect(after['FG-MAT-001']).toBe((before['FG-MAT-001'] ?? 0) + 2);
  });
  it('12 production rolls back / writes nothing when material is insufficient', async () => {
    const before = await stock(car);
    const r = await call('/api/production', car, 'POST', { finishedItemId: fg.id, vehicleApplicationId: app.id, quantity: 1000 });
    expect(r.status).toBe(409); expect(r.json.shortages.length).toBeGreaterThan(0);
    expect(await stock(car)).toEqual(before);
  });
});


describe('phase 1 RBAC + audit', () => {
  it('13 staff is denied owner-only item mutations', async () => {
    const staff = await into('staff@demo.com', 'Carstuff');
    const r = await newItem(staff.token, 'RBAC-' + rnd(), carUnit);
    expect(r.status).toBe(403);
  });

  it('14 owner can mutate item and audit log records the action', async () => {
    const sku = 'AUD-' + rnd();
    const r = await newItem(car, sku, carUnit);
    expect(r.status).toBe(201);
    const logs = await call('/api/audit', car);
    expect(logs.status).toBe(200);
    expect(logs.json.some((x: any) => x.action === 'CREATE' && x.entityType === '/api/items' && x.entityId === r.json.id)).toBe(true);
  });

  it('15 staff can read tenant data but cannot read audit log', async () => {
    const staff = await into('staff@demo.com', 'Carstuff');
    expect((await call('/api/items', staff.token)).status).toBe(200);
    expect((await call('/api/audit', staff.token)).status).toBe(403);
  });
});
