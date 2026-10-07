/// <reference types="vite/client" />
const BASE = import.meta.env.VITE_API_URL ?? '';
export class ApiError extends Error { constructor(public status: number, msg: string, public body?: any) { super(msg); } }
// sessionStorage = per-tab session, so two tabs/browsers can sit in different companies at once.
export const session = { get: () => sessionStorage.getItem('erp_token'), set: (t: string) => sessionStorage.setItem('erp_token', t), clear: () => sessionStorage.removeItem('erp_token') };

export async function api<T = any>(path: string, o: { method?: string; body?: any } = {}): Promise<T> {
  const t = session.get();
  let r: Response;
  try {
    r = await fetch(`${BASE}/api${path}`, { method: o.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  } catch { throw new ApiError(0, 'Network error - is the API running?'); }
  const j: any = await r.json().catch(() => ({}));
  if (r.ok) return j;
  if (r.status === 401 && path !== '/auth/login') { session.clear(); window.dispatchEvent(new Event('unauth')); }
  const msg = r.status === 422 ? 'Validation: ' + (j.issues ?? [{ path: [], message: j.error }]).map((i: any) => `${i.path.join('.')} ${i.message}`).join('; ')
    : r.status === 403 ? 'Forbidden: ' + j.error : r.status === 404 ? 'Not found'
    : r.status === 409 ? j.error + (j.shortages ? ': ' + j.shortages.map((s: any) => `${s.name} need ${s.required}, have ${s.available}`).join('; ') : '')
    : r.status >= 500 ? 'Server error' : j.error ?? 'Error';
  throw new ApiError(r.status, msg, j);
}
