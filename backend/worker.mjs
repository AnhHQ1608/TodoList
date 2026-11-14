import { accountRoute, currentUser } from './accounts.mjs';
// Lịch sử chỉ nhận loại thao tác; API tài khoản riêng lưu dữ liệu TodoList.
export const ACTIONS = ['visit', 'heartbeat', 'task_created', 'task_updated', 'task_deleted', 'task_completed', 'task_reopened', 'task_auto_deleted', 'folder_created', 'folder_deleted'];
const BROWSERS = ['CocCoc', 'Edge', 'Chrome', 'Firefox', 'Safari', 'Other'];
const SYSTEMS = ['Windows', 'Android', 'iOS', 'macOS', 'Linux', 'Other'];
const DEVICES = ['desktop', 'mobile', 'tablet'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const retention = 30 * 86400;
export const SESSION_SECONDS = 10 * 24 * 60 * 60;
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
  const payload = toBase64(encoder.encode(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() })));
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
    return Number.isInteger(payload.exp) && payload.exp > seconds && payload.exp <= seconds + SESSION_SECONDS;
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
      const accountResponse = await accountRoute(request, env, path, now, reply, limited);
      if (accountResponse) return accountResponse;
      if (path === '/health' && request.method === 'GET') return reply({ ready: true });
      if (path === '/device/alerts' && request.method === 'POST') {
        if (origin !== env.ALLOWED_ORIGIN) return reply({ error: 'Origin không hợp lệ.' }, 403);
        if (await limited(request, env, 'alerts-read', 100, 300, now)) return reply({ error: 'Thử lại sau.' }, 429);
        let data;
        try { data = await readBody(request); } catch { return reply({ error: 'Dữ liệu không hợp lệ.' }, 400); }
        if (!uuid.test(data?.visitorId || '')) return reply({ error: 'Thiết bị không hợp lệ.' }, 400);
        if (env.REQUIRE_ACCOUNT !== 'false') {
          const user = await currentUser(request, env, now);
          if (!user) return reply({error:'Vui lòng đăng nhập.'},401);
          const device = await env.DB.prepare('SELECT user_id FROM account_devices WHERE visitor_id=?1').bind(data.visitorId).first();
          if (!device || device.user_id !== user.id) return reply({error:'Thiết bị không thuộc tài khoản này.'},403);
        }
        const rows = await env.DB.prepare('SELECT id,message,created_at FROM device_alerts WHERE visitor_id=?1 AND created_at>=?2 ORDER BY created_at DESC,id DESC LIMIT 20').bind(data.visitorId, now - 7 * 86400).all();
        return reply({ alerts: rows.results });
      }
      if (path === '/events' && request.method === 'POST') {
        if (origin !== env.ALLOWED_ORIGIN) return reply({ error: 'Origin không hợp lệ.' }, 403);
        if (await limited(request, env, 'events', 120, 300, now)) return reply({ error: 'Quá nhiều yêu cầu.' }, 429);
        let data;
        try { data = await readBody(request); } catch { return reply({ error: 'Payload không hợp lệ.' }, 400); }
        if (!validEvent(data)) return reply({ error: 'Chỉ được gửi dữ liệu thao tác đã cho phép.' }, 400);
        const user = await currentUser(request, env, now);
        if (env.REQUIRE_ACCOUNT !== 'false' && !user) return reply({error:'Vui lòng đăng nhập.'},401);
        if(user){
          const owner=await env.DB.prepare('SELECT user_id FROM account_devices WHERE visitor_id=?1').bind(data.visitorId).first();
          if(owner && owner.user_id!==user.id)return reply({error:'Mã thiết bị thuộc tài khoản khác.'},403);
        }
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO devices(visitor_id) VALUES(?1)').bind(data.visitorId),
          env.DB.prepare('INSERT OR IGNORE INTO events(id,visitor_id,session_id,action,browser,os,device,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)')
            .bind(data.eventId, data.visitorId, data.sessionId, data.action, data.browser, data.os, data.device, now)
        ]);
        if (user) await env.DB.batch([
          env.DB.prepare('INSERT INTO account_devices(visitor_id,user_id,last_seen) VALUES(?1,?2,?3) ON CONFLICT(visitor_id) DO UPDATE SET user_id=excluded.user_id,last_seen=excluded.last_seen').bind(data.visitorId,user.id,now),
          env.DB.prepare('INSERT OR IGNORE INTO event_accounts(event_id,user_id) VALUES(?1,?2)').bind(data.eventId,user.id)
        ]);
        return reply({ accepted: true }, 202);
      }
      if (path === '/admin/login' && request.method === 'POST') {
        if (await limited(request, env, 'login', 5, 900, now)) return reply({ error: 'Thử lại sau 15 phút.' }, 429);
        let data;
        try { data = await readBody(request); } catch { return reply({ error: 'Dữ liệu đăng nhập không hợp lệ.' }, 400); }
        if (!data || typeof data.password !== 'string' || data.password.length > 256 || !await equalPassword(data.password, env.ADMIN_PASSWORD))
          return reply({ error: 'Mật khẩu không đúng.' }, 401);
        return reply({ token: await makeToken(env.AUTH_SECRET), expiresIn: SESSION_SECONDS, expiresAt: (now + SESSION_SECONDS) * 1000 });
      }
      if (['/admin/sessions', '/admin/events', '/admin/logout', '/admin/alerts', '/admin/users'].includes(path)) {
        if (request.method !== (['/admin/logout', '/admin/alerts'].includes(path) ? 'POST' : 'GET')) return reply({ error: 'Method không hợp lệ.' }, 405);
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
        if (!await validToken(token, env.AUTH_SECRET)) return reply({ error: 'Hãy đăng nhập lại.' }, 401);
        const hash = toBase64(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
        const revokeKey = 'revoked:' + hash;
        const revoked = await env.DB.prepare('SELECT expires_at FROM rate_limits WHERE key=?1').bind(revokeKey).first();
        if (revoked && revoked.expires_at > now) return reply({ error: 'Phiên đã đăng xuất. Hãy đăng nhập lại.' }, 401);
        if(path === '/admin/users'){
          const rows=await env.DB.prepare('SELECT u.id,u.username,u.created_at,COUNT(a.visitor_id) device_count,MAX(a.last_seen) last_seen FROM users u LEFT JOIN account_devices a ON a.user_id=u.id GROUP BY u.id,u.username,u.created_at ORDER BY u.created_at DESC,u.id DESC LIMIT 100').all();
          return reply({users:rows.results});
        }
        if (path === '/admin/alerts') {
          let data;
          try { data = await readBody(request); } catch { return reply({ error: 'Dữ liệu không hợp lệ.' }, 400); }
          if (!Number.isSafeInteger(data?.deviceNo) || data.deviceNo <= 0 || typeof data.message !== 'string' || !data.message.trim() || data.message.trim().length > 500) return reply({ error: 'Nhập ghi chú từ 1 đến 500 ký tự.' }, 400);
          const device = await env.DB.prepare('SELECT visitor_id FROM devices WHERE device_no=?1').bind(data.deviceNo).first();
          if (!device) return reply({ error: 'Thiết bị không còn tồn tại.' }, 404);
          if(env.REQUIRE_ACCOUNT !== 'false'){
            const account=await env.DB.prepare('SELECT user_id FROM account_devices WHERE visitor_id=?1').bind(device.visitor_id).first();
            if(!account)return reply({error:'Thiết bị cũ cần đăng nhập TodoList trước khi nhận cảnh báo.'},409);
          }
          if (await limited(request, env, 'alerts-send', 20, 300, now)) return reply({ error: 'Gửi quá nhiều cảnh báo. Thử lại sau.' }, 429);
          await env.DB.prepare('INSERT INTO device_alerts(id,visitor_id,message,created_at) VALUES(?1,?2,?3,?4)').bind(crypto.randomUUID(), device.visitor_id, data.message.trim(), now).run();
          return reply({ queued: true }, 202);
        }
        if (path === '/admin/logout') {
          const payload = JSON.parse(new TextDecoder().decode(fromBase64(token.split('.')[0])));
          await env.DB.prepare('INSERT OR REPLACE INTO rate_limits(key,count,expires_at) VALUES(?1,1,?2)').bind(revokeKey, payload.exp).run();
          return reply({ loggedOut: true });
        }
        if (path === '/admin/sessions') {
          // Mỗi trình duyệt chỉ có một dòng; phiên truy cập mới cập nhật last_seen.
          const rows = await env.DB.prepare('WITH ranked AS (SELECT e.visitor_id,d.device_no,e.browser,e.os,e.device,MIN(e.created_at) OVER (PARTITION BY e.visitor_id) first_seen,MAX(e.created_at) OVER (PARTITION BY e.visitor_id) last_seen,COUNT(*) OVER (PARTITION BY e.visitor_id) event_count,ROW_NUMBER() OVER (PARTITION BY e.visitor_id ORDER BY e.created_at,e.id) position FROM events e JOIN devices d ON d.visitor_id=e.visitor_id WHERE e.created_at>=?1) SELECT visitor_id,device_no,browser,os,device,first_seen,last_seen,event_count FROM ranked WHERE position=1 ORDER BY last_seen DESC,device_no DESC LIMIT 100')
            .bind(now - retention).all();
          const accounts = await env.DB.prepare('SELECT a.visitor_id,u.username FROM account_devices a JOIN users u ON u.id=a.user_id WHERE a.visitor_id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(rows.results.map(row=>row.visitor_id))).all();
          const names = new Map(accounts.results.map(a => [a.visitor_id,a.username]));
          return reply({ sessions: rows.results.map(row => ({...row,username:names.get(row.visitor_id) || null})) });
        }
        const url = new URL(request.url);
        const session = url.searchParams.get('session');
        if (session && !uuid.test(session)) return reply({ error: 'Mã phiên không hợp lệ.' }, 400);
        const cursor = Number(url.searchParams.get('offset') || 0);
        const deviceParam = url.searchParams.get('device');
        const deviceNo = deviceParam === null ? null : Number(deviceParam);
        if (deviceParam !== null && (!/^\d+$/.test(deviceParam) || !Number.isSafeInteger(deviceNo) || deviceNo <= 0)) return reply({ error: 'Mã thiết bị không hợp lệ.' }, 400);
        if (!Number.isSafeInteger(cursor) || cursor !== 0) return reply({ error: 'Trang không hợp lệ.' }, 400);
        const rows = await env.DB.prepare('SELECT e.id,e.session_id,e.visitor_id,d.device_no,e.action,e.browser,e.os,e.device,e.created_at FROM events e JOIN devices d ON d.visitor_id=e.visitor_id WHERE e.created_at>=?1 AND (?2 IS NULL OR e.session_id=?2) AND (?4 IS NULL OR d.device_no=?4) ORDER BY e.created_at DESC,e.id DESC LIMIT 100 OFFSET ?3')
          .bind(now - retention, session || null, cursor, deviceNo).all();
        const accounts = await env.DB.prepare('SELECT a.event_id,u.username FROM event_accounts a JOIN users u ON u.id=a.user_id WHERE a.event_id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(rows.results.map(row=>row.id))).all();
        const names = new Map(accounts.results.map(a => [a.event_id,a.username]));
        return reply({ events: rows.results.slice(0, 100).map(row=>({...row,username:names.get(row.id) || null})), hasMore: false });
      }
      return reply({ error: 'Không tìm thấy.' }, 404);
    } catch { return reply({ error: 'Không xử lý được yêu cầu. Hãy thử lại.' }, 500); }
  },
  async scheduled(event, env) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM events WHERE created_at<?1').bind(now - retention),
      env.DB.prepare('DELETE FROM event_accounts WHERE NOT EXISTS(SELECT 1 FROM events WHERE events.id=event_accounts.event_id)'),
      env.DB.prepare('DELETE FROM user_sessions WHERE expires_at<=?1').bind(now),
      env.DB.prepare('DELETE FROM device_alerts WHERE created_at<?1').bind(now - 7 * 86400),
      env.DB.prepare('DELETE FROM devices WHERE NOT EXISTS(SELECT 1 FROM events WHERE events.visitor_id=devices.visitor_id)'),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?1').bind(now)
    ]);
  }
};
