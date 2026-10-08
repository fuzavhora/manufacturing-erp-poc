import { useCallback, useEffect, useState } from 'react';
import { api, session } from './api';

type R = Record<string, any>;
type Field = { k: string; l: string; sel?: [string, string][]; num?: boolean; required?: boolean };
type Column = [string, (r: R) => any];

const opts = (rows: R[], f: (r: R) => string = (r) => r.name): [string, string][] =>
  rows.map((r) => [r.id, f(r)]);

const NAV = [
  { id: 'Dashboard', label: 'Dashboard', icon: '⌂', all: true },
  { id: 'Categories', label: 'Categories', icon: '▦', owner: true },
  { id: 'Units', label: 'Units', icon: '◫', owner: true },
  { id: 'Vehicles', label: 'Vehicles', icon: '▤', owner: true },
  { id: 'Items', label: 'Items', icon: '□', owner: true },
  { id: 'Applications', label: 'Applications', icon: '⊞', owner: true },
  { id: 'BOM', label: 'BOM', icon: '≡', owner: true },
  { id: 'Stock', label: 'Stock', icon: '◈', all: true },
  { id: 'Production', label: 'Production', icon: '⚙', all: true },
  { id: 'Audit', label: 'Audit log', icon: '◷', owner: true },
];

export default function App() {
  const [me, setMe] = useState<R | null>(null);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    if (session.get()) {
      try { setMe(await api('/auth/me')); }
      catch { setMe(null); }
    } else setMe(null);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const h = () => setMe(null);
    window.addEventListener('unauth', h);
    return () => window.removeEventListener('unauth', h);
  }, [load]);

  if (!ready) return <div className="app-loading"><div className="spinner" /><span>Loading ERP…</span></div>;
  if (!me) return <Login onDone={() => { setPicking(false); load(); }} />;
  if (!me.orgId || picking) return <Picker orgs={me.organizations} onDone={() => { setPicking(false); load(); }} />;

  const org = me.organizations.find((o: R) => o.id === me.orgId);
  return <Shell me={me} org={org} onSwitch={() => setPicking(true)} onLogout={() => { session.clear(); setMe(null); }} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('owner@demo.com');
  const [password, setPassword] = useState('Demo@123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    try {
      setBusy(true); setErr('');
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      session.set(r.token); onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return <div className="auth-page">
    <div className="auth-brand"><div className="brand-mark">SC</div><div><strong>Manufacturing ERP</strong><span>Phase 1 • Operations</span></div></div>
    <div className="auth-card">
      <div className="eyebrow">WELCOME BACK</div>
      <h1>Sign in to your workspace</h1>
      <p className="muted">Manage products, vehicles, BOMs, stock and production from one place.</p>
      <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /></label>
      <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
      {err && <div className="alert error">{err}</div>}
      <button className="primary wide" onClick={go} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <div className="demo-note"><span>Demo access</span><small>owner@demo.com / Demo@123</small></div>
    </div>
    <div className="auth-footer">Secure company-scoped access • Multi-tenant ERP</div>
  </div>;
}

