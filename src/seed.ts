import { drizzle } from 'drizzle-orm/d1';
import * as T from './db/schema';
import { hashPw } from './lib/crypto';

const id = () => crypto.randomUUID();
export async function seed(d1: D1Database) {
  const db = drizzle(d1);
  for (const t of [T.stockLedger, T.bomLines, T.boms, T.productVehicleApplications, T.items, T.vehicleVariants, T.vehicleModels,
    T.vehicleMakes, T.units, T.itemCategories, T.rolePermissions, T.roles, T.memberships, T.organizations, T.users]) await db.delete(t);

  const pw = await hashPw('Demo@123');
  const [owner, staff, car, amin] = [id(), id(), id(), id()];
  await db.insert(T.users).values([{ id: owner, name: 'Owner', email: 'owner@demo.com', passwordHash: pw },
    { id: staff, name: 'Staff', email: 'staff@demo.com', passwordHash: pw }]);
  await db.insert(T.organizations).values([{ id: car, name: 'Carstuff', code: 'CARSTUFF' }, { id: amin, name: 'Amin Enterprise', code: 'AMIN' }]);
  const [carStaffRole, aminStaffRole] = [id(), id()];
  await db.insert(T.roles).values([
    { id: carStaffRole, organizationId: car, name: 'Staff', description: 'Default operational staff role', isSystem: true },
    { id: aminStaffRole, organizationId: amin, name: 'Staff', description: 'Default operational staff role', isSystem: true },
  ]);
  const staffPerms = await db.select({ id: T.permissions.id, key: T.permissions.key }).from(T.permissions);
  const allowed = staffPerms.filter((p:any) => ['dashboard.read','categories.read','units.read','vehicles.read','items.read','applications.read','boms.read','stock.read','production.read','production.create'].includes(p.key));
  await db.insert(T.rolePermissions).values([
    ...allowed.map((p:any) => ({ roleId: carStaffRole, permissionId: p.id })),
    ...allowed.map((p:any) => ({ roleId: aminStaffRole, permissionId: p.id })),
  ]);
  await db.insert(T.memberships).values([
    { userId: owner, organizationId: car, role: 'OWNER', roleId: null, status: 'ACTIVE' },
    { userId: owner, organizationId: amin, role: 'OWNER', roleId: null, status: 'ACTIVE' },
    { userId: staff, organizationId: car, role: 'Staff', roleId: carStaffRole, status: 'ACTIVE' }
  ]);

  // ---- Carstuff ----
  const [cMat, cRaw, cAcc] = [id(), id(), id()];
  await db.insert(T.itemCategories).values([{ id: cMat, organizationId: car, name: 'Car Matting' }, { id: cRaw, organizationId: car, name: 'Raw Material' }, { id: cAcc, organizationId: car, name: 'Accessories' }]);
  const [pcs, sqft, mtr, kg] = [id(), id(), id(), id()];
  const u = (i: string, name: string, symbol: string, unitType: string, decimalPrecision: number) => ({ id: i, organizationId: car, name, symbol, unitType, decimalPrecision });
  await db.insert(T.units).values([u(pcs, 'Piece', 'PCS', 'COUNT', 0), u(sqft, 'Square Feet', 'SQFT', 'AREA', 2), u(mtr, 'Meter', 'M', 'LENGTH', 2), u(kg, 'Kilogram', 'KG', 'WEIGHT', 3)]);
  const [make, model, variant] = [id(), id(), id()];
  await db.insert(T.vehicleMakes).values({ id: make, organizationId: car, name: 'Hyundai' });
  await db.insert(T.vehicleModels).values({ id: model, organizationId: car, makeId: make, name: 'Creta' });
  await db.insert(T.vehicleVariants).values({ id: variant, organizationId: car, modelId: model, name: '1.2', engine: '1.2L', fuelType: 'Petrol' });
  const [pvc, carpet, thread, adh, fg] = [id(), id(), id(), id(), id()];
  const it = (i: string, sku: string, name: string, itemType: 'RAW_MATERIAL' | 'FINISHED_GOOD', categoryId: string, baseUnitId: string) => ({ id: i, organizationId: car, sku, name, itemType, categoryId, baseUnitId });
  await db.insert(T.items).values([it(pvc, 'RM-PVC-001', 'PVC Sheet', 'RAW_MATERIAL', cRaw, sqft), it(carpet, 'RM-CARPET-001', 'Carpet', 'RAW_MATERIAL', cRaw, sqft),
    it(thread, 'RM-THREAD-001', 'Thread', 'RAW_MATERIAL', cRaw, mtr), it(adh, 'RM-ADH-001', 'Adhesive', 'RAW_MATERIAL', cRaw, kg),
    it(fg, 'FG-MAT-001', 'Premium 7D Car Mat', 'FINISHED_GOOD', cMat, pcs)]);
  const [app, bom] = [id(), id()];
  await db.insert(T.productVehicleApplications).values({ id: app, organizationId: car, itemId: fg, vehicleVariantId: variant, yearFrom: 2022, yearTo: 2022 });
  await db.insert(T.boms).values({ id: bom, organizationId: car, finishedItemId: fg, vehicleApplicationId: app, version: 1, outputQuantity: 1, outputUnitId: pcs, status: 'ACTIVE' });
  const bl = (itemId: string, quantity: number, unitId: string) => ({ organizationId: car, bomId: bom, itemId, quantity, unitId, scrapPercent: 0 });
  await db.insert(T.bomLines).values([bl(pvc, 12.5, sqft), bl(carpet, 8, sqft), bl(thread, 15, mtr), bl(adh, 0.25, kg)]);
  const st = (itemId: string, qtyIn: number, unitId: string) => ({ organizationId: car, itemId, qtyIn, qtyOut: 0, unitId, refType: 'OPENING', refId: 'seed' });
  await db.insert(T.stockLedger).values([st(pvc, 100, sqft), st(carpet, 100, sqft), st(thread, 500, mtr), st(adh, 10, kg)]);

  // ---- Amin Enterprise (deliberately different data) ----
  const [aCat, aPcs, aBox] = [id(), id(), id()];
  await db.insert(T.itemCategories).values({ id: aCat, organizationId: amin, name: 'Packaging' });
  await db.insert(T.units).values({ id: aPcs, organizationId: amin, name: 'Piece', symbol: 'PCS', unitType: 'COUNT', decimalPrecision: 0 });
  await db.insert(T.items).values({ id: aBox, organizationId: amin, sku: 'AE-BOX-001', name: 'Corrugated Box', itemType: 'RAW_MATERIAL', categoryId: aCat, baseUnitId: aPcs });
  await db.insert(T.stockLedger).values({ organizationId: amin, itemId: aBox, qtyIn: 50, qtyOut: 0, unitId: aPcs, refType: 'OPENING', refId: 'seed' });
}
