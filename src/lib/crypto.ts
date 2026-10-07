// PBKDF2-SHA256 via WebCrypto (Workers cap iterations at 100k).
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function derive(pw: string, salt: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, k, 256));
}
export async function hashPw(pw: string) { const s = crypto.randomUUID(); return `${s}$${await derive(pw, s)}`; }
export async function verifyPw(pw: string, stored: string) { const [s, h] = stored.split('$'); return (await derive(pw, s)) === h; }
