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
  const expired = await makeToken(env.AUTH_SECRET, Date.now() - (10 * 86400 + 1) * 1000);
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
test('Client sends nothing without configuration or with Do Not Track', async () => {
  for (const options of [{ apiUrl: '', consent: 'yes' }, { consent: 'yes', dnt: '1' }]) {
    const app = client(options);
    await app.window.todoActivity.track('task_created');
    assert.equal(app.sent.length, 0);
    assert.equal(app.storage.has('focus-activity-visitor-v1'), false);
  }
});
test('Client automatically records allowed actions without a settings toggle and shows disclosure', async () => {
  const app = client({consent:'no'});
  assert.equal(app.sent[0].body.action, 'visit');
  await app.window.todoActivity.track('task_completed');
  assert.deepEqual(Object.keys(app.sent[1].body).sort(), ['action', 'browser', 'device', 'eventId', 'os', 'sessionId', 'visitorId'].sort());
  await app.window.todoActivity.track('secret task text');
  assert.equal(app.sent.length, 2);
  assert.equal(app.elements['activity-consent'].listeners.change, undefined);
  assert.equal(app.elements['activity-notice'].hidden, false);
});
test('Unavailable analytics server does not fail task interaction', async () => {
  const app = client({ consent: 'yes', fail: true });
  await assert.doesNotReject(app.window.todoActivity.track('task_created'));
});

