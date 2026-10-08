import { useCallback, useEffect, useState } from 'react';
import { api, session } from './api';

type R = Record<string, any>;
type Field = { k: string; l: string; sel?: [string, string][]; num?: boolean; required?: boolean };
type Column = [string, (r: R) => any];

const opts = (rows: R[], f: (r: R) => string = (r) => r.name): [string, string][] =>
  rows.map((r) => [r.id, f(r)]);

const ACTIONS = ['read','create','edit','delete'];
const NAV = [
  { id: 'Dashboard', label: 'Dashboard', icon: '⌂', perm: 'dashboard.read' },
  { id: 'Categories', label: 'Categories', icon: '▦', perm: 'categories.read' },
  { id: 'Units', label: 'Units', icon: '◫', perm: 'units.read' },
  { id: 'Vehicles', label: 'Vehicles', icon: '▤', perm: 'vehicles.read' },
  { id: 'Items', label: 'Items', icon: '□', perm: 'items.read' },
  { id: 'Applications', label: 'Applications', icon: '⊞', perm: 'applications.read' },
  { id: 'BOM', label: 'BOM', icon: '≡', perm: 'boms.read' },
  { id: 'Stock', label: 'Stock', icon: '◈', perm: 'stock.read' },
  { id: 'Production', label: 'Production', icon: '⚙', perm: 'production.read' },
  { id: 'Audit', label: 'Audit log', icon: '◷', perm: 'audit.read' },
  { id: 'Roles', label: 'Roles & permissions', icon: '♙', owner: true },
  { id: 'Users', label: 'Users & access', icon: '♟', owner: true },
  { id: 'Company', label: 'Company settings', icon: '⚙', owner: true },
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
  if (!me) return window.location.pathname === '/invite' ? <InviteAccept onDone={() => { window.history.replaceState({}, '', '/'); load(); }} /> : <Login onDone={() => { setPicking(false); load(); }} />;
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
  const can = (module: string, action = 'read') => isOwner || (me.permissions ?? []).includes(module + '.' + action);

  const reload = useCallback(async () => {
    try {
      setErr('');
      const req = async (module: string, path: string) => can(module) ? api(path) : Promise.resolve([]);
      const [cats, units, makes, models, variants, items, apps, boms] = await Promise.all([
        req('categories','/categories'), req('units','/units'), req('vehicles','/vehicles/makes'),
        req('vehicles','/vehicles/models'), req('vehicles','/vehicles/variants'), req('items','/items'),
        req('applications','/product-applications'), req('boms','/boms')
      ]);
      setD({ cats, units, makes, models, variants, items, apps, boms });
    } catch (e: any) { setErr(e.message); }
  }, [me.permissions, isOwner]);

  useEffect(() => { reload(); }, [reload]);

  const visibleNav = NAV.filter((n) => n.owner ? isOwner : !n.perm || can(n.perm.split('.')[0], n.perm.split('.')[1]));
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
        {tab === 'Roles' && <Roles me={me} />}
        {tab === 'Users' && <Users />}
        {tab === 'Company' && <Company />}
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

function InviteAccept({ onDone }: { onDone: () => void }) {
  const token=new URLSearchParams(window.location.search).get('token')||'';
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const submit=async()=>{if(password.length<8||password!==confirm){setErr('Use an 8+ character password and make both passwords match.');return}try{setBusy(true);const r=await api('/invitations/accept',{method:'POST',body:{token,password}});session.set(r.token);onDone()}catch(e:any){setErr(e.message)}finally{setBusy(false)}};
  return <div className="auth-page"><div className="auth-brand"><div className="brand-mark">SC</div><div><strong>Manufacturing ERP</strong><span>Company invitation</span></div></div><div className="auth-card"><div className="eyebrow">INVITATION</div><h1>Join your company</h1><p className="muted">Set your password to activate your ERP account.</p><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters"/></label><label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{err&&<div className="alert error">{err}</div>}<button className="primary wide" onClick={submit} disabled={busy||!token}>{busy?'Activating…':'Accept invitation'}</button></div></div>;
}

function Users() {
  const [members,setMembers]=useState<R[]>([]),[roles,setRoles]=useState<R[]>([]),[invs,setInvs]=useState<R[]>([]);
  const [tab,setTab]=useState<'members'|'invitations'>('members');
  const [search,setSearch]=useState(''),[roleFilter,setRoleFilter]=useState('ALL'),[statusFilter,setStatusFilter]=useState('ALL');
  const [inviteOpen,setInviteOpen]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[roleId,setRoleId]=useState('');
  const [invite,setInvite]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState('');

  const load=async()=>{try{
    setErr('');
    const [m,r,i]=await Promise.all([api('/members'),api('/roles'),api('/invitations')]);
    setMembers(m);setRoles(r);setInvs(i);
  }catch(e:any){setErr(e.message)}};
  useEffect(()=>{load()},[]);

  const send=async()=>{
    try{
      setBusy('invite');setErr('');
      const r=await api('/invitations',{method:'POST',body:{name:name.trim(),email:email.trim(),roleId}});
      setInvite(window.location.origin+'/invite?token='+r.inviteToken);
      setName('');setEmail('');setRoleId('');
      await load();
    }catch(e:any){setErr(e.message)}finally{setBusy('')}
  };
  const revoke=async(id:string)=>{try{setBusy(id);await api('/invitations/'+id+'/revoke',{method:'POST'});await load()}catch(e:any){setErr(e.message)}finally{setBusy('')}};
  const assign=async(id:string,rid:string)=>{try{setBusy(id);await api('/members/'+id+'/role',{method:'PATCH',body:{roleId:rid}});await load()}catch(e:any){setErr(e.message)}finally{setBusy('')}};
  const setStatus=async(id:string,status:'ACTIVE'|'INACTIVE')=>{try{setBusy(id);await api('/members/'+id+'/status',{method:'PATCH',body:{status}});await load()}catch(e:any){setErr(e.message)}finally{setBusy('')}};
  const copyInvite=async()=>{try{await navigator.clipboard.writeText(invite)}catch{}};

  const pendingInvites=invs.filter(i=>i.status==='PENDING');
  const activeCount=members.filter(m=>m.status==='ACTIVE').length;
  const inactiveCount=members.filter(m=>m.status!=='ACTIVE').length;
  const filtered=members.filter(m=>{
    const q=search.trim().toLowerCase();
    return (!q||m.name?.toLowerCase().includes(q)||m.email?.toLowerCase().includes(q))
      &&(roleFilter==='ALL'||m.roleId===roleFilter||m.role===roleFilter)
      &&(statusFilter==='ALL'||m.status===statusFilter);
  });

  return <div className="users-page">
    <section className="users-head">
      <div><div className="eyebrow">TEAM ACCESS</div><h1>Team members</h1><p>Manage who has access to <strong>this company</strong> and what they can do.</p></div>
      <button className="primary invite-button" onClick={()=>{setInviteOpen(true);setErr('');}}>＋ Invite member</button>
    </section>

    {err&&<div className="alert error users-alert">{err}</div>}

    <section className="users-summary">
      <div className="user-stat"><span className="user-stat-icon blue">♙</span><div><small>Total members</small><strong>{members.length}</strong></div></div>
      <div className="user-stat"><span className="user-stat-icon green">✓</span><div><small>Active access</small><strong>{activeCount}</strong></div></div>
      <div className="user-stat"><span className="user-stat-icon amber">⌛</span><div><small>Pending invites</small><strong>{pendingInvites.length}</strong></div></div>
      <div className="user-stat"><span className="user-stat-icon slate">◈</span><div><small>Custom roles</small><strong>{roles.filter(r=>!r.isSystem).length}</strong></div></div>
    </section>

    <section className="users-panel">
      <div className="users-tabs">
        <button className={tab==='members'?'active':''} onClick={()=>setTab('members')}>Team members <b>{members.length}</b></button>
        <button className={tab==='invitations'?'active':''} onClick={()=>setTab('invitations')}>Invitations <b>{pendingInvites.length}</b></button>
      </div>

      {tab==='members' ? <>
        <div className="member-toolbar">
          <div className="member-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or email…"/></div>
          <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="ALL">All roles</option>{roles.filter(r=>r.name!=='OWNER').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
          {(search||roleFilter!=='ALL'||statusFilter!=='ALL')&&<button className="clear-filter" onClick={()=>{setSearch('');setRoleFilter('ALL');setStatusFilter('ALL')}}>Clear</button>}
        </div>

        <div className="member-table-wrap">
          <table className="member-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Access</th><th className="actions-cell">Action</th></tr></thead>
            <tbody>{filtered.map(m=><tr key={m.id}>
              <td><div className="member-cell"><span className={'member-avatar '+(m.role==='OWNER'?'owner':'')}>{m.name?.slice(0,1).toUpperCase()}</span><div><strong>{m.name}</strong><small>{m.email}</small></div></div></td>
              <td>{m.role==='OWNER'?<span className="role-tag owner">Owner</span>:<select className="role-inline" value={m.roleId||''} disabled={busy===m.id} onChange={e=>assign(m.id,e.target.value)}>{roles.filter(r=>r.name!=='OWNER').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>}</td>
              <td><span className={'member-status '+(m.status==='ACTIVE'?'active':'inactive')}><i/> {m.status==='ACTIVE'?'Active':'Inactive'}</span></td>
              <td><span className="access-note">{m.role==='OWNER'?'Full access':m.status==='ACTIVE'?'Role based access':'Access disabled'}</span></td>
              <td className="actions-cell">{m.role!=='OWNER'&&<button className={'status-action '+(m.status==='ACTIVE'?'deactivate':'activate')} disabled={busy===m.id} onClick={()=>setStatus(m.id,m.status==='ACTIVE'?'INACTIVE':'ACTIVE')}>{m.status==='ACTIVE'?'Deactivate':'Activate'}</button>}</td>
            </tr>)}</tbody>
          </table>
          {!filtered.length&&<div className="users-empty"><strong>No members found</strong><span>Try changing your search or filters.</span></div>}
        </div>
        <div className="member-footer"><span>Showing {filtered.length} of {members.length} members</span><span>{inactiveCount} inactive</span></div>

        <div className="mobile-member-list">{filtered.map(m=><article className="mobile-member-card" key={m.id}>
          <div className="mobile-member-top"><div className="member-cell"><span className={'member-avatar '+(m.role==='OWNER'?'owner':'')}>{m.name?.slice(0,1).toUpperCase()}</span><div><strong>{m.name}</strong><small>{m.email}</small></div></div><span className={'member-status '+(m.status==='ACTIVE'?'active':'inactive')}><i/></span></div>
          <div className="mobile-member-meta"><div><small>Role</small>{m.role==='OWNER'?<span className="role-tag owner">Owner</span>:<select className="role-inline" value={m.roleId||''} onChange={e=>assign(m.id,e.target.value)}>{roles.filter(r=>r.name!=='OWNER').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>}</div><div><small>Status</small><strong>{m.status==='ACTIVE'?'Active':'Inactive'}</strong></div></div>
          {m.role!=='OWNER'&&<button className={'mobile-access-action '+(m.status==='ACTIVE'?'deactivate':'activate')} onClick={()=>setStatus(m.id,m.status==='ACTIVE'?'INACTIVE':'ACTIVE')}>{m.status==='ACTIVE'?'Disable access':'Restore access'}</button>}
        </article>)}</div>
      </> : <div className="invitation-list">
        {!pendingInvites.length?<div className="users-empty"><strong>No pending invitations</strong><span>Invite a team member to give them access to this company.</span><button className="primary" onClick={()=>setInviteOpen(true)}>Invite member</button></div>:
          pendingInvites.map(i=><article className="invitation-row" key={i.id}><span className="invite-avatar">{i.name?.slice(0,1).toUpperCase()}</span><div className="invite-copy"><strong>{i.name}</strong><small>{i.email} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></div><span className="pending-badge">Pending</span><button className="secondary danger" disabled={busy===i.id} onClick={()=>revoke(i.id)}>{busy===i.id?'…':'Revoke'}</button></article>)}
      </div>}
    </section>

    {inviteOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setInviteOpen(false)}}>
      <section className="invite-modal" role="dialog" aria-modal="true">
        <div className="invite-modal-head"><div><div className="eyebrow">NEW INVITATION</div><h2>Invite team member</h2><p>Choose their role now. They will only get the permissions assigned to that role.</p></div><button className="modal-close" onClick={()=>setInviteOpen(false)}>×</button></div>
        <div className="invite-form"><label>Full name<em>*</em><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rahul Patel"/></label><label>Email address<em>*</em><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="employee@company.com"/></label><label>Role<em>*</em><select value={roleId} onChange={e=>setRoleId(e.target.value)}><option value="">Select a role</option>{roles.filter(r=>r.name!=='OWNER').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div>
        {invite&&<div className="invite-created"><strong>Invitation ready</strong><span>Copy this link and send it to the employee.</span><div><input readOnly value={invite}/><button className="secondary" onClick={copyInvite}>Copy</button></div></div>}
        <div className="invite-modal-footer"><button className="secondary" onClick={()=>setInviteOpen(false)}>Close</button><button className="primary" disabled={!name.trim()||!email.trim()||!roleId||busy==='invite'} onClick={send}>{busy==='invite'?'Creating…':'Create invitation'}</button></div>
      </section>
    </div>}
  </div>;
}

function Company() {
  const [org,setOrg]=useState<R|null>(null),[members,setMembers]=useState<R[]>([]),[roles,setRoles]=useState<R[]>([]),[invs,setInvs]=useState<R[]>([]);
  const [name,setName]=useState(''),[err,setErr]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
  const load=async()=>{try{
    setErr('');
    const [o,m,r,i]=await Promise.all([api('/organization'),api('/members'),api('/roles'),api('/invitations')]);
    setOrg(o);setName(o.name);setMembers(m);setRoles(r);setInvs(i);
  }catch(e:any){setErr(e.message)}};
  useEffect(()=>{load()},[]);
  const save=async()=>{
    try{setBusy(true);setErr('');const r=await api('/organization',{method:'PATCH',body:{name:name.trim()}});setOrg(r);setSaved(true);setTimeout(()=>setSaved(false),2200)}
    catch(e:any){setErr(e.message)}finally{setBusy(false)}
  };
  if(!org)return <div className="page-state">{err||'Loading company…'}</div>;
  const active=members.filter(m=>m.status==='ACTIVE').length;
  const pending=invs.filter(i=>i.status==='PENDING').length;
  const custom=roles.filter(r=>!r.isSystem).length;
  return <div className="company-page">
    <section className="company-head">
      <div><div className="eyebrow">COMPANY MANAGEMENT</div><h1>{org.name}</h1><p>Manage the identity and access workspace for this company.</p></div>
      <button className="secondary" onClick={()=>load()}>↻ Refresh</button>
    </section>

    {err&&<div className="alert error company-alert">{err}</div>}
    {saved&&<div className="alert success company-alert">Company details saved successfully.</div>}

    <section className="company-overview">
      <div className="company-identity-card">
        <div className="company-large-avatar">{org.name.slice(0,1).toUpperCase()}</div>
        <div className="company-identity-copy"><div className="eyebrow">CURRENT WORKSPACE</div><h2>{org.name}</h2><div className="company-code">Company code <strong>{org.code}</strong></div></div>
      </div>
      <div className="company-stat"><small>Team members</small><strong>{members.length}</strong><span>{active} active</span></div>
      <div className="company-stat"><small>Pending invites</small><strong>{pending}</strong><span>Awaiting acceptance</span></div>
      <div className="company-stat"><small>Custom roles</small><strong>{custom}</strong><span>Company specific</span></div>
    </section>

    <section className="company-grid">
      <article className="company-card">
        <div className="company-card-head"><div><h2>Company profile</h2><p>This information identifies the current workspace.</p></div><span className="settings-badge">OWNER ONLY</span></div>
        <div className="company-form">
          <label>Company name<em>*</em><input value={name} onChange={e=>setName(e.target.value)} placeholder="Company name"/></label>
          <label>Company code<small>Permanent workspace identifier</small><input value={org.code||''} disabled/></label>
        </div>
        <div className="company-card-footer"><span>Changes are recorded in the company audit log.</span><button className="primary" onClick={save} disabled={busy||name.trim().length<2||name.trim()===org.name}>{busy?'Saving…':'Save changes'}</button></div>
      </article>

      <article className="company-card">
        <div className="company-card-head"><div><h2>Access structure</h2><p>How this company is organized.</p></div></div>
        <div className="company-structure">
          <div><span className="structure-icon">♙</span><div><strong>Team members</strong><small>{members.length} people have membership records</small></div></div>
          <div><span className="structure-icon">◆</span><div><strong>Roles & permissions</strong><small>{roles.length} roles, including system roles</small></div></div>
          <div><span className="structure-icon">⌛</span><div><strong>Invitations</strong><small>{pending ? pending+' pending invitation'+(pending===1?'':'s') : 'No pending invitations'}</small></div></div>
        </div>
      </article>
    </section>

    <section className="company-guidance">
      <div className="guidance-icon">i</div>
      <div><strong>Company-scoped access</strong><p>Members, roles, permissions and ERP data belong to this company. Switching companies changes the active workspace without signing out.</p></div>
    </section>
  </div>;
}

function Roles({ me }: R) {
  const [roles,setRoles]=useState<R[]>([]), [selected,setSelected]=useState<R|null>(null), [catalog,setCatalog]=useState<R[]>([]);
  const [members,setMembers]=useState<R[]>([]);
  const [name,setName]=useState(''), [description,setDescription]=useState(''), [keys,setKeys]=useState<string[]>([]);
  const [err,setErr]=useState(''), [busy,setBusy]=useState(false), [editing,setEditing]=useState(false);

  const ACTIONS = ['read','create','edit','delete'];
  const load=async()=>{try{
    const [rs,ps,ms]=await Promise.all([api('/roles'),api('/permissions'),api('/members')]);
    setRoles(rs); setCatalog(ps); setMembers(ms);
    if (!selected && rs.length) {
      const r=rs[0]; const detail=await api('/roles/'+r.id);
      setSelected(detail); setName(detail.name); setDescription(detail.description||''); setKeys(detail.permissions||[]);
    }
  }catch(e:any){setErr(e.message)}};

  useEffect(()=>{load()},[]);

  const select=async(id:string)=>{
    try{
      setErr(''); const r=await api('/roles/'+id);
      setSelected(r); setName(r.name); setDescription(r.description||''); setKeys(r.permissions||[]); setEditing(false);
    }catch(e:any){setErr(e.message)}
  };

  const beginNew=()=>{setSelected(null);setName('');setDescription('');setKeys([]);setEditing(true);setErr('')};
  const toggle=(k:string)=>setKeys(prev=>prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]);
  const moduleKeys=(module:string)=>catalog.filter(p=>p.module===module).map(p=>p.key);
  const moduleChecked=(module:string,action:string)=>keys.includes(module+'.'+action);
  const toggleModule=(module:string,action:string)=>{
    const key=module+'.'+action;
    const exists=keys.includes(key);
    setKeys(prev=>exists?prev.filter(x=>x!==key):[...prev,key]);
  };
  const toggleModuleAll=(module:string)=>{
    if(module==='__ALL__'){
      setKeys(prev=>allKeys.length && allKeys.every(k=>prev.includes(k)) ? [] : allKeys);
      return;
    }
    const ks=moduleKeys(module), all=ks.length>0 && ks.every(k=>keys.includes(k));
    setKeys(prev=>all?prev.filter(k=>!ks.includes(k)):Array.from(new Set([...prev,...ks])));
  };
  const allKeys=catalog.map(p=>p.key);
  const allSelected=allKeys.length>0 && allKeys.every(k=>keys.includes(k));

  const save=async()=>{
    try{
      setBusy(true);setErr('');
      if(!name.trim()){setErr('Enter a role name.');return}
      let r: R;
      if(!selected){r=await api('/roles',{method:'POST',body:{name,description,permissionKeys:keys}})}
      else {
        await api('/roles/'+selected.id,{method:'PATCH',body:{name,description}});
        await api('/roles/'+selected.id+'/permissions',{method:'PUT',body:{permissionKeys:keys}});
        r=await api('/roles/'+selected.id);
      }
      setSelected(r);setName(r.name);setDescription(r.description||'');setKeys(r.permissions||[]);
      setEditing(false);await load();
    }catch(e:any){setErr(e.message)}finally{setBusy(false)}
  };

  const remove=async()=>{
    if(!selected)return;
    if(!window.confirm('Delete this custom role?'))return;
    try{setBusy(true);await api('/roles/'+selected.id,{method:'DELETE'});setSelected(null);setEditing(false);await load()}catch(e:any){setErr(e.message)}finally{setBusy(false)}
  };

  const grouped=catalog.reduce((a:any,p:any)=>{(a[p.module]??=[]).push(p);return a},{});
  const memberCount=selected ? members.filter(m=>m.roleId===selected.id).length : 0;

  return <div className="roles-page">
    <section className="roles-header">
      <div>
        <div className="eyebrow">ACCESS CONTROL</div>
        <h1>Roles & permissions</h1>
        <p>Create job-based roles and control exactly what each team member can do.</p>
      </div>
      <button className="primary" onClick={beginNew}>＋ New role</button>
    </section>

    {err&&<div className="alert error roles-alert">{err}</div>}

    <section className="roles-layout">
      <aside className="roles-list-panel">
        <div className="roles-panel-head"><div><strong>Company roles</strong><small>{roles.length} roles</small></div></div>
        <div className="roles-list">
          {roles.map(r=><button key={r.id} className={'role-list-item '+(selected?.id===r.id?'active':'')} onClick={()=>select(r.id)}>
            <span className="role-avatar">{r.name.slice(0,1).toUpperCase()}</span>
            <span className="role-list-copy"><strong>{r.name}</strong><small>{r.isSystem?'System role':(members.filter(m=>m.roleId===r.id).length+' members')}</small></span>
            <span className="role-chevron">›</span>
          </button>)}
          {!roles.length&&<div className="roles-empty">No roles yet.</div>}
        </div>
      </aside>

      <div className="role-detail">
        {editing ? <section className="role-editor-card">
          <div className="role-editor-head"><div><div className="eyebrow">{selected?'EDIT ROLE':'NEW ROLE'}</div><h2>{selected?selected.name:'Create a custom role'}</h2><p>Give the role a clear job responsibility, then select its allowed actions below.</p></div><button className="secondary" onClick={()=>setEditing(false)}>Cancel</button></div>
          <div className="role-meta-form"><label>Role name<em>*</em><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Production Manager"/></label><label>Description<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short description"/></label></div>
          <PermissionMatrix catalog={catalog} keys={keys} onToggle={toggleModule} onToggleAll={toggleModuleAll} allSelected={allSelected}/>
          <div className="role-editor-footer"><span>{keys.length} permission{keys.length===1?'':'s'} selected</span><div><button className="secondary" onClick={()=>setEditing(false)}>Cancel</button><button className="primary" onClick={save} disabled={busy||name.trim().length<2}>{busy?'Saving…':selected?'Save role':'Create role'}</button></div></div>
        </section> : selected ? <section className="role-detail-card">
          <div className="role-detail-head">
            <div className="role-title-wrap"><span className="role-big-avatar">{selected.name.slice(0,1).toUpperCase()}</span><div><div className="eyebrow">{selected.isSystem?'SYSTEM ROLE':'CUSTOM ROLE'}</div><h2>{selected.name}</h2><p>{selected.description||'No description provided.'}</p></div></div>
            <div className="role-head-actions">{!selected.isSystem&&<><button className="secondary" onClick={()=>setEditing(true)}>Edit role</button><button className="secondary danger" onClick={remove}>Delete</button></>}</div>
          </div>
          <div className="role-stats"><div><strong>{keys.length}</strong><span>Permissions</span></div><div><strong>{memberCount}</strong><span>Assigned members</span></div><div><strong>{Object.keys(grouped).filter(m=>keys.some(k=>k.startsWith(m+'.'))).length}</strong><span>Modules enabled</span></div></div>
          <div className="permission-section-head"><div><h3>Permission matrix</h3><p>Read is the minimum access. Create, edit and delete are granted independently.</p></div></div>
          <PermissionMatrix catalog={catalog} keys={keys} readOnly />
        </section> : <section className="role-detail-card empty-role"><div className="empty-role-icon">♙</div><h2>Select a role</h2><p>Choose a role from the left or create a new one.</p><button className="primary" onClick={beginNew}>Create first role</button></section>}
      </div>
    </section>
  </div>;
}

function PermissionMatrix({catalog,keys,onToggle,onToggleAll,allSelected,readOnly=false}: {catalog:R[];keys:string[];onToggle?:(m:string,a:string)=>void;onToggleAll?:(m:string)=>void;allSelected?:boolean;readOnly?:boolean}) {
  const grouped=catalog.reduce((a:any,p:any)=>{(a[p.module]??=[]).push(p);return a},{});
  const modules=Object.keys(grouped);
  const actionLabel=(a:string)=>({read:'Read',create:'Create',edit:'Edit',delete:'Delete'} as any)[a]||pretty(a);
  return <div className="permission-matrix-wrap">
    <div className="permission-toolbar"><span>Module access</span><div className="permission-toolbar-actions"><span>Read</span><span>Create</span><span>Edit</span><span>Delete</span></div></div>
    <div className="permission-matrix">
      {modules.map(module=>{
        const available=grouped[module].map((p:R)=>p.action);
        const moduleKeys=grouped[module].map((p:R)=>p.key);
        const checkedCount=moduleKeys.filter((k:string)=>keys.includes(k)).length;
        return <div className="permission-matrix-row" key={module}>
          <div className="permission-module"><strong>{pretty(module)}</strong><small>{checkedCount}/{moduleKeys.length} enabled</small></div>
          <div className="permission-actions">
            {ACTIONS.map(action=>{
              const exists=available.includes(action), key=module+'.'+action, checked=keys.includes(key);
              return <button type="button" key={action} className={'permission-check '+(checked?'checked':'')+(exists?'':' disabled')} disabled={readOnly||!exists} onClick={()=>onToggle?.(module,action)} aria-label={module+' '+action} title={exists?actionLabel(action):'Not available'}>
                <span>{checked?'✓':''}</span>
              </button>
            })}
            {!readOnly&&<button type="button" className="module-all" onClick={()=>onToggleAll?.(module)}>{checkedCount===moduleKeys.length?'Clear':'All'}</button>}
          </div>
        </div>
      })}
    </div>
    {!readOnly&&<div className="permission-matrix-note"><button type="button" className="check-all-link" onClick={()=>onToggleAll?.('__ALL__')}>{allSelected?'Clear all permissions':'Select all permissions'}</button><span>Permissions are enforced by the API, not only the UI.</span></div>}
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
