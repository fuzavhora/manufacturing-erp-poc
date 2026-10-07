import { useCallback, useEffect, useState } from 'react';
import { api, session } from './api';

type R = Record<string, any>;
const opts = (rows: R[], f: (r: R) => string = (r) => r.name): [string, string][] => rows.map((r) => [r.id, f(r)]);

export default function App() {
  const [me, setMe] = useState<R | null>(null), [ready, setReady] = useState(false), [picking, setPicking] = useState(false);
  const load = useCallback(async () => {
    if (session.get()) { try { setMe(await api('/auth/me')); } catch { setMe(null); } } else setMe(null);
    setReady(true);
  }, []);
  useEffect(() => { load(); const h = () => setMe(null); window.addEventListener('unauth', h); return () => window.removeEventListener('unauth', h); }, [load]);
  if (!ready) return <p>Loading…</p>;
  if (!me) return <Login onDone={() => { setPicking(false); load(); }} />;
  if (!me.orgId || picking) return <Picker orgs={me.organizations} onDone={() => { setPicking(false); load(); }} />;
  const org = me.organizations.find((o: R) => o.id === me.orgId);
  return (<>
    <header><b>🏭 ERP PoC</b><span>Company: <b>{org?.name}</b> ({org?.role})</span><span className="sp" />
      <small>{me.user.email}</small><button onClick={() => setPicking(true)}>Switch Company</button>
      <button onClick={() => { session.clear(); setMe(null); }}>Logout</button></header>
    <Main key={me.orgId} />
  </>);
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('owner@demo.com'), [password, setPassword] = useState('Demo@123'), [err, setErr] = useState('');
  const go = async () => { try { const r = await api('/auth/login', { method: 'POST', body: { email, password } }); session.set(r.token); onDone(); } catch (e: any) { setErr(e.message); } };
  return <main><div className="card"><h2>Login</h2>
    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
    <button onClick={go}>Login</button><div className="err">{err}</div>
    <small>Demo: owner@demo.com / staff@demo.com — Demo@123</small></div></main>;
}

function Picker({ orgs, onDone }: { orgs: R[]; onDone: () => void }) {
  const [err, setErr] = useState('');
  const pick = async (id: string) => { try { const r = await api('/organizations/switch', { method: 'POST', body: { organizationId: id } }); session.set(r.token); onDone(); } catch (e: any) { setErr(e.message); } };
  return <main><div className="card"><h2>Select company</h2>
    {orgs.map((o) => <div key={o.id}><button onClick={() => pick(o.id)}>{o.name} — {o.role}</button></div>)}
    <div className="err">{err}</div></div></main>;
}