function adminClient(configured = true, sessions = [], visitorId = '', storage = new Map()) {
  const elements = {};
  const windowEvents = {};
  class Element {
    constructor() { this.listeners = {}; this.children = []; this.value = ''; }
    setAttribute(name, value) { this[name] = value; }
    focus() {}
    addEventListener(type, fn) { this.listeners[type] = fn; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
  }
  for (const match of fs.readFileSync('admin.html','utf8').matchAll(/id="([^"]+)"/g)) elements[match[1]] = new Element();
  const requests = [];
  const context = {
    window: { TODO_ANALYTICS: { apiUrl: configured ? 'https://activity.example' : '' }, addEventListener: (name, fn) => { windowEvents[name] = fn; } }, URL, Date,
    localStorage: { getItem: key => key === 'focus-activity-visitor-v1' ? visitorId : storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) },
    document: { getElementById: id => elements[id], createElement: () => new Element(), visibilityState: 'visible' },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      const data = url.endsWith('/admin/login') ? { token: 'test-token', expiresIn: 10 * 86400 }
        : url.endsWith('/admin/sessions') ? { sessions } : { events: [], hasMore: false };
      return { ok: true, status: 200, json: async () => data };
    }
  };
  vm.runInNewContext(fs.readFileSync('admin.js','utf8'), context);
  return { elements, requests, storage, windowEvents };
}
test('Admin disabled without backend; login persists token and logout clears it and hides history', async () => {
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

test('Admin session restores across navigation without extending expiry; expired or invalid storage is cleared', async () => {
  const app = adminClient();
  app.elements['admin-password'].value = 'never-store-this';
  await app.elements['admin-login-form'].listeners.submit({ preventDefault() {} });
  const key = 'focus-admin-session-v1';
  const saved = app.storage.get(key);
  assert.ok(saved.includes('test-token'));
  assert.ok(!saved.includes('never-store-this'));
  const restored = adminClient(true, [], '', app.storage);
  await new Promise(setImmediate);
  assert.equal(restored.elements['admin-dashboard'].hidden, false);
  assert.equal(restored.requests[0].url, 'https://activity.example/admin/sessions');
  assert.equal(app.storage.get(key), saved);
  restored.elements['admin-logout'].listeners.click();
  assert.equal(app.storage.has(key), false);
  assert.ok(restored.requests.some(r => r.url.endsWith('/admin/logout')));
  for (const value of ['{broken', JSON.stringify({token:'t',endpoint:'https://activity.example',expiresAt:Date.now()-1}), JSON.stringify({token:'t',endpoint:'https://other.example',expiresAt:Date.now()+1000})]) {
    const storage = new Map([[key,value]]);
    const invalid = adminClient(true, [], '', storage);
    assert.equal(invalid.requests.length, 0);
    assert.equal(storage.has(key), false);
  }
  app.windowEvents.storage({key, newValue:null});
  assert.equal(app.elements['admin-dashboard'].hidden, true);
});

test('Server grants exactly ten days and logout revokes only that session', async () => {
  const {default:worker,makeToken,validToken} = await workerModule;
  const env=environment();
  const response=await worker.fetch(request('/admin/login',{method:'POST',data:{password:env.ADMIN_PASSWORD}}),env);
  const data=await response.json();
  assert.equal(data.expiresIn,864000);
  assert.ok(Math.abs(data.expiresAt-Date.now()-864000000)<2000);
  const older=await makeToken(env.AUTH_SECRET,Date.now()-9*86400000);
  assert.equal(await validToken(older,env.AUTH_SECRET),true);
  assert.equal((await worker.fetch(request('/admin/logout',{method:'POST',token:data.token}),env)).status,200);
  assert.equal((await worker.fetch(request('/admin/sessions',{token:data.token}),env)).status,401);
  assert.equal((await worker.fetch(request('/admin/sessions',{token:older}),env)).status,200);
});

test('Admin names only this browser visitor admin, leaving other devices unchanged', async () => {
  const ownId = crypto.randomUUID();
  const sessions = [ownId, crypto.randomUUID()].map(visitor_id => ({ visitor_id, session_id: crypto.randomUUID(), device: 'desktop', browser: 'CocCoc', os: 'Windows', last_seen: Math.floor(Date.now()/1000) }));
  const app = adminClient(true, sessions, ownId);
  app.elements['admin-password'].value = 'test-only';
  await app.elements['admin-login-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.elements['sessions-body'].children[0].children[1].textContent, 'admin · desktop');
  assert.equal(app.elements['sessions-body'].children[1].children[1].textContent, 'desktop');
  assert.equal(app.elements['session-filter'], undefined);
});

test('Device number is shared across sessions from the same visitor and filters all its history', async () => {
  const { default: worker, makeToken } = await workerModule;
  const env = environment();
  const visitor = crypto.randomUUID();
  for (const action of ['visit', 'task_completed']) await worker.fetch(request('/events', { method: 'POST', data: event(action, { visitorId: visitor }) }), env);
  await worker.fetch(request('/events', { method: 'POST', data: event() }), env);
  const token = await makeToken(env.AUTH_SECRET);
  const sessions = (await (await worker.fetch(request('/admin/sessions', { token }), env)).json()).sessions;
  const same = sessions.filter(session => session.visitor_id === visitor);
  assert.equal(same.length, 1);
  assert.ok(Number.isSafeInteger(same[0].device_no));
  assert.equal(same[0].event_count, 2);
  assert.notEqual(same[0].device_no, sessions.find(session => session.visitor_id !== visitor).device_no);
  const history = await (await worker.fetch(request('/admin/events?device=' + same[0].device_no, { token }), env)).json();
  assert.equal(history.events.length, 2);
  assert.ok(history.events.every(item => item.visitor_id === visitor && item.device_no === same[0].device_no));
  assert.equal((await worker.fetch(request('/admin/events?device=-1', { token }), env)).status, 400);
});
test('Returning device keeps one row and identity while last seen advances and history stays complete', async () => {
  const {default:worker,makeToken}=await workerModule;
  const env=environment();
  const first=event('visit');
  await worker.fetch(request('/events',{method:'POST',data:first}),env);
  env.sqlite.prepare('UPDATE events SET created_at=created_at-600 WHERE id=?').run(first.eventId);
  const token=await makeToken(env.AUTH_SECRET);
  const before=(await (await worker.fetch(request('/admin/sessions',{token}),env)).json()).sessions[0];
  await worker.fetch(request('/events',{method:'POST',data:event('visit',{visitorId:first.visitorId,browser:'Firefox'})}),env);
  const rows=(await (await worker.fetch(request('/admin/sessions',{token}),env)).json()).sessions;
  assert.equal(rows.length,1);
  assert.equal(rows[0].device_no,before.device_no);
  assert.equal(rows[0].browser,before.browser);
  assert.equal(rows[0].first_seen,before.first_seen);
  assert.ok(rows[0].last_seen>=before.last_seen+600);
  assert.equal(rows[0].event_count,2);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) total FROM events').get().total,2);
});

test('Only admin can send validated alerts; delivery is isolated to the target device', async () => {
  const {default:worker,makeToken}=await workerModule;
  const env=environment();
  const device=event();
  await worker.fetch(request('/events',{method:'POST',data:device}),env);
  const number=env.sqlite.prepare('SELECT device_no FROM devices WHERE visitor_id=?').get(device.visitorId).device_no;
  const data={deviceNo:number,message:'<img src=x onerror=alert(1)> Test'};
  assert.equal((await worker.fetch(request('/admin/alerts',{method:'POST',data}),env)).status,401);
  const token=await makeToken(env.AUTH_SECRET);
  assert.equal((await worker.fetch(request('/admin/alerts',{method:'POST',data:{...data,message:' '},token}),env)).status,400);
  assert.equal((await worker.fetch(request('/admin/alerts',{method:'POST',data:{...data,message:'x'.repeat(501)},token}),env)).status,400);
  assert.equal((await worker.fetch(request('/admin/alerts',{method:'POST',data:{...data,deviceNo:999},token}),env)).status,404);
  assert.equal((await worker.fetch(request('/admin/alerts',{method:'POST',data,token}),env)).status,202);
  const read=async visitorId=>(await (await worker.fetch(request('/device/alerts',{method:'POST',data:{visitorId}}),env)).json());
  assert.equal((await read(device.visitorId)).alerts[0].message,data.message);
  assert.equal((await read(crypto.randomUUID())).alerts.length,0);
  assert.equal((await worker.fetch(request('/device/alerts',{method:'POST',data:{visitorId:'bad'}}),env)).status,400);
  env.sqlite.exec('UPDATE device_alerts SET created_at=0');
  assert.equal((await read(device.visitorId)).alerts.length,0);
  await worker.scheduled({},env);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) total FROM device_alerts').get().total,0);
});

test('Admin warning button opens note input and posts to the selected device', async () => {
  const app=adminClient(true,[{visitor_id:crypto.randomUUID(),device_no:7,device:'desktop',browser:'Other',os:'Other',last_seen:1}]);
  await app.elements['admin-login-form'].listeners.submit({preventDefault(){}});
  app.elements['sessions-body'].children[0].children[0].children[1].listeners.click();
  assert.equal(app.elements['admin-alert-form'].hidden,false);
  app.elements['admin-alert-message'].value='Please check your task';
  await app.elements['admin-alert-form'].listeners.submit({preventDefault(){}});
  const sent=app.requests.find(r=>r.url.endsWith('/admin/alerts'));
  assert.deepEqual(JSON.parse(sent.options.body),{deviceNo:7,message:'Please check your task'});
  assert.equal(app.elements['admin-alert-form'].hidden,true);
});

test('Admin lists only the latest 100 sessions and actions without older pages', async () => {
  const {default:worker,makeToken}=await workerModule;
  const env=environment();
  const insert=env.sqlite.prepare('INSERT INTO events(id,visitor_id,session_id,action,browser,os,device,created_at) VALUES(?,?,?,?,?,?,?,?)');
  const now=Math.floor(Date.now()/1000);
  for(let i=0;i<105;i++) {
    const visitor=crypto.randomUUID();
    env.sqlite.prepare('INSERT INTO devices(visitor_id) VALUES(?)').run(visitor);
    insert.run(crypto.randomUUID(),visitor,crypto.randomUUID(),'visit','Other','Other','desktop',now-i);
  }
  const token=await makeToken(env.AUTH_SECRET);
  const sessions=await (await worker.fetch(request('/admin/sessions',{token}),env)).json();
  const history=await (await worker.fetch(request('/admin/events',{token}),env)).json();
  assert.equal(sessions.sessions.length,100);
  assert.equal(history.events.length,100);
  assert.equal(history.hasMore,false);
  assert.equal(history.events[99].created_at,now-99);
  assert.equal((await worker.fetch(request('/admin/events?offset=100',{token}),env)).status,400);
});

test('Existing events receive device numbers without losing history on idempotent schema update', async () => {
  const env = environment();
  const sample = event();
  env.sqlite.prepare('INSERT INTO events(id,visitor_id,session_id,action,browser,os,device,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(sample.eventId, sample.visitorId, sample.sessionId, 'visit', 'Other', 'Other', 'desktop', Math.floor(Date.now()/1000));
  env.sqlite.exec(fs.readFileSync('backend/schema.sql','utf8'));
  const number = env.sqlite.prepare('SELECT device_no FROM devices WHERE visitor_id=?').get(sample.visitorId).device_no;
  env.sqlite.exec(fs.readFileSync('backend/schema.sql','utf8'));
  assert.equal(env.sqlite.prepare('SELECT device_no FROM devices WHERE visitor_id=?').get(sample.visitorId).device_no, number);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) count FROM events').get().count, 1);
});
test('Admin nav shows one table at a time; clicking device code opens filtered history across sessions', async () => {
  const visitor = crypto.randomUUID();
  const rows = [1,2].map(() => ({ visitor_id: visitor, session_id: crypto.randomUUID(), device_no: 17, device:'desktop', browser:'CocCoc', os:'Windows', last_seen:Math.floor(Date.now()/1000) }));
  const app = adminClient(true, rows, visitor);
  app.elements['admin-password'].value = 'test-only';
  await app.elements['admin-login-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.elements['admin-sessions-panel'].hidden, false);
  assert.equal(app.elements['admin-events-panel'].hidden, true);
  assert.equal(app.elements['sessions-body'].children[0].children[0].children[0].textContent, 'TB-000017');
  assert.equal(app.elements['sessions-body'].children[1].children[0].children[0].textContent, 'TB-000017');
  app.elements['sessions-body'].children[0].children[0].children[0].listeners.click();
  assert.equal(app.elements['admin-sessions-panel'].hidden, true);
  assert.equal(app.elements['admin-events-panel'].hidden, false);
  assert.equal(app.elements['device-filter'].value, '17');
  assert.equal(app.elements['session-filter'], undefined);
  assert.ok(!app.requests.at(-1).url.includes('session='));
  assert.ok(app.requests.at(-1).url.includes('device=17'));
  app.elements['admin-events-tab'].listeners.keydown({ key:'Home', preventDefault() {} });
  assert.equal(app.elements['admin-sessions-panel'].hidden, false);
});
