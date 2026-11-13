// API độc lập: không nhận tên task, deadline, tên thư mục, email hay IP trong payload.
export const ACTIONS = ['visit', 'heartbeat', 'task_created', 'task_updated', 'task_deleted', 'task_completed', 'task_reopened', 'task_auto_deleted', 'folder_created', 'folder_deleted'];
const BROWSERS = ['CocCoc', 'Edge', 'Chrome', 'Firefox', 'Safari', 'Other'];
const SYSTEMS = ['Windows', 'Android', 'iOS', 'macOS', 'Linux', 'Other'];
const DEVICES = ['desktop', 'mobile', 'tablet'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const retention = 30 * 86400;
export function validEvent(data) {
  const keys = ['eventId', 'visitorId', 'sessionId', 'action', 'browser', 'os', 'device'];
  return data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).length === keys.length && keys.every(key => typeof data[key] === 'string')
    && [data.eventId, data.visitorId, data.sessionId].every(value => uuid.test(value))
    && ACTIONS.includes(data.action) && BROWSERS.includes(data.browser)
    && SYSTEMS.includes(data.os) && DEVICES.includes(data.device);
}
async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const toBase64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function fromBase64(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}
export async function makeToken(secret, now = Date.now()) {
  const payload = toBase64(encoder.encode(JSON.stringify({ exp: Math.floor(now / 1000) + 1800, nonce: crypto.randomUUID() })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload));
  return payload + '.' + toBase64(signature);
}
export async function validToken(token, secret, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 512) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const verified = await crypto.subtle.verify('HMAC', await signingKey(secret), fromBase64(parts[1]), encoder.encode(parts[0]));
    if (!verified) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64(parts[0])));
    const seconds = Math.floor(now / 1000);
    return Number.isInteger(payload.exp) && payload.exp > seconds && payload.exp <= seconds + 1800;
  } catch { return false; }
}
async function equalPassword(candidate, expected) {
  const [a, b] = await Promise.all([candidate, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  let difference = 0;
  const first = new Uint8Array(a), second = new Uint8Array(b);
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}
async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Error('Invalid body');
  const reader = request.body?.getReader();
  if (!reader) throw Error('Missing body');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); throw Error('Body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function limited(request, env, kind, max, windowSeconds, now) {
  // IP chỉ được dùng tạo khóa HMAC chống spam; không lưu IP gốc.
  const address = request.headers.get('CF-Connecting-IP') || 'local';
  const bucket = Math.floor(now / windowSeconds);
  const hash = await crypto.subtle.sign('HMAC', await signingKey(env.AUTH_SECRET), encoder.encode(`${kind}:${address}:${bucket}`));
  const key = toBase64(hash);
  const row = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?1,1,?2) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count')
    .bind(key, (bucket + 1) * windowSeconds).first();
  return row.count > max;
}
function configured(env) {
  return env.DB && env.ADMIN_PASSWORD?.length >= 16 && env.AUTH_SECRET?.length >= 32
    && /^https:\/\//.test(env.ALLOWED_ORIGIN || '');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', 'Referrer-Policy': 'no-referrer' };
    if (origin === env.ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && origin !== env.ALLOWED_ORIGIN) return reply({ error: 'Origin không được phép.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    if (!configured(env)) return reply({ error: 'Backend chưa được cấu hình đầy đủ.' }, 503);
    const path = new URL(request.url).pathname;
    const now = Math.floor(Date.now() / 1000);
    try {
      if (path === '/health' && request.method === 'GET') return reply({ ready: true });
      if (path === '/events' && request.method === 'POST') {
        if (origin !== env.ALLOWED_ORIGIN) return reply({ error: 'Origin không hợp lệ.' }, 403);
        if (await limited(request, env, 'events', 120, 300, now)) return reply({ error: 'Quá nhiều yêu cầu.' }, 429);
        let data;
        try { data = await readBody(request); } catch { return reply({ error: 'Payload không hợp lệ.' }, 400); }
        if (!validEvent(data)) return reply({ error: 'Chỉ được gửi dữ liệu thao tác đã cho phép.' }, 400);
        await env.DB.prepare('INSERT OR IGNORE INTO events(id,visitor_id,session_id,action,browser,os,device,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)')
          .bind(data.eventId, data.visitorId, data.sessionId, data.action, data.browser, data.os, data.device, now).run();
        return reply({ accepted: true }, 202);
      }
      if (path === '/admin/login' && request.method === 'POST') {
        if (await limited(request, env, 'login', 5, 900, now)) return reply({ error: 'Thử lại sau 15 phút.' }, 429);
        let data;
        try { data = await readBody(request); } catch { return reply({ error: 'Dữ liệu đăng nhập không hợp lệ.' }, 400); }
        if (!data || typeof data.password !== 'string' || data.password.length > 256 || !await equalPassword(data.password, env.ADMIN_PASSWORD))
          return reply({ error: 'Mật khẩu không đúng.' }, 401);
        return reply({ token: await makeToken(env.AUTH_SECRET), expiresIn: 1800 });
      }
      if (path === '/admin/sessions' || path === '/admin/events') {
        if (request.method !== 'GET') return reply({ error: 'Method không hợp lệ.' }, 405);
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
        if (!await validToken(token, env.AUTH_SECRET)) return reply({ error: 'Hãy đăng nhập lại.' }, 401);
        if (path === '/admin/sessions') {
          const rows = await env.DB.prepare('SELECT session_id,visitor_id,browser,os,device,MIN(created_at) first_seen,MAX(created_at) last_seen,COUNT(*) event_count FROM events WHERE created_at>=?1 GROUP BY session_id,visitor_id,browser,os,device ORDER BY last_seen DESC LIMIT 100')
            .bind(now - retention).all();
          return reply({ sessions: rows.results });
        }
        const url = new URL(request.url);
        const session = url.searchParams.get('session');
        if (session && !uuid.test(session)) return reply({ error: 'Mã phiên không hợp lệ.' }, 400);
        const cursor = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 10000) return reply({ error: 'Trang không hợp lệ.' }, 400);
        const rows = await env.DB.prepare('SELECT id,session_id,visitor_id,action,browser,os,device,created_at FROM events WHERE created_at>=?1 AND (?2 IS NULL OR session_id=?2) ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ?3')
          .bind(now - retention, session || null, cursor).all();
        return reply({ events: rows.results.slice(0, 100), hasMore: rows.results.length > 100 });
      }
      return reply({ error: 'Không tìm thấy.' }, 404);
    } catch { return reply({ error: 'Không xử lý được yêu cầu. Hãy thử lại.' }, 500); }
  },
  async scheduled(event, env) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM events WHERE created_at<?1').bind(now - retention),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?1').bind(now)
    ]);
  }
};
