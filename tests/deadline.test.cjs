// Chạy: node --test tests/deadline.test.cjs (không cần cài thư viện).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('script.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const HOUR = 3600000;
const NOW = Date.parse('2026-11-14T10:00:00Z');
const iso = offset => new Date(NOW + offset).toISOString();
function boot(initial = [], options = {}) {
  const storage = options.storage || { value: JSON.stringify(initial) };
  const elements = {};
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.value = ''; this.classList = { toggle() {} }; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute(key, value) { this[key] = value; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    focus() {}
    reset() { elements['task-input'].value = ''; elements['deadline-input'].value = ''; }
    querySelector(key) { return this.parts[key]; }
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements[match[1]] = new Element();
  elements['empty-state'].parts = { h3: new Element(), p: new Element() };
  const filters = ['all', 'active', 'completed'].map(filter => { const e = new Element(); e.dataset.filter = filter; return e; });
  const allNodes = () => { const result = []; const visit = e => { result.push(e); e.children.forEach(visit); }; Object.values(elements).forEach(visit); return result; };
  const sent = [];
  let requested = 0;
  class Notification {
    static permission = options.permission || 'granted';
    static async requestPermission() { requested++; return this.permission; }
    constructor(title, data) { if (options.notificationFails) throw Error('Unsupported'); sent.push({ title, ...data }); }
  }
  class Clock extends Date { static now() { return NOW; } }
  const window = { Notification, isSecureContext: true, addEventListener() {} };
  if (options.unsupported) delete window.Notification;
  const context = vm.createContext({ Date: Clock, window, Notification, navigator: {}, console,
    document: { getElementById: id => elements[id] || allNodes().find(e => e.id === id),
      querySelectorAll: () => filters, querySelector: () => filters[0], createElement: () => new Element(), addEventListener() {} },
    localStorage: { getItem: () => storage.value, setItem: (key, value) => { if (options.blocked) throw Error('Storage blocked'); storage.value = value; } },
    setInterval: () => {} });
  vm.runInContext(code, context);
  return { elements, filters, storage, sent, requested: () => requested,
    run: expression => vm.runInContext(expression, context),
    submit(text, deadline = '') { elements['task-input'].value = text; elements['deadline-input'].value = deadline; elements['task-form'].listeners.submit({ preventDefault() {} }); } };
}
const task = (extra = {}) => ({ id: '1', text: 'Học JS', completed: false, ...extra });
test('Deadline: 24h boundary, yellow, overdue and completed', () => {
  const app = boot();
  for (const [offset, expected] of [[25*HOUR, ''], [24*HOUR, ''], [24*HOUR-1, 'warning'], [HOUR, 'warning'], [0, 'overdue'], [-1, 'overdue']]) {
    assert.equal(app.run(`deadlineInfo(${JSON.stringify(task({ deadline: iso(offset) }))}, ${NOW}).className`), expected);
  }
  assert.equal(app.run(`deadlineInfo(${JSON.stringify(task({ completed: true, deadline: iso(-HOUR) }))}).className`), '');
  assert.match(app.run(`deadlineInfo(${JSON.stringify(task({ deadline: iso(HOUR/2) }))}).text`), /30 phút/);
});
test('Migrate old tasks; add, edit, cancel, remove deadline, delete and filters', () => {
  const app = boot([task()], { permission: 'default' });
  assert.equal(app.run('tasks[0].deadline'), null);
  app.submit('   '); assert.equal(app.run('tasks.length'), 1);
  app.submit('<img src=x>', '2026-11-16T18:30');
  assert.equal(app.run('tasks.length'), 2);
  const item = app.elements['task-list'].children[1];
  assert.equal(item.children[1].children[0].textContent, '<img src=x>');
  item.children[2].children[0].listeners.click();
  assert.equal(app.elements['deadline-input'].value, '2026-11-16T18:30');
  app.submit('Đã sửa', '');
  assert.equal(app.run('tasks[1].deadline'), null);
  app.run('startEditing(tasks[0])');
  app.elements['cancel-edit'].listeners.click();
  assert.equal(app.run('editingId'), null);
  const checkbox = app.elements['task-list'].children[0].children[0];
  checkbox.checked = true; checkbox.listeners.change();
  assert.equal(app.elements.percentage.textContent, '50%');
  app.filters[1].listeners.click(); assert.equal(app.elements['task-list'].children.length, 1);
  app.filters[2].listeners.click(); assert.equal(app.elements['task-list'].children.length, 1);
  app.elements['task-list'].children[0].children[2].children[1].listeners.click();
  assert.equal(app.run('tasks.length'), 1);
  assert.equal(boot([], { storage: app.storage }).run('tasks[0].text'), 'Đã sửa');
});
test('Notify once in final hour; reload and second tab do not duplicate; changed deadline rearms', async () => {
  const app = boot([task({ deadline: iso(HOUR) })]);
  assert.equal(app.sent.length, 1);
  await app.run('checkDeadlines()'); assert.equal(app.sent.length, 1);
  assert.equal(boot([], { storage: app.storage }).sent.length, 0);
  app.run('startEditing(tasks[0])');
  const next = new Date(NOW + HOUR / 2);
  const pad = n => String(n).padStart(2, '0');
  const local = `${next.getFullYear()}-${pad(next.getMonth()+1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
  app.submit('Deadline mới', local);
  assert.equal(app.sent.length, 2);
  assert.equal(JSON.parse(app.storage.value)[0].notifiedDeadline, iso(HOUR/2));
});
test('No alerts for completed, overdue, no deadline, >1h, or denied permission', () => {
  for (const extra of [{ completed: true, deadline: iso(100) }, { deadline: iso(0) }, {}, { deadline: iso(HOUR+1) }]) assert.equal(boot([task(extra)]).sent.length, 0);
  assert.equal(boot([task({ deadline: iso(100) })], { permission: 'denied' }).sent.length, 0);
});
test('Permission requested only on click; unsupported and failing notifications handled', async () => {
  const app = boot([], { permission: 'default' });
  assert.equal(app.requested(), 0);
  await app.elements['enable-notifications'].listeners.click();
  assert.equal(app.requested(), 1);
  assert.equal(boot([], { unsupported: true }).elements['enable-notifications'].disabled, true);
  const failed = boot([task({ deadline: iso(100) })], { notificationFails: true });
  assert.match(failed.elements['notification-status'].textContent, /không gửi được/);
  assert.equal(failed.run('tasks[0].notifiedDeadline'), null);
});
test('Corrupt localStorage, invalid deadline and blocked writes do not crash', () => {
  const corrupt = boot([], { storage: { value: '{broken' } });
  assert.match(corrupt.elements.message.textContent, /Không thể đọc/);
  const app = boot([task({ deadline: 'bad' })], { blocked: true });
  assert.equal(app.run('tasks[0].deadline'), null);
  app.submit('Thêm');
  assert.match(app.elements.message.textContent, /Không thể lưu/);
  app.submit('Lỗi ngày', 'invalid');
  assert.equal(app.run('tasks.length'), 2);
});