const TABS = ['Dashboard', 'Categories', 'Units', 'Vehicles', 'Items', 'Applications', 'BOM', 'Stock', 'Production'];
function Main() {
  const [tab, setTab] = useState('Dashboard'), [D, setD] = useState<R>({}), [err, setErr] = useState('');
  const reload = useCallback(async () => {
    try {
      const [cats, units, makes, models, variants, items, apps, boms] = await Promise.all(
        ['/categories', '/units', '/vehicles/makes', '/vehicles/models', '/vehicles/variants', '/items', '/product-applications', '/boms'].map((p) => api(p)));
      setD({ cats, units, makes, models, variants, items, apps, boms });
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  if (!D.items) return <main className="err">{err || 'Loading…'}</main>;
  const nm = (rows: R[], id: string) => rows.find((r) => r.id === id)?.name ?? '—';
  const variantLabel = (v: R) => { const m = D.models.find((x: R) => x.id === v?.modelId); return `${nm(D.makes, m?.makeId)} ${m?.name} ${v?.name}`; };
  const appLabel = (a: R) => `${nm(D.items, a.itemId)} → ${variantLabel(D.variants.find((v: R) => v.id === a.vehicleVariantId))} (${a.yearFrom}-${a.yearTo})`;
  const unitSym = (id: string) => D.units.find((u: R) => u.id === id)?.symbol;
  return (<>
    <nav>{TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
    <main>
      {tab === 'Dashboard' && <Dashboard />}
      {tab === 'Categories' && <Crud title="Category" path="/categories" rows={D.cats} reload={reload}
        fields={[{ k: 'name', l: 'Name' }, { k: 'parentId', l: 'Parent', sel: opts(D.cats) }]} cols={[['Name', (r) => r.name], ['Parent', (r) => r.parentId ? nm(D.cats, r.parentId) : '']]} />}
      {tab === 'Units' && <Crud title="Unit" path="/units" rows={D.units} reload={reload}
        fields={[{ k: 'name', l: 'Name' }, { k: 'symbol', l: 'Symbol' }, { k: 'unitType', l: 'Type (AREA…)' }, { k: 'decimalPrecision', l: 'Decimals', num: true }]}
        cols={[['Name', (r) => r.name], ['Symbol', (r) => r.symbol], ['Type', (r) => r.unitType], ['Decimals', (r) => r.decimalPrecision]]} />}
      {tab === 'Vehicles' && <>
        <Crud title="Make" path="/vehicles/makes" rows={D.makes} reload={reload} fields={[{ k: 'name', l: 'Make' }]} cols={[['Make', (r) => r.name]]} />
        <Crud title="Model" path="/vehicles/models" rows={D.models} reload={reload} fields={[{ k: 'makeId', l: 'Make', sel: opts(D.makes) }, { k: 'name', l: 'Model' }]}
          cols={[['Make', (r) => nm(D.makes, r.makeId)], ['Model', (r) => r.name]]} />
        <Crud title="Variant" path="/vehicles/variants" rows={D.variants} reload={reload}
          fields={[{ k: 'modelId', l: 'Model', sel: opts(D.models) }, { k: 'name', l: 'Variant' }, { k: 'engine', l: 'Engine' }, { k: 'fuelType', l: 'Fuel' }]}
          cols={[['Model', (r) => nm(D.models, r.modelId)], ['Variant', (r) => r.name], ['Engine', (r) => r.engine], ['Fuel', (r) => r.fuelType]]} /></>}
      {tab === 'Items' && <Crud title="Item" path="/items" rows={D.items} reload={reload}
        fields={[{ k: 'sku', l: 'SKU' }, { k: 'name', l: 'Name' }, { k: 'itemType', l: 'Type', sel: [['RAW_MATERIAL', 'RAW_MATERIAL'], ['FINISHED_GOOD', 'FINISHED_GOOD']] },
          { k: 'categoryId', l: 'Category', sel: opts(D.cats) }, { k: 'baseUnitId', l: 'Unit', sel: opts(D.units, (u) => u.symbol) }]}
        cols={[['SKU', (r) => r.sku], ['Name', (r) => r.name], ['Type', (r) => r.itemType], ['Category', (r) => r.categoryId ? nm(D.cats, r.categoryId) : ''], ['Unit', (r) => unitSym(r.baseUnitId)]]} />}
      {tab === 'Applications' && <Crud title="Vehicle application" path="/product-applications" rows={D.apps} reload={reload}
        fields={[{ k: 'itemId', l: 'Finished product', sel: opts(D.items.filter((i: R) => i.itemType === 'FINISHED_GOOD')) },
          { k: 'vehicleVariantId', l: 'Vehicle', sel: opts(D.variants, variantLabel) }, { k: 'yearFrom', l: 'Year from', num: true }, { k: 'yearTo', l: 'Year to', num: true }]}
        cols={[['Application', appLabel]]} />}
      {tab === 'BOM' && <Bom D={D} appLabel={appLabel} unitSym={unitSym} reload={reload} />}
      {tab === 'Stock' && <Stock />}
      {tab === 'Production' && <Production D={D} appLabel={appLabel} />}
    </main></>);
}

function Dashboard() {
  const [d, setD] = useState<R | null>(null);
  useEffect(() => { api('/dashboard').then(setD); }, []);
  if (!d) return <p>Loading…</p>;
  const c = (l: string, v: any) => <div className="card" key={l}><small>{l}</small><h2>{v}</h2></div>;
  return <><h2>{d.company}</h2><div className="cards">{c('Total items', d.totalItems)}{c('Raw materials', d.rawMaterials)}{c('Finished goods', d.finishedGoods)}{c('Low stock (<20)', d.lowStock)}{c('Ledger entries', d.ledgerEntries)}</div>
    <details open><summary>Developer / debug</summary><pre>{JSON.stringify(d.debug, null, 2)}</pre></details></>;
}

function Crud({ title, path, rows, fields, cols, reload }: R) {
  const [f, setF] = useState<R>({}), [err, setErr] = useState('');
  const add = async () => {
    const body: R = {};
    for (const x of fields) { const v = f[x.k]; if (v !== undefined && v !== '') body[x.k] = x.num ? +v : v; }
    try { setErr(''); await api(path, { method: 'POST', body }); setF({}); reload(); } catch (e: any) { setErr(e.message); }
  };
  const act = async (r: R, del: boolean) => { try { await api(`${path}/${r.id}`, del ? { method: 'DELETE' } : { method: 'PATCH', body: { isActive: true } }); reload(); } catch (e: any) { setErr(e.message); } };
  return <div className="card"><h3>{title}s</h3>
    {fields.map((x: R) => x.sel
      ? <select key={x.k} value={f[x.k] ?? ''} onChange={(e) => setF({ ...f, [x.k]: e.target.value })}><option value="">{x.l}…</option>{x.sel.map(([v, l]: string[]) => <option key={v} value={v}>{l}</option>)}</select>
      : <input key={x.k} placeholder={x.l} type={x.num ? 'number' : 'text'} value={f[x.k] ?? ''} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />)}
    <button onClick={add}>Create</button><div className="err">{err}</div>
    <table><thead><tr>{cols.map(([h]: any) => <th key={h}>{h}</th>)}<th /></tr></thead><tbody>
      {rows.map((r: R) => <tr key={r.id} className={r.isActive === false ? 'off' : ''}>{cols.map(([h, fn]: any) => <td key={h}>{fn(r)}</td>)}
        <td>{r.isActive === false ? <button onClick={() => act(r, false)}>Reactivate</button> : <button onClick={() => act(r, true)}>{'isActive' in r ? 'Deactivate' : 'Delete'}</button>}</td></tr>)}
    </tbody></table></div>;
}

function Bom({ D, appLabel, unitSym, reload }: R) {
  const [item, setItem] = useState(''), [app, setApp] = useState(''), [outQty, setOutQty] = useState('1'), [err, setErr] = useState('');
  const [lines, setLines] = useState<R[]>([{ itemId: '', quantity: '', scrapPercent: '0' }]), [qty, setQty] = useState('10'), [calc, setCalc] = useState<R>({});
  const raws = D.items.filter((i: R) => i.itemType === 'RAW_MATERIAL');
  const setLine = (k: number, p: R) => setLines(lines.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const save = async () => {
    try { setErr(''); await api('/boms', { method: 'POST', body: { finishedItemId: item, vehicleApplicationId: app, outputQuantity: +outQty, lines: lines.map((l) => ({ itemId: l.itemId, quantity: +l.quantity, scrapPercent: +l.scrapPercent })) } }); reload(); }
    catch (e: any) { setErr(e.message); }
  };
  const run = async (id: string) => setCalc({ ...calc, [id]: (await api(`/boms/${id}?qty=${qty}`)).requirements });
  return <><div className="card"><h3>New BOM</h3>
    <select value={item} onChange={(e) => { setItem(e.target.value); setApp(''); }}><option value="">Finished product…</option>{opts(D.items.filter((i: R) => i.itemType === 'FINISHED_GOOD')).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    <select value={app} onChange={(e) => setApp(e.target.value)}><option value="">Vehicle application…</option>{opts(D.apps.filter((a: R) => a.itemId === item), appLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    <input type="number" value={outQty} onChange={(e) => setOutQty(e.target.value)} title="Output qty" />
    {lines.map((l, k) => <div key={k}><select value={l.itemId} onChange={(e) => setLine(k, { itemId: e.target.value })}><option value="">Raw material…</option>{opts(raws, (r) => `${r.name} (${unitSym(r.baseUnitId)})`).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      <input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(k, { quantity: e.target.value })} />
      <input type="number" placeholder="Scrap %" value={l.scrapPercent} onChange={(e) => setLine(k, { scrapPercent: e.target.value })} /></div>)}
    <button onClick={() => setLines([...lines, { itemId: '', quantity: '', scrapPercent: '0' }])}>+ Line</button> <button onClick={save}>Save BOM</button><div className="err">{err}</div></div>
    <div className="card"><h3>BOMs</h3>Production qty: <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      {D.boms.map((b: R) => <div key={b.id}><hr /><b>{D.items.find((i: R) => i.id === b.finishedItemId)?.name}</b> — {appLabel(D.apps.find((a: R) => a.id === b.vehicleApplicationId) ?? {})} <small>v{b.version} {b.status}</small>
        <ul>{b.lines.map((l: R) => <li key={l.id}>{D.items.find((i: R) => i.id === l.itemId)?.name}: {l.quantity} {unitSym(l.unitId)} per {b.outputQuantity}</li>)}</ul>
        <button onClick={() => run(b.id)}>Calculate requirement for {qty}</button>
        {calc[b.id] && <ul className="ok">{calc[b.id].map((r: R) => <li key={r.itemId}>{D.items.find((i: R) => i.id === r.itemId)?.name}: {r.required} {unitSym(r.unitId)}</li>)}</ul>}</div>)}</div></>;
}

function Stock() {
  const [rows, setRows] = useState<R[]>([]);
  useEffect(() => { api('/stock').then(setRows); }, []);
  return <div className="card"><h3>Stock (derived from ledger)</h3><table><thead><tr><th>Item</th><th>Unit</th><th>In</th><th>Out</th><th>Current</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.itemId}><td>{r.name} <small>{r.sku}</small></td><td>{r.unit}</td><td>{r.stockIn}</td><td>{r.stockOut}</td><td><b>{r.current}</b></td></tr>)}</tbody></table></div>;
}

function Production({ D, appLabel }: R) {
  const [item, setItem] = useState(''), [app, setApp] = useState(''), [qty, setQty] = useState('1'), [err, setErr] = useState(''), [res, setRes] = useState<R | null>(null);
  const run = async () => { try { setErr(''); setRes(await api('/production', { method: 'POST', body: { finishedItemId: item, vehicleApplicationId: app, quantity: +qty } })); } catch (e: any) { setErr(e.message); setRes(null); } };
  return <div className="card"><h3>Production test</h3>
    <select value={item} onChange={(e) => { setItem(e.target.value); setApp(''); }}><option value="">Finished product…</option>{opts(D.items.filter((i: R) => i.itemType === 'FINISHED_GOOD')).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    <select value={app} onChange={(e) => setApp(e.target.value)}><option value="">Vehicle application…</option>{opts(D.apps.filter((a: R) => a.itemId === item), appLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /><button onClick={run}>Run production</button>
    <div className="err">{err}</div>{res && <pre>{JSON.stringify(res, null, 2)}</pre>}
    <small>Seed stock covers 8 mats (PVC 100 SQFT ÷ 12.5). Try 10 to see the atomic rollback.</small></div>;
}
