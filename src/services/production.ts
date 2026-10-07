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

export async function produce(db: any, org: string, p: { finishedItemId: string; vehicleApplicationId: string; quantity: number }, userId: string) {
  const [bom] = await db.select().from(T.boms).where(and(eq(T.boms.organizationId, org), eq(T.boms.finishedItemId, p.finishedItemId),
    eq(T.boms.vehicleApplicationId, p.vehicleApplicationId), eq(T.boms.status, 'ACTIVE'))).orderBy(desc(T.boms.effectiveFrom)).limit(1);
  if (!bom) throw new HttpError(404, 'No active BOM for this product + vehicle application');
  const lines = await db.select().from(T.bomLines).where(and(eq(T.bomLines.organizationId, org), eq(T.bomLines.bomId, bom.id)));
  const req = requirements(lines, bom.outputQuantity, p.quantity);
  const ids = req.map((r) => r.itemId);
  const [stock, itemRows] = await Promise.all([stockMap(db, org, ids),
    db.select().from(T.items).where(and(eq(T.items.organizationId, org), inArray(T.items.id, [...ids, p.finishedItemId])))]);
  const name = (id: string) => itemRows.find((i: any) => i.id === id)?.name ?? id;
  const fg = itemRows.find((i: any) => i.id === p.finishedItemId);
  if (!fg) throw new HttpError(422, 'Finished item not found in this company');

  // Keep the fast pre-check for a useful shortage response, but the actual write
  // performs the stock check and deduction in ONE SQLite statement. This closes
  // the classic check-then-write race between concurrent production requests.
  const shortages = req.filter((r) => (stock[r.itemId]?.current ?? 0) < r.required - 1e-9)
    .map((r) => ({ itemId: r.itemId, name: name(r.itemId), required: r.required, available: stock[r.itemId]?.current ?? 0 }));
  const ref = crypto.randomUUID();

  const reqRows = sql.join(req.map((r) =>
    sql`SELECT ${r.itemId} AS item_id, ${r.required} AS required, ${r.unitId} AS unit_id`), sql` UNION ALL `);

  const ledgerWrite = sql`
    WITH req(item_id, required, unit_id) AS (
      ${reqRows}
    ),
    entries(item_id, qty_in, qty_out, unit_id) AS (
      SELECT item_id, 0, required, unit_id FROM req
      UNION ALL
      SELECT ${p.finishedItemId}, ${p.quantity}, 0, ${fg.baseUnitId}
    )
    INSERT INTO stock_ledger
      (id, organization_id, item_id, qty_in, qty_out, unit_id, ref_type, ref_id, created_at)
    SELECT lower(hex(randomblob(16))), ${org}, item_id, qty_in, qty_out, unit_id,
           'PRODUCTION', ${ref}, datetime('now')
    FROM entries
    WHERE NOT EXISTS (
      SELECT 1
      FROM req r
      LEFT JOIN (
        SELECT item_id, COALESCE(SUM(qty_in - qty_out), 0) AS current_qty
        FROM stock_ledger
        WHERE organization_id = ${org}
        GROUP BY item_id
      ) s ON s.item_id = r.item_id
      WHERE COALESCE(s.current_qty, 0) < r.required - 1e-9
    )
  `;

  const auditWrite = sql`
    INSERT INTO audit_log
      (id, organization_id, user_id, action, entity_type, entity_id, metadata, created_at)
    SELECT lower(hex(randomblob(16))), ${org}, ${userId}, 'CREATE', 'production', ${ref},
           ${JSON.stringify({ finishedItemId: p.finishedItemId, quantity: p.quantity })}, datetime('now')
    WHERE EXISTS (
      SELECT 1 FROM stock_ledger
      WHERE organization_id = ${org} AND ref_type = 'PRODUCTION' AND ref_id = ${ref}
    )
  `;

  await db.run(ledgerWrite);
  const [committed] = await db.select({ id: T.stockLedger.id }).from(T.stockLedger)
    .where(and(eq(T.stockLedger.organizationId, org), eq(T.stockLedger.refType, 'PRODUCTION'), eq(T.stockLedger.refId, ref))).limit(1);
  if (!committed) {
    const latest = await stockMap(db, org, req.map((r) => r.itemId));
    const finalShortages = req.filter((r) => (latest[r.itemId]?.current ?? 0) < r.required - 1e-9)
      .map((r) => ({ itemId: r.itemId, name: name(r.itemId), required: r.required, available: latest[r.itemId]?.current ?? 0 }));
    throw new HttpError(409, 'Insufficient stock', { shortages: finalShortages.length ? finalShortages : shortages });
  }

  // Audit only after the production write is confirmed. The stock write itself is a single atomic SQL statement.
  await db.run(auditWrite);

  return { productionRef: ref, bomId: bom.id, consumed: req.map((r) => ({ ...r, name: name(r.itemId) })), produced: { itemId: p.finishedItemId, name: fg.name, quantity: p.quantity } };
}
