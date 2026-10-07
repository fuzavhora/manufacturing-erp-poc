import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import * as T from '../db/schema';
import { requirements } from './bom';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: any = {}) { super(message); }
}

export async function stockMap(db: any, org: string, itemIds?: string[]) {
  const q = db.select({ itemId: T.stockLedger.itemId, qin: sql<number>`coalesce(sum(${T.stockLedger.qtyIn}),0)`,
    qout: sql<number>`coalesce(sum(${T.stockLedger.qtyOut}),0)` }).from(T.stockLedger)
    .where(itemIds ? and(eq(T.stockLedger.organizationId, org), inArray(T.stockLedger.itemId, itemIds)) : eq(T.stockLedger.organizationId, org))
    .groupBy(T.stockLedger.itemId);
  const m: Record<string, { in: number; out: number; current: number }> = {};
  for (const r of await q) m[r.itemId] = { in: r.qin, out: r.qout, current: r.qin - r.qout };
  return m;
}

export async function produce(db: any, org: string, p: { finishedItemId: string; vehicleApplicationId: string; quantity: number }) {
  const [bom] = await db.select().from(T.boms).where(and(eq(T.boms.organizationId, org), eq(T.boms.finishedItemId, p.finishedItemId),
    eq(T.boms.vehicleApplicationId, p.vehicleApplicationId), eq(T.boms.status, 'ACTIVE'))).orderBy(desc(T.boms.effectiveFrom)).limit(1);
  if (!bom) throw new HttpError(404, 'No active BOM for this product + vehicle application');
  const lines = await db.select().from(T.bomLines).where(and(eq(T.bomLines.organizationId, org), eq(T.bomLines.bomId, bom.id)));
  const req = requirements(lines, bom.outputQuantity, p.quantity);
  const ids = req.map((r) => r.itemId);
  const [stock, itemRows] = await Promise.all([stockMap(db, org, ids),
    db.select().from(T.items).where(and(eq(T.items.organizationId, org), inArray(T.items.id, [...ids, p.finishedItemId])))]);
  const name = (id: string) => itemRows.find((i: any) => i.id === id)?.name ?? id;
  const shortages = req.filter((r) => (stock[r.itemId]?.current ?? 0) < r.required - 1e-9)
    .map((r) => ({ itemId: r.itemId, name: name(r.itemId), required: r.required, available: stock[r.itemId]?.current ?? 0 }));
  if (shortages.length) throw new HttpError(409, 'Insufficient stock', { shortages });

  const fg = itemRows.find((i: any) => i.id === p.finishedItemId);
  const ref = crypto.randomUUID();
  const base = { organizationId: org, refType: 'PRODUCTION', refId: ref };
  // D1 batch() runs all statements in ONE implicit transaction: all succeed or all roll back.
  await db.batch([
    ...req.map((r) => db.insert(T.stockLedger).values({ ...base, itemId: r.itemId, qtyIn: 0, qtyOut: r.required, unitId: r.unitId })),
    db.insert(T.stockLedger).values({ ...base, itemId: p.finishedItemId, qtyIn: p.quantity, qtyOut: 0, unitId: fg.baseUnitId }),
  ]);
  return { productionRef: ref, bomId: bom.id, consumed: req.map((r) => ({ ...r, name: name(r.itemId) })), produced: { itemId: p.finishedItemId, name: fg.name, quantity: p.quantity } };
}
