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
    getAttribute(key) { return this[key]; }
    showModal() { this.open = true; }
    close() { this.open = false; }
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
  const audio = { created: 0, tones: 0 };
  class AudioContext {
    constructor() { audio.created++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { if (options.audioFails) throw Error('Audio blocked'); this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { audio.tones++; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  let requested = 0;
  class Notification {
    static permission = options.permission || 'granted';
    static async requestPermission() { requested++; return this.permission; }
    constructor(title, data) { if (options.notificationFails) throw Error('Unsupported'); sent.push({ title, ...data }); }
  }
  class Clock extends Date { static now() { return NOW; } }
  const window = { Notification, isSecureContext: true, addEventListener() {} };
  if (options.audio) window.AudioContext = AudioContext;
  if (options.unsupported) delete window.Notification;
  const context = vm.createContext({ Date: Clock, window, Notification, navigator: {}, console,
    document: { getElementById: id => elements[id] || allNodes().find(e => e.id === id),
      querySelectorAll: () => filters, querySelector: () => filters[0], createElement: () => new Element(), addEventListener() {} },
    localStorage: { getItem: key => key === 'focus-list-sound-v1' ? storage.sound : storage.value,
      setItem: (key, value) => { if (options.blocked) throw Error('Storage blocked'); if (key === 'focus-list-sound-v1') storage.sound = value; else storage.value = value; } },
    setInterval: () => {} });
  vm.runInContext(code, context);
  return { elements, filters, storage, sent, audio, requested: () => requested,
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
test('No alerts for completed, no deadline, >1h, or denied permission', () => {
  for (const extra of [{ completed: true, deadline: iso(100) }, {}, { deadline: iso(HOUR+1) }]) assert.equal(boot([task(extra)]).sent.length, 0);
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

test('Custom picker: leap year, month navigation, cancel, apply and clear', () => {
  const app = boot([], { permission: 'default' });
  app.elements['deadline-input'].value = '2028-02-29T23:45';
  app.elements['open-picker'].listeners.click();
  assert.equal(app.elements['date-picker'].open, true);
  assert.equal(app.elements['calendar-days'].children.length, 42);
  assert.equal(app.elements['picker-hour'].value, '23');
  assert.equal(app.elements['picker-minute'].value, '45');
  const chosen = app.elements['calendar-days'].children.filter(day => day['aria-pressed'] === 'true');
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].textContent, 29);
  app.elements['next-month'].listeners.click();
  assert.equal(app.elements['calendar-month'].textContent, 'Tháng 3, 2028');
  app.elements['previous-month'].listeners.click();
  assert.equal(app.elements['calendar-month'].textContent, 'Tháng 2, 2028');
  app.elements['calendar-days'].children.find(day => day.textContent === 15).listeners.click();
  app.elements['picker-hour'].value = '09';
  app.elements['picker-minute'].value = '05';
  app.elements['cancel-picker'].listeners.click();
  assert.equal(app.elements['deadline-input'].value, '2028-02-29T23:45');
  app.elements['open-picker'].listeners.click();
  app.elements['calendar-days'].children.find(day => day.textContent === 15).listeners.click();
  app.elements['picker-hour'].value = '09';
  app.elements['picker-minute'].value = '05';
  app.elements['apply-deadline'].listeners.click();
  assert.equal(app.elements['deadline-input'].value, '2028-02-15T09:05');
  assert.equal(app.elements['date-picker'].open, false);
  app.submit('Công việc có lịch', app.elements['deadline-input'].value);
  assert.equal(app.run('tasks[0].deadline'), new Date('2028-02-15T09:05').toISOString());
  app.run('startEditing(tasks[0])');
  assert.match(app.elements['deadline-display'].textContent, /2028/);
  app.elements['open-picker'].listeners.click();
  app.elements['clear-deadline'].listeners.click();
  assert.equal(app.elements['deadline-input'].value, '');
  assert.equal(app.elements['deadline-display'].textContent, 'Chọn ngày & giờ');
});
test('Custom picker navigates December to January and quick dates do not apply prematurely', () => {
  const app = boot();
  app.elements['deadline-input'].value = '2026-12-31T00:00';
  app.elements['open-picker'].listeners.click();
  app.elements['next-month'].listeners.click();
  assert.equal(app.elements['calendar-month'].textContent, 'Tháng 1, 2027');
  app.elements['pick-today'].listeners.click();
  assert.equal(app.elements['deadline-input'].value, '2026-12-31T00:00');
  app.elements['pick-tomorrow'].listeners.click();
  assert.equal(app.elements['calendar-days'].children.filter(day => day['aria-pressed'] === 'true').length, 1);
});

test('Overdue alerts are separate from reminders, persist once, and stop after completion', async () => {
  const app = boot([task({ deadline: iso(100), notifiedDeadline: iso(100) })]);
  assert.equal(app.sent.length, 0);
  app.run(`Date.now = () => ${NOW + 101}`);
  await app.run('checkDeadlines()');
  assert.equal(app.sent.length, 1);
  assert.match(app.sent[0].title, /quá hạn/);
  assert.equal(app.elements['overdue-alert'].hidden, false);
  assert.match(app.elements['overdue-summary'].textContent, /Học JS/);
  await app.run('checkDeadlines()');
  assert.equal(app.sent.length, 1);
  const reload = boot([], { storage: app.storage });
  reload.run(`Date.now = () => ${NOW + 101}`);
  await reload.run('checkDeadlines()');
  assert.equal(reload.sent.length, 0);
  const checkbox = app.elements['task-list'].children[0].children[0];
  checkbox.checked = true; checkbox.listeners.change();
  assert.equal(app.elements['overdue-alert'].hidden, true);
});
test('Overdue in-page warning works without system permission and uses safe text', () => {
  const app = boot([task({ deadline: iso(-1), text: '<script>alert(1)</script>' })], { permission: 'denied' });
  assert.equal(app.sent.length, 0);
  assert.equal(app.elements['overdue-alert'].hidden, false);
  assert.match(app.elements['overdue-summary'].textContent, /<script>/);
  assert.equal(boot([task({ completed: true, deadline: iso(-1) })]).elements['overdue-alert'].hidden, true);
});
test('Sound requires click, works without Notification, batches overdue and persists deduplication', async () => {
  const app = boot([task({ deadline: iso(-1) }), task({ id: '2', deadline: iso(-2) })], { audio: true, unsupported: true });
  assert.equal(app.audio.created, 0);
  assert.equal(app.audio.tones, 0);
  await app.elements['toggle-sound'].listeners.click();
  assert.equal(app.audio.created, 1);
  assert.equal(app.audio.tones, 3); // Một chuỗi âm cho cả nhóm công việc.
  assert.equal(app.storage.sound, 'true');
  await app.run('checkDeadlines()');
  assert.equal(app.audio.tones, 3);
  assert.equal(JSON.parse(app.storage.value)[0].overdueSoundedDeadline, iso(-1));
  app.elements['test-sound'].listeners.click();
  assert.equal(app.audio.tones, 6);
  await app.elements['toggle-sound'].listeners.click();
  assert.equal(app.storage.sound, 'false');
  assert.equal(app.run('playAlertSound(true)'), false);
  const reload = boot([], { storage: app.storage, audio: true });
  await reload.elements['toggle-sound'].listeners.click();
  assert.equal(reload.audio.tones, 0);
});
test('Reminder and overdue each play once; changing deadline resets both sound markers', async () => {
  const app = boot([task({ deadline: iso(100) })], { audio: true });
  await app.elements['toggle-sound'].listeners.click();
  assert.equal(app.audio.tones, 2);
  app.run(`Date.now = () => ${NOW + 101}`);
  await app.run('checkDeadlines()');
  assert.equal(app.audio.tones, 5);
  await app.run('checkDeadlines()'); assert.equal(app.audio.tones, 5);
  app.run('startEditing(tasks[0])');
  app.submit('Đổi deadline', '2026-11-20T10:00');
  assert.equal(app.run('tasks[0].overdueSoundedDeadline'), null);
  assert.equal(app.run('tasks[0].reminderSoundedDeadline'), null);
  assert.equal(app.run('tasks[0].overdueNotifiedDeadline'), null);
  assert.equal(app.elements['overdue-alert'].hidden, true);
});
test('Remembered audio preference needs activation after reload; audio failure is handled', async () => {
  const storage = { value: '[]', sound: 'true' };
  const app = boot([], { storage, audio: true });
  assert.equal(app.audio.created, 0);
  assert.match(app.elements['toggle-sound'].textContent, /Kích hoạt lại/);
  await app.elements['toggle-sound'].listeners.click();
  assert.equal(app.elements['toggle-sound']['aria-pressed'], 'true');
  const failed = boot([], { audio: true, audioFails: true });
  await failed.elements['toggle-sound'].listeners.click();
  assert.match(failed.elements['sound-status'].textContent, /Không bật được/);
  assert.equal(failed.run('soundEnabled'), false);
});

test('Click sounds cover dynamic controls, respect mute and do not create audio on load', async () => {
  const app = boot([], { audio: true });
  const control = { id: 'add-task', disabled: false, hidden: false, matches: () => false };
  const event = { target: { closest: () => control } };
  // Chưa bật âm thanh: click không tạo AudioContext.
  await app.run('handleInteractionSound') (event);
  assert.equal(app.audio.created, 0);
  await app.elements['toggle-sound'].listeners.click();
  for (const id of ['submit-task', 'task-input', 'filter-active', 'calendar-day', 'picker-hour', 'delete-task', 'checkbox']) {
    control.id = id;
    await app.run('handleInteractionSound')(event);
  }
  assert.equal(app.audio.tones, 7);
  control.disabled = true;
  await app.run('handleInteractionSound')(event);
  control.disabled = false;
  for (const id of ['toggle-sound', 'test-sound']) {
    control.id = id;
    await app.run('handleInteractionSound')(event);
  }
  await app.run('handleInteractionSound')({ target: { closest: () => null } });
  assert.equal(app.audio.tones, 7);
  await app.elements['toggle-sound'].listeners.click();
  control.id = 'submit-task';
  await app.run('handleInteractionSound')(event);
  assert.equal(app.audio.tones, 7);
});
test('Click restores saved sound preference after reload and handles blocked audio', async () => {
  const event = { target: { closest: () => ({ id: 'open-picker', matches: () => false }) } };
  const app = boot([], { audio: true, storage: { value: '[]', sound: 'true' } });
  assert.equal(app.audio.created, 0);
  await app.run('handleInteractionSound')(event);
  assert.equal(app.audio.tones, 1);
  const failed = boot([], { audio: true, audioFails: true, storage: { value: '[]', sound: 'true' } });
  await failed.run('handleInteractionSound')(event);
  assert.equal(failed.audio.tones, 0);
});