function Picker({ orgs, onDone }: { orgs: R[]; onDone: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const pick = async (id: string) => {
    try {
      setBusy(id); setErr('');
      const r = await api('/organizations/switch', { method: 'POST', body: { organizationId: id } });
      session.set(r.token); onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  };

  const create = async () => {
    if (name.trim().length < 2) { setErr('Enter a company name.'); return; }
    try {
      setCreating(true); setErr('');
      const r = await api('/organizations', {
        method: 'POST',
        body: { name: name.trim(), ...(code.trim() ? { code: code.trim() } : {}) },
      });
      session.set(r.token);
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setCreating(false); }
  };

  return <div className="picker-page"><div className="picker-card company-picker-card">
    <div className="brand-mark small">SC</div>
    <div className="eyebrow">YOUR COMPANIES</div>
    <h1>{orgs.length ? 'Select a company' : 'Create your first company'}</h1>
    <p className="muted">{orgs.length ? 'Switch between companies without signing out.' : 'Set up your first company to start using the ERP.'}</p>

    {orgs.length > 0 && <div className="org-list">{orgs.map((o) =>
      <button className="org-option" key={o.id} onClick={() => pick(o.id)} disabled={!!busy || creating}>
        <span className="org-icon">{o.name?.slice(0, 1)?.toUpperCase() || 'C'}</span>
        <span className="org-copy"><strong>{o.name}</strong><small>{busy === o.id ? 'Opening…' : o.role}</small></span>
        <span className="chevron">›</span>
      </button>
    )}</div>}

    {!creating ? <button className="add-company-button" onClick={() => { setCreating(true); setErr(''); }}>
      <span>＋</span><span><strong>Add another company</strong><small>Create a separate workspace under this account</small></span><b>›</b>
    </button> : <div className="company-create-panel">
      <div className="create-panel-head"><div><strong>New company</strong><small>This creates a new isolated workspace.</small></div><button className="icon-button" onClick={() => { setCreating(false); setErr(''); }}>×</button></div>
      <label>Company name<em>*</em><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Carstuff" autoFocus /></label>
      <label>Company code <span className="optional-label">optional</span><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. CARSTUFF" /></label>
      <button className="primary wide" onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create company'}</button>
    </div>}

    {err && <div className="alert error">{err}</div>}
  </div></div>;
}
function Shell({ me, org, onSwitch, onLogout }: R) {
  const [tab, setTab] = useState('Dashboard');
  const [openMobileNav, setOpenMobileNav] = useState(false);
  const [D, setD] = useState<R>({});
  const [err, setErr] = useState('');
  const isOwner = org?.role === 'OWNER';

  const reload = useCallback(async () => {
    try {
      setErr('');
      const [cats, units, makes, models, variants, items, apps, boms] = await Promise.all(
        ['/categories', '/units', '/vehicles/makes', '/vehicles/models', '/vehicles/variants', '/items', '/product-applications', '/boms'].map((p) => api(p))
      );
      setD({ cats, units, makes, models, variants, items, apps, boms });
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const visibleNav = NAV.filter((n) => n.all || (n.owner && isOwner));
  const active = NAV.find((n) => n.id === tab)?.label ?? tab;
  const selectTab = (id: string) => { setTab(id); setOpenMobileNav(false); };

  if (!D.items) return <div className="app-loading"><div className="spinner" /><span>{err || 'Loading workspace…'}</span></div>;

  return <div className="app-shell">
    <aside className={openMobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="sidebar-brand"><div className="brand-mark">SC</div><div><strong>Manufacturing ERP</strong><small>Phase 1</small></div></div>
      <div className="company-mini"><span className="company-avatar">{org?.name?.slice(0, 1)?.toUpperCase()}</span><span><strong>{org?.name}</strong><small>{org?.role}</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">{visibleNav.map((n) =>
        <button key={n.id} className={tab === n.id ? 'active' : ''} onClick={() => selectTab(n.id)}><span className="nav-icon">{n.icon}</span><span>{n.label}</span></button>
      )}</nav>
      <div className="sidebar-bottom">
        <button onClick={onSwitch}><span className="nav-icon">⇄</span>Switch company</button>
        <button onClick={onLogout}><span className="nav-icon">↪</span>Sign out</button>
      </div>
    </aside>
    {openMobileNav && <button className="nav-overlay" aria-label="Close navigation" onClick={() => setOpenMobileNav(false)} />}
    <section className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setOpenMobileNav(!openMobileNav)} aria-label="Open navigation">☰</button>
        <div className="breadcrumbs"><span>Workspace</span><b>›</b><strong>{active}</strong></div>
        <div className="topbar-actions"><span className="role-pill">{org?.role}</span><span className="user-email">{me.user.email}</span><button className="avatar-button" onClick={onSwitch} title="Switch company">{me.user.email?.slice(0, 1)?.toUpperCase()}</button></div>
      </header>
      <main className="content">
        {tab === 'Dashboard' && <Dashboard org={org} D={D} onNavigate={selectTab} isOwner={isOwner} />}
        {tab === 'Categories' && <Crud title="Categories" singular="Category" path="/categories" rows={D.cats} reload={reload} fields={[{ k: 'name', l: 'Name', required: true }, { k: 'parentId', l: 'Parent category', sel: opts(D.cats) }]} cols={[['Name', (r) => r.name], ['Parent', (r) => r.parentId ? nm(D.cats, r.parentId) : '—']]} />}
        {tab === 'Units' && <Crud title="Units" singular="Unit" path="/units" rows={D.units} reload={reload} fields={[{ k: 'name', l: 'Name', required: true }, { k: 'symbol', l: 'Symbol', required: true }, { k: 'unitType', l: 'Type', required: true }, { k: 'decimalPrecision', l: 'Decimal places', num: true }]} cols={[['Name', (r) => r.name], ['Symbol', (r) => r.symbol], ['Type', (r) => r.unitType], ['Decimals', (r) => r.decimalPrecision]]} />}
        {tab === 'Vehicles' && <Vehicles D={D} reload={reload} />}
        {tab === 'Items' && <Crud title="Items" singular="Item" path="/items" rows={D.items} reload={reload} fields={[{ k: 'sku', l: 'SKU', required: true }, { k: 'name', l: 'Item name', required: true }, { k: 'itemType', l: 'Item type', sel: [['RAW_MATERIAL', 'Raw material'], ['FINISHED_GOOD', 'Finished good']] }, { k: 'categoryId', l: 'Category', sel: opts(D.cats) }, { k: 'baseUnitId', l: 'Base unit', sel: opts(D.units, (u) => u.symbol) }]} cols={[['SKU', (r) => r.sku], ['Item', (r) => r.name], ['Type', (r) => pretty(r.itemType)], ['Category', (r) => r.categoryId ? nm(D.cats, r.categoryId) : '—'], ['Unit', (r) => unitSym(D.units, r.baseUnitId)]]} />}
        {tab === 'Applications' && <Crud title="Vehicle applications" singular="Application" path="/product-applications" rows={D.apps} reload={reload} fields={[{ k: 'itemId', l: 'Finished product', sel: opts(D.items.filter((i: R) => i.itemType === 'FINISHED_GOOD')) }, { k: 'vehicleVariantId', l: 'Vehicle variant', sel: opts(D.variants, (v) => variantLabel(D, v)) }, { k: 'yearFrom', l: 'Year from', num: true }, { k: 'yearTo', l: 'Year to', num: true }]} cols={[['Product', (r) => nm(D.items, r.itemId)], ['Vehicle', (r) => variantLabel(D, D.variants.find((v: R) => v.id === r.vehicleVariantId))], ['Years', (r) => r.yearFrom + '–' + r.yearTo]]} />}
        {tab === 'BOM' && <Bom D={D} appLabel={(a: R) => appLabel(D, a)} unitSym={(id: string) => unitSym(D.units, id)} reload={reload} />}
        {tab === 'Stock' && <Stock />}
        {tab === 'Production' && <Production D={D} appLabel={(a: R) => appLabel(D, a)} />}
        {tab === 'Audit' && <Audit />}
      </main>
      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        <button className={tab === 'Dashboard' ? 'active' : ''} onClick={() => selectTab('Dashboard')}><span>⌂</span><small>Home</small></button>
        <button className={tab === 'Items' ? 'active' : ''} onClick={() => selectTab('Items')}><span>□</span><small>Items</small></button>
        <button className={tab === 'Stock' ? 'active' : ''} onClick={() => selectTab('Stock')}><span>◈</span><small>Stock</small></button>
        <button className={tab === 'Production' ? 'active' : ''} onClick={() => selectTab('Production')}><span>⚙</span><small>Production</small></button>
        <button onClick={() => setOpenMobileNav(true)}><span>☰</span><small>More</small></button>
      </nav>
    </section>
  </div>;
}

function Dashboard({ org, D, onNavigate, isOwner }: R) {
  const [d, setD] = useState<R | null>(null);
  useEffect(() => { api('/dashboard').then(setD).catch(() => setD({})); }, []);
  if (!d) return <div className="page-state"><div className="spinner" />Loading dashboard…</div>;

  const actions = [
    ...(isOwner ? [
      { title: 'New item', text: 'Add material or finished product', tab: 'Items', icon: '＋' },
      { title: 'New BOM', text: 'Set production material recipe', tab: 'BOM', icon: '≡' },
    ] : []),
    { title: 'Record production', text: 'Create finished stock from a BOM', tab: 'Production', icon: '▶' },
    { title: 'Check stock', text: 'Review balances and shortages', tab: 'Stock', icon: '▤' },
  ];

  return <>
    <div className="dashboard-head">
      <div>
        <div className="eyebrow">BUSINESS OVERVIEW</div>
        <h1>{org?.name}</h1>
        <p>Good morning. Here is your current stock and production position.</p>
      </div>
      <button className="dashboard-company" onClick={() => onNavigate('Dashboard')}>
        <span className="company-avatar">{org?.name?.slice(0, 1)?.toUpperCase()}</span>
        <span><small>Company</small><strong>{org?.name}</strong></span>
      </button>
    </div>

    <div className="business-status">
      <div className="status-title"><span className="status-dot" /> Business status</div>
      <div className="status-grid">
        <StatusMetric label="Items" value={d.totalItems ?? 0} />
        <StatusMetric label="Raw materials" value={d.rawMaterials ?? 0} />
        <StatusMetric label="Finished goods" value={d.finishedGoods ?? 0} />
        <StatusMetric label="Low stock" value={d.lowStock ?? 0} tone={d.lowStock ? 'warning' : 'good'} />
        <StatusMetric label="Production today" value={d.todayProduction ?? 0} tone="blue" />
      </div>
    </div>

    <div className="dashboard-grid">
      <section className="dash-card trend-card">
        <div className="dash-card-head"><div><h2>Stock movement</h2><p>Last 6 months • quantity in vs quantity out</p></div><span className="period-pill">6 months</span></div>
        <MiniBarChart data={d.movement ?? []} />
        <div className="chart-legend"><span><i className="legend-in" /> Stock in</span><span><i className="legend-out" /> Stock out</span></div>
      </section>
      <section className="dash-card">
        <div className="dash-card-head"><div><h2>Production output</h2><p>Finished goods produced by month</p></div></div>
        <MiniLineChart data={d.movement ?? []} />
      </section>
    </div>

    <div className="dashboard-grid lower">
      <section className="dash-card">
        <div className="dash-card-head"><div><h2>Low stock</h2><p>Items below the current reorder threshold</p></div><button className="text-action" onClick={() => onNavigate('Stock')}>View stock →</button></div>
        {(d.lowStockItems ?? []).length === 0 ? <div className="empty-dashboard">✓ All tracked items are above the low-stock threshold.</div> :
          <div className="stock-list">{d.lowStockItems.map((r: R) => <button key={r.itemId} className="stock-row" onClick={() => onNavigate('Stock')}><span className="stock-item-icon">{r.itemType === 'RAW_MATERIAL' ? 'RM' : 'FG'}</span><span className="stock-item-copy"><strong>{r.name}</strong><small>{r.sku}</small></span><span className="stock-number low">{r.current} <small>{r.unit}</small></span></button>)}</div>}
      </section>
      <section className="dash-card">
        <div className="dash-card-head"><div><h2>Stock position</h2><p>Highest current balances</p></div><button className="text-action" onClick={() => onNavigate('Stock')}>View all →</button></div>
        {(d.topStock ?? []).length === 0 ? <div className="empty-dashboard">No stock has been recorded yet.</div> :
          <div className="stock-list">{d.topStock.map((r: R) => <div key={r.itemId} className="stock-row"><span className="stock-item-icon neutral">{r.itemType === 'RAW_MATERIAL' ? 'RM' : 'FG'}</span><span className="stock-item-copy"><strong>{r.name}</strong><small>{r.sku}</small></span><span className="stock-number">{r.current} <small>{r.unit}</small></span></div>)}</div>}
      </section>
    </div>

    <section className="section-block dashboard-actions">
      <div className="section-title"><div><h2>Common tasks</h2><p>Shortcuts for the work you do most often.</p></div></div>
      <div className="action-grid">{actions.map((a) => <button className="action-card" key={a.title} onClick={() => onNavigate(a.tab)}><span className="action-icon">{a.icon}</span><span><strong>{a.title}</strong><small>{a.text}</small></span><b>›</b></button>)}</div>
    </section>
  </>;
}

function StatusMetric({ label, value, tone = '' }: R) {
  return <div className={'status-metric ' + tone}><small>{label}</small><strong>{value}</strong></div>;
}

function MiniBarChart({ data }: { data: R[] }) {
  const max = Math.max(1, ...data.flatMap((x) => [Number(x.stockIn || 0), Number(x.stockOut || 0)]));
  return <div className="mini-chart bar-chart" aria-label="Six month stock movement chart">
    <div className="chart-bars">{data.map((x, i) => <div className="bar-group" key={i}><div className="bars"><span style={{ height: Math.max(3, Number(x.stockIn || 0) / max * 100) + '%' }} /><span className="out" style={{ height: Math.max(3, Number(x.stockOut || 0) / max * 100) + '%' }} /></div><small>{x.month}</small></div>)}</div>
  </div>;
}

function MiniLineChart({ data }: { data: R[] }) {
  const vals = data.map((x) => Number(x.production || 0));
  const max = Math.max(1, ...vals);
  const points = vals.map((v, i) => {
    const x = data.length <= 1 ? 50 : 8 + i * (84 / (data.length - 1));
    const y = 86 - (v / max) * 68;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return <div className="mini-chart line-chart">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Production output trend">
      <path className="chart-grid-line" d="M4 86 H96 M4 52 H96 M4 18 H96" />
      {points && <polyline className="chart-line" points={points} />}
      {vals.map((v, i) => { const x = data.length <= 1 ? 50 : 8 + i * (84 / (data.length - 1)); const y = 86 - (v / max) * 68; return <circle key={i} cx={x} cy={y} r="1.8" className="chart-point" />; })}
    </svg>
    <div className="line-labels">{data.map((x, i) => <small key={i}>{x.month}</small>)}</div>
  </div>;
}

function Stat({ label, value, icon, tone = '' }: R) {
  return <div className="stat-card"><span className={'stat-icon ' + tone}>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Vehicles({ D, reload }: R) {
  return <div className="stack">
    <Crud title="Vehicle makes" singular="Make" path="/vehicles/makes" rows={D.makes} reload={reload} fields={[{ k: 'name', l: 'Make name', required: true }]} cols={[['Make', (r) => r.name]]} />
    <Crud title="Vehicle models" singular="Model" path="/vehicles/models" rows={D.models} reload={reload} fields={[{ k: 'makeId', l: 'Make', sel: opts(D.makes), required: true }, { k: 'name', l: 'Model name', required: true }]} cols={[['Make', (r) => nm(D.makes, r.makeId)], ['Model', (r) => r.name]]} />
    <Crud title="Vehicle variants" singular="Variant" path="/vehicles/variants" rows={D.variants} reload={reload} fields={[{ k: 'modelId', l: 'Model', sel: opts(D.models, (m) => nm(D.makes, m.makeId) + ' ' + m.name), required: true }, { k: 'name', l: 'Variant name', required: true }, { k: 'engine', l: 'Engine' }, { k: 'fuelType', l: 'Fuel type' }]} cols={[['Model', (r) => nm(D.models, r.modelId)], ['Variant', (r) => r.name], ['Engine', (r) => r.engine || '—'], ['Fuel', (r) => r.fuelType || '—']]} />
  </div>;
}

function Crud({ title, singular, path, rows, fields, cols, reload }: { title: string; singular: string; path: string; rows: R[]; fields: Field[]; cols: Column[]; reload: () => Promise<void> }) {
  const [f, setF] = useState<R>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const body: R = {};
    for (const x of fields) { const v = f[x.k]; if (v !== undefined && v !== '') body[x.k] = x.num ? +v : v; }
    const missing = fields.filter((x) => x.required && !body[x.k]);
    if (missing.length) { setErr('Please enter ' + missing.map((x) => x.l).join(', ') + '.'); return; }
    try { setBusy(true); setErr(''); await api(path, { method: 'POST', body }); setF({}); await reload(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const act = async (r: R, del: boolean) => {
    try { setBusy(true); setErr(''); await api(path + '/' + r.id, del ? { method: 'DELETE' } : { method: 'PATCH', body: { isActive: true } }); await reload(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return <section className="data-card">
    <div className="card-heading"><div><h2>{title}</h2><p>{rows.length} {rows.length === 1 ? singular.toLowerCase() : title.toLowerCase()} in this company</p></div><span className="count-badge">{rows.length}</span></div>
    <div className="form-grid">{fields.map((x) => x.sel
      ? <label key={x.k}>{x.l}{x.required && <em>*</em>}<select value={f[x.k] ?? ''} onChange={(e) => setF({ ...f, [x.k]: e.target.value })}><option value="">Select {x.l.toLowerCase()}…</option>{x.sel.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      : <label key={x.k}>{x.l}{x.required && <em>*</em>}<input placeholder={x.l} type={x.num ? 'number' : 'text'} value={f[x.k] ?? ''} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} /></label>)}
      <div className="form-submit"><button className="primary" onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Add ' + singular}</button></div>
    </div>
    {err && <div className="alert error">{err}</div>}
    <div className="table-wrap"><table><thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}<th>Action</th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={cols.length + 1} className="empty">No records yet.</td></tr> :
        rows.map((r) => <tr key={r.id} className={r.isActive === false ? 'off' : ''}>{cols.map(([h, fn]) => <td key={h}>{fn(r)}</td>)}<td className="actions-cell">{r.isActive === false ? <button className="link-button" onClick={() => act(r, false)} disabled={busy}>Reactivate</button> : <button className="link-button danger" onClick={() => act(r, true)} disabled={busy}>{'isActive' in r ? 'Deactivate' : 'Delete'}</button>}</td></tr>)}
    </tbody></table></div>
  </section>;
}

function Bom({ D, appLabel, unitSym, reload }: R) {
  const [item, setItem] = useState(''), [app, setApp] = useState(''), [outQty, setOutQty] = useState('1'), [err, setErr] = useState('');
  const [lines, setLines] = useState<R[]>([{ itemId: '', quantity: '', scrapPercent: '0' }]);
  const [qty, setQty] = useState('10'), [calc, setCalc] = useState<R>({}), [busy, setBusy] = useState(false);
  const raws = D.items.filter((i: R) => i.itemType === 'RAW_MATERIAL');
  const setLine = (k: number, p: R) => setLines(lines.map((l, i) => i === k ? { ...l, ...p } : l));

  const save = async () => {
    try {
      setBusy(true); setErr('');
      if (!item || !app || !+outQty || lines.some((l) => !l.itemId || !+l.quantity)) { setErr('Complete the product, vehicle application, output quantity and all material lines.'); return; }
      await api('/boms', { method: 'POST', body: { finishedItemId: item, vehicleApplicationId: app, outputQuantity: +outQty, lines: lines.map((l) => ({ itemId: l.itemId, quantity: +l.quantity, scrapPercent: +l.scrapPercent })) } });
      setItem(''); setApp(''); setLines([{ itemId: '', quantity: '', scrapPercent: '0' }]); await reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const run = async (id: string) => { try { setErr(''); setCalc({ ...calc, [id]: (await api('/boms/' + id + '?qty=' + qty)).requirements }); } catch (e: any) { setErr(e.message); } };

  return <div className="stack">
    <section className="data-card"><div className="card-heading"><div><h2>Create bill of materials</h2><p>Define the materials required to produce a finished good.</p></div></div>
      <div className="form-grid">
        <label>Finished product<select value={item} onChange={(e) => { setItem(e.target.value); setApp(''); }}><option value="">Select finished product…</option>{opts(D.items.filter((i: R) => i.itemType === 'FINISHED_GOOD')).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Vehicle application<select value={app} onChange={(e) => setApp(e.target.value)}><option value="">Select application…</option>{opts(D.apps.filter((a: R) => a.itemId === item), appLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Output quantity<input type="number" min="0.01" value={outQty} onChange={(e) => setOutQty(e.target.value)} /></label>
      </div>
      <div className="subheading"><strong>Material requirements</strong><span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span></div>
      <div className="bom-lines">{lines.map((l, k) => <div className="bom-line" key={k}>
        <span className="line-number">{k + 1}</span>
        <select value={l.itemId} onChange={(e) => setLine(k, { itemId: e.target.value })}><option value="">Select raw material…</option>{opts(raws, (r) => r.name + ' (' + unitSym(r.baseUnitId) + ')').map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <input type="number" min="0" placeholder="Quantity" value={l.quantity} onChange={(e) => setLine(k, { quantity: e.target.value })} />
        <input type="number" min="0" placeholder="Scrap %" value={l.scrapPercent} onChange={(e) => setLine(k, { scrapPercent: e.target.value })} />
        {lines.length > 1 && <button className="icon-button danger" onClick={() => setLines(lines.filter((_, i) => i !== k))}>×</button>}
      </div>)}</div>
      <div className="form-footer"><button className="secondary" onClick={() => setLines([...lines, { itemId: '', quantity: '', scrapPercent: '0' }])}>+ Add material</button><button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save BOM'}</button></div>
      {err && <div className="alert error">{err}</div>}
    </section>
    <section className="data-card"><div className="card-heading"><div><h2>Existing BOMs</h2><p>Review versions and calculate material requirements.</p></div></div>
      <div className="calc-bar"><label>Production quantity<input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label></div>
      {D.boms.length === 0 ? <div className="empty-panel">No BOMs have been created yet.</div> : D.boms.map((b: R) => <div className="bom-card" key={b.id}>
        <div className="bom-card-head"><div><strong>{D.items.find((i: R) => i.id === b.finishedItemId)?.name}</strong><small>{appLabel(D.apps.find((a: R) => a.id === b.vehicleApplicationId) ?? {})}</small></div><span className="status-chip">{b.status} • v{b.version}</span></div>
        <ul>{b.lines.map((l: R) => <li key={l.id}>{D.items.find((i: R) => i.id === l.itemId)?.name}: <b>{l.quantity}</b> {unitSym(l.unitId)} per {b.outputQuantity}</li>)}</ul>
        <button className="secondary" onClick={() => run(b.id)}>Calculate for {qty}</button>
        {calc[b.id] && <div className="requirement-box"><strong>Required materials</strong><ul>{calc[b.id].map((r: R) => <li key={r.itemId}>{D.items.find((i: R) => i.id === r.itemId)?.name}: <b>{r.required}</b> {unitSym(r.unitId)}</li>)}</ul></div>}
      </div>)}
    </section>
  </div>;
}

function Stock() {
  const [rows, setRows] = useState<R[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api('/stock').then(setRows).catch((e) => setErr(e.message)); }, []);
  return <section className="data-card"><div className="card-heading"><div><h2>Stock overview</h2><p>Current balances calculated from the append-only stock ledger.</p></div><span className="count-badge">{rows.length}</span></div>
    {err && <div className="alert error">{err}</div>}
    <div className="table-wrap"><table><thead><tr><th>Item</th><th>Unit</th><th>In</th><th>Out</th><th>Current balance</th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={5} className="empty">No stock records yet.</td></tr> : rows.map((r) => <tr key={r.itemId}><td><strong>{r.name}</strong><small className="table-sub">{r.sku}</small></td><td>{r.unit}</td><td>{r.stockIn}</td><td>{r.stockOut}</td><td><span className={Number(r.current) < 20 ? 'stock-low' : 'stock-ok'}>{r.current}</span></td></tr>)}
    </tbody></table></div>
  </section>;
}

function Production({ D, appLabel }: R) {
  const [item, setItem] = useState(''), [app, setApp] = useState(''), [qty, setQty] = useState('1');
  const [err, setErr] = useState(''), [res, setRes] = useState<R | null>(null), [busy, setBusy] = useState(false);
  const run = async () => {
    try {
      setBusy(true); setErr(''); setRes(null);
      if (!item || !app || !+qty) { setErr('Select a finished product, vehicle application and valid quantity.'); return; }
      setRes(await api('/production', { method: 'POST', body: { finishedItemId: item, vehicleApplicationId: app, quantity: +qty } }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return <section className="data-card"><div className="card-heading"><div><h2>Production entry</h2><p>Run a BOM-backed production transaction. Material consumption and finished stock are committed atomically.</p></div></div>
    <div className="form-grid">
      <label>Finished product<select value={item} onChange={(e) => { setItem(e.target.value); setApp(''); }}><option value="">Select finished product…</option>{opts(D.items.filter((i: R) => i.itemType === 'FINISHED_GOOD')).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Vehicle application<select value={app} onChange={(e) => setApp(e.target.value)}><option value="">Select application…</option>{opts(D.apps.filter((a: R) => a.itemId === item), appLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Production quantity<input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
    </div>
    <div className="form-footer"><button className="primary" onClick={run} disabled={busy}>{busy ? 'Processing…' : 'Record production'}</button></div>
    {err && <div className="alert error">{err}</div>}
    {res && <div className="success-panel"><div className="success-icon">✓</div><div><strong>Production recorded successfully</strong><p>The production transaction was committed and stock was updated.</p><pre>{JSON.stringify(res, null, 2)}</pre></div></div>}
  </section>;
}

function Audit() {
  const [rows, setRows] = useState<R[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api('/audit').then(setRows).catch((e) => setErr(e.message)); }, []);
  return <section className="data-card"><div className="card-heading"><div><h2>Audit log</h2><p>Recent changes recorded for this company.</p></div><span className="count-badge">{rows.length}</span></div>
    {err && <div className="alert error">{err}</div>}
    <div className="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Reference</th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={4} className="empty">No audit entries yet.</td></tr> : rows.map((r) => <tr key={r.id}><td>{formatDate(r.createdAt)}</td><td><span className="action-tag">{pretty(r.action)}</span></td><td>{pretty(r.entityType)}</td><td>{r.entityId || '—'}</td></tr>)}
    </tbody></table></div>
  </section>;
}

function nm(rows: R[], id?: string) { return rows.find((r) => r.id === id)?.name ?? '—'; }
function unitSym(units: R[], id?: string) { return units.find((u) => u.id === id)?.symbol ?? '—'; }
function variantLabel(D: R, v?: R) {
  if (!v) return '—';
  const m = D.models.find((x: R) => x.id === v.modelId);
  return (nm(D.makes, m?.makeId) + ' ' + (m?.name ?? '') + ' ' + (v.name ?? '')).trim();
}
function appLabel(D: R, a?: R) {
  if (!a) return '—';
  return nm(D.items, a.itemId) + ' → ' + variantLabel(D, D.variants.find((v: R) => v.id === a.vehicleVariantId)) + ' (' + a.yearFrom + '-' + a.yearTo + ')';
}
function pretty(v: any) { return String(v ?? '').replaceAll('_', ' ').replace(/\\b\\w/g, (m) => m.toUpperCase()); }
function formatDate(v: any) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
