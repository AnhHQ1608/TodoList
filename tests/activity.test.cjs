const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const workerModule = import('../backend/worker.mjs');
const origin = 'https://anhhq1608.github.io';

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync('backend/schema.sql', 'utf8'));
  function prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { sqlite.prepare(sql).run(...args); return { success: true }; }
    };
    return statement;
  }
  return { DB: { prepare, batch: statements => Promise.all(statements.map(item => item.run())) }, sqlite,
    ALLOWED_ORIGIN: origin, ADMIN_PASSWORD: 'test-only-password-at-least-sixteen', AUTH_SECRET: 'test-only-signing-key-at-least-thirty-two-characters' };
}
function request(path, { method = 'GET', data, token, source = origin } = {}) {
  return new Request('https://activity.example' + path, { method, headers: {
    Origin: source, ...(data ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {})
  }, ...(data ? { body: JSON.stringify(data) } : {}) });
}
function event(action = 'visit', extra = {}) {
  return { eventId: crypto.randomUUID(), visitorId: crypto.randomUUID(), sessionId: crypto.randomUUID(), action,
    browser: 'CocCoc', os: 'Windows', device: 'desktop', ...extra };
}
test('Backend rejects extra data and unknown actions, records only an allowlisted event', async () => {
  const { default: worker, validEvent } = await workerModule;
  const env = environment();
  assert.equal(validEvent(event('visit', { text: 'private task' })), false);
  assert.equal(validEvent(event('keystroke')), false);
  assert.equal((await worker.fetch(request('/events', { method: 'POST', data: event('visit', { title: 'secret' }) }), env)).status, 400);
  const record = event('task_created');
  assert.equal((await worker.fetch(request('/events', { method: 'POST', data: record }), env)).status, 202);
  await worker.fetch(request('/events', { method: 'POST', data: record }), env);
  const rows = env.sqlite.prepare('SELECT * FROM events').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'task_created');
  assert.equal('text' in rows[0], false);
  assert.equal('ip' in rows[0], false);
});
test('Admin history requires a valid login and cannot be read with forged/expired tokens', async () => {
  const { default: worker, makeToken, validToken } = await workerModule;
  const env = environment();
  assert.equal((await worker.fetch(request('/admin/events'), env)).status, 401);
  assert.equal((await worker.fetch(request('/admin/sessions', { token: 'forged' }), env)).status, 401);
  assert.equal((await worker.fetch(request('/admin/login', { method: 'POST', data: { password: 'wrong' } }), env)).status, 401);
  const response = await worker.fetch(request('/admin/login', { method: 'POST', data: { password: env.ADMIN_PASSWORD } }), env);
  const { token } = await response.json();
  assert.ok(token);
  assert.equal(await validToken(token, env.AUTH_SECRET), true);
  assert.equal(await validToken(token, 'a-different-secret'), false);
  const expired = await makeToken(env.AUTH_SECRET, Date.now() - 1900 * 1000);
  assert.equal(await validToken(expired, env.AUTH_SECRET), false);
  assert.equal((await worker.fetch(request('/admin/sessions', { token }), env)).status, 200);
});
test('CORS, login throttling, missing setup and request body validation fail closed', async () => {
  const { default: worker } = await workerModule;
  const env = environment();
  assert.equal((await worker.fetch(request('/health', { source: 'https://evil.example' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/health'), { ...env, AUTH_SECRET: '' })).status, 503);
  const preflight = await worker.fetch(request('/events', { method: 'OPTIONS' }), env);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  for (let i = 0; i < 5; i++) await worker.fetch(request('/admin/login', { method: 'POST', data: { password: 'wrong' } }), env);
  assert.equal((await worker.fetch(request('/admin/login', { method: 'POST', data: { password: env.ADMIN_PASSWORD } }), env)).status, 429);
  const tooLarge = event('visit', { extra: 'x'.repeat(3000) });
  assert.equal((await worker.fetch(request('/events', { method: 'POST', data: tooLarge }), env)).status, 400);
});
test('Admin sessions and event filter work; retention removes old records', async () => {
  const { default: worker, makeToken } = await workerModule;
  const env = environment();
  const a = event('visit'), b = event('task_completed', { visitorId: a.visitorId, sessionId: a.sessionId });
  await worker.fetch(request('/events', { method: 'POST', data: a }), env);
  await worker.fetch(request('/events', { method: 'POST', data: b }), env);
  const token = await makeToken(env.AUTH_SECRET);
  const sessions = await (await worker.fetch(request('/admin/sessions', { token }), env)).json();
  assert.equal(sessions.sessions.length, 1);
  assert.equal(sessions.sessions[0].event_count, 2);
  const events = await (await worker.fetch(request('/admin/events?session=' + a.sessionId, { token }), env)).json();
  assert.equal(events.events.length, 2);
  assert.equal((await worker.fetch(request('/admin/events?session=bad', { token }), env)).status, 400);
  env.sqlite.exec('UPDATE events SET created_at=0');
  await worker.scheduled({}, env);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) total FROM events').get().total, 0);
});

function client({ apiUrl = 'https://activity.example', consent, dnt, fail = false } = {}) {
  const storage = new Map();
  if (consent) storage.set('focus-activity-consent-v1', consent);
  const sent = [], elements = {};
  for (const id of ['activity-consent', 'activity-status', 'activity-notice'])
    elements[id] = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  const context = { window: { TODO_ANALYTICS: { apiUrl }, crypto, addEventListener() {} }, crypto, URL, AbortController,
    navigator: { userAgent: 'Windows Chrome coc_coc', doNotTrack: dnt }, document: { visibilityState: 'visible', getElementById: id => elements[id] },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    fetch: async (url, options) => { if (fail) throw Error('Offline'); sent.push({ url, body: JSON.parse(options.body) }); return {}; } };
  vm.runInNewContext(fs.readFileSync('activity.js', 'utf8'), context);
  return { ...context, sent, elements, storage };
}
test('Client sends nothing without configuration, after opt-out or with Do Not Track', async () => {
  for (const options of [{ apiUrl: '', consent: 'yes' }, { consent: 'no' }, { consent: 'yes', dnt: '1' }]) {
    const app = client(options);
    await app.window.todoActivity.track('task_created');
    assert.equal(app.sent.length, 0);
    assert.equal(app.storage.has('focus-activity-visitor-v1'), false);
  }
});
test('Client automatically creates visit, rejects arbitrary events and opt-out stops collection', async () => {
  const app = client();
  assert.equal(app.sent[0].body.action, 'visit');
  await app.window.todoActivity.track('task_completed');
  assert.deepEqual(Object.keys(app.sent[1].body).sort(), ['action', 'browser', 'device', 'eventId', 'os', 'sessionId', 'visitorId'].sort());
  await app.window.todoActivity.track('secret task text');
  assert.equal(app.sent.length, 2);
  app.elements['activity-consent'].listeners.change({ target: { checked: false } });
  await app.window.todoActivity.track('task_deleted');
  assert.equal(app.sent.length, 2);
  assert.equal(app.storage.has('focus-activity-visitor-v1'), false);
});
test('Unavailable analytics server does not fail task interaction', async () => {
  const app = client({ consent: 'yes', fail: true });
  await assert.doesNotReject(app.window.todoActivity.track('task_created'));
});

function adminClient(configured = true, sessions = [], visitorId = '') {
  const elements = {};
  class Element {
    constructor() { this.listeners = {}; this.children = []; this.value = ''; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
  }
  for (const match of fs.readFileSync('admin.html','utf8').matchAll(/id="([^"]+)"/g)) elements[match[1]] = new Element();
  const requests = [];
  const context = {
    window: { TODO_ANALYTICS: { apiUrl: configured ? 'https://activity.example' : '' } }, URL, Date,
    localStorage: { getItem: () => visitorId },
    document: { getElementById: id => elements[id], createElement: () => new Element(), visibilityState: 'visible' },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      const data = url.endsWith('/admin/login') ? { token: 'test-token', expiresIn: 1800 }
        : url.endsWith('/admin/sessions') ? { sessions } : { events: [], hasMore: false };
      return { ok: true, status: 200, json: async () => data };
    }
  };
  vm.runInNewContext(fs.readFileSync('admin.js','utf8'), context);
  return { elements, requests };
}
test('Admin disabled without backend; login keeps token in memory and logout hides all history', async () => {
  const disabled = adminClient(false);
  assert.equal(disabled.elements['admin-login-button'].disabled, true);
  assert.equal(disabled.requests.length, 0);
  const app = adminClient();
  app.elements['admin-password'].value = 'test-only-password';
  await app.elements['admin-login-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.elements['admin-password'].value, '');
  assert.equal(app.elements['admin-dashboard'].hidden, false);
  assert.equal(app.requests[1].options.headers.Authorization, 'Bearer test-token');
  app.elements['admin-logout'].listeners.click();
  assert.equal(app.elements['admin-dashboard'].hidden, true);
  assert.equal(app.elements['sessions-body'].children.length, 0);
  assert.equal(app.elements['events-body'].children.length, 0);
});

test('Admin names only this browser visitor admin, leaving other devices unchanged', async () => {
  const ownId = crypto.randomUUID();
  const sessions = [ownId, crypto.randomUUID()].map(visitor_id => ({ visitor_id, session_id: crypto.randomUUID(), device: 'desktop', browser: 'CocCoc', os: 'Windows', last_seen: Math.floor(Date.now()/1000) }));
  const app = adminClient(true, sessions, ownId);
  app.elements['admin-password'].value = 'test-only';
  await app.elements['admin-login-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.elements['sessions-body'].children[0].children[1].textContent, 'admin · desktop');
  assert.equal(app.elements['sessions-body'].children[1].children[1].textContent, 'desktop');
  assert.match(app.elements['session-filter'].children[1].textContent, /^admin/);
});
