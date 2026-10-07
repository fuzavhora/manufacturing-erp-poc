// required = line.qty * (produceQty / bomOutputQty) * (1 + scrap%)
export function requirements(lines: any[], outputQty: number, qty: number) {
  const f = qty / outputQty;
  return lines.map((l) => ({
    itemId: l.itemId, unitId: l.unitId,
    required: Math.round(l.quantity * f * (1 + (l.scrapPercent || 0) / 100) * 1e6) / 1e6,
  }));
}
