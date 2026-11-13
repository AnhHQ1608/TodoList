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
  const documentListeners = {};
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
  const notifications = [];
  const workerSent = [];
  const registrations = [];
  const timers = [];
  let focusCount = 0;
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
    constructor(title, data) { if (options.notificationFails) throw Error('Unsupported'); sent.push({ title, ...data }); notifications.push(this); }
    close() { this.closed = true; }
  }
  class Clock extends Date { static now() { return NOW; } }
  const window = { Notification, isSecureContext: true, addEventListener() {}, focus() { focusCount++; } };
  if (options.audio) window.AudioContext = AudioContext;
  if (options.unsupported) delete window.Notification;
  const navigator = {};
  if (options.worker) {
    const registration = { active: {}, async showNotification(title, data) {
      if (options.workerFails) throw new Error('System notifications blocked');
      workerSent.push({ title, ...data });
    } };
    navigator.serviceWorker = { async register(url, config) {
      registrations.push({ url, config });
      if (options.registrationFails) throw new Error('Worker registration failed');
      return registration;
    }, ready: Promise.resolve(registration) };
  }
  const context = vm.createContext({ Date: Clock, window, Notification, navigator, console,
    document: { getElementById: id => elements[id] || allNodes().find(e => e.id === id),
      querySelectorAll: () => filters, querySelector: () => filters[0], createElement: () => new Element(),
      addEventListener: (type, listener) => { documentListeners[type] = listener; } },
    localStorage: { getItem: key => key === 'focus-list-sound-v1' ? storage.sound : key === 'focus-list-folders-v1' ? storage.folders : storage.value,
      setItem: (key, value) => { if (options.blocked) throw Error('Storage blocked'); if (key === 'focus-list-sound-v1') storage.sound = value; else if (key === 'focus-list-folders-v1') storage.folders = value; else storage.value = value; } },
    setInterval: () => {}, setTimeout: (callback, delay) => { timers.push({ callback, delay }); }, clearTimeout() {} });
  vm.runInContext(code, context);
  return { elements, filters, storage, sent, audio, documentListeners, notifications, timers, workerSent, registrations, focusCount: () => focusCount, requested: () => requested,
    run: expression => vm.runInContext(expression, context),
    submit(text, deadline = '') { elements['task-input'].value = text; elements['deadline-input'].value = deadline; elements['task-form'].listeners.submit({ preventDefault() {} }); } };
}
async function setSound(app, enabled) { app.elements['toggle-sound'].checked = enabled; await app.elements['toggle-sound'].listeners.change(); }
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
  await setSound(app, app.run("audioContext?.state !== 'running'"));
  assert.equal(app.audio.created, 1);
  assert.equal(app.audio.tones, 3); // Một chuỗi âm cho cả nhóm công việc.
  assert.equal(app.storage.sound, 'true');
  await app.run('checkDeadlines()');
  assert.equal(app.audio.tones, 3);
  assert.equal(JSON.parse(app.storage.value)[0].overdueSoundedDeadline, iso(-1));
  app.elements['test-sound'].listeners.click();
  assert.equal(app.audio.tones, 6);
  await setSound(app, app.run("audioContext?.state !== 'running'"));
  assert.equal(app.storage.sound, 'false');
  assert.equal(app.run('playAlertSound(true)'), false);
  const reload = boot([], { storage: app.storage, audio: true });
  await setSound(reload, true);
  assert.equal(reload.audio.tones, 0);
});
test('Reminder and overdue each play once; changing deadline resets both sound markers', async () => {
  const app = boot([task({ deadline: iso(100) })], { audio: true });
  await setSound(app, app.run("audioContext?.state !== 'running'"));
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
  assert.equal(app.elements['toggle-sound'].checked, true);
  await setSound(app, app.run("audioContext?.state !== 'running'"));
  assert.equal(app.elements['toggle-sound'].checked, true);
  const failed = boot([], { audio: true, audioFails: true, storage: { value: '[]', sound: 'false' } });
  await setSound(failed, true);
  assert.match(failed.elements['sound-status'].textContent, /Không bật được/);
  assert.equal(failed.run('soundEnabled'), false);
});

test('Click sounds cover dynamic controls, respect mute and do not create audio on load', async () => {
  const app = boot([], { audio: true, storage: { value: '[]', sound: 'false' } });
  const control = { id: 'add-task', disabled: false, hidden: false, matches: () => false };
  const event = { target: { closest: () => control } };
  // Chưa bật âm thanh: click không tạo AudioContext.
  await app.run('handleInteractionSound') (event);
  assert.equal(app.audio.created, 0);
  await setSound(app, app.run("audioContext?.state !== 'running'"));
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
  await setSound(app, app.run("audioContext?.state !== 'running'"));
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

test('Default first pointer interaction produces sound; following click does not double-play', async () => {
  const app = boot([], { audio: true });
  assert.equal(app.audio.created, 0);
  const control = { id: 'task-input', tagName: 'INPUT', matches: () => false };
  const target = { closest: () => control };
  await app.documentListeners.pointerdown({ type: 'pointerdown', button: 0, target });
  assert.equal(app.audio.created, 1);
  assert.equal(app.audio.tones, 1);
  await app.documentListeners.click({ type: 'click', target });
  assert.equal(app.audio.tones, 1);
  await app.documentListeners.click({ type: 'click', detail: 0, target });
  assert.equal(app.audio.tones, 2); // Kích hoạt bằng bàn phím vẫn có tiếng.
});
test('Label interaction plays once, right clicks stay silent, stored mute is respected', async () => {
  const app = boot([], { audio: true });
  const checkbox = { id: 'checkbox', tagName: 'INPUT', matches: () => false };
  const label = { tagName: 'LABEL', control: checkbox };
  await app.documentListeners.pointerdown({ type: 'pointerdown', button: 2, target: { closest: () => checkbox } });
  assert.equal(app.audio.created, 0);
  await app.documentListeners.pointerdown({ type: 'pointerdown', button: 0, target: { closest: () => label } });
  await app.documentListeners.click({ type: 'click', target: { closest: () => label } });
  assert.equal(app.audio.tones, 1);
  const muted = boot([], { audio: true, storage: { value: '[]', sound: 'false' } });
  await muted.documentListeners.pointerdown({ type: 'pointerdown', button: 0, target: { closest: () => checkbox } });
  assert.equal(muted.audio.created, 0);
});

test('Desktop test waits five seconds, sends while hidden and focuses TodoList on click', async () => {
  const app = boot();
  await app.elements['test-notification'].listeners.click();
  assert.equal(app.sent.length, 0);
  assert.equal(app.timers.length, 1);
  assert.equal(app.timers[0].delay, 5000);
  await app.elements['test-notification'].listeners.click();
  assert.equal(app.timers.length, 1);
  app.run('document.hidden = true');
  app.timers[0].callback();
  assert.equal(app.sent.length, 1);
  assert.equal(app.sent[0].requireInteraction, true);
  let prevented = false;
  app.notifications[0].onclick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.focusCount(), 1);
  assert.equal(app.notifications[0].closed, true);
});
test('Denied or unsupported desktop notifications never schedule; default permission only asked on click', async () => {
  for (const options of [{ permission: 'denied' }, { unsupported: true }]) {
    const app = boot([], options);
    await app.elements['test-notification'].listeners.click();
    assert.equal(app.timers.length, 0);
    assert.equal(app.sent.length, 0);
  }
  const app = boot([], { permission: 'default' });
  assert.equal(app.requested(), 0);
  await app.elements['test-notification'].listeners.click();
  assert.equal(app.requested(), 1);
  assert.equal(app.timers.length, 0);
});
test('Asynchronous system notification errors reset marker; hidden deadline checks still notify', async () => {
  const app = boot([task({ deadline: iso(-1) })]);
  assert.equal(app.run('tasks[0].overdueNotifiedDeadline'), iso(-1));
  app.notifications[0].onerror();
  assert.equal(app.run('tasks[0].overdueNotifiedDeadline'), null);
  app.run('document.hidden = true');
  await app.run('checkDeadlines()');
  assert.equal(app.sent.length, 2);
  assert.match(app.elements['notification-status'].textContent, /Không hiển thị/);
});

test('Immediate test uses service worker, fresh tag and never calls desktop constructor', async () => {
  const app = boot([], { worker: true });
  await app.elements['test-notification-now'].listeners.click();
  assert.equal(app.workerSent.length, 1);
  assert.equal(app.sent.length, 0);
  assert.equal(app.registrations[0].url, './sw.js');
  assert.equal(app.registrations[0].config.scope, './');
  assert.equal(app.workerSent[0].renotify, true);
  assert.match(app.elements['notification-diagnostics'].textContent, /service worker/);
  assert.equal(app.elements['test-notification-now'].disabled, false);
});
test('Worker show and registration failures show diagnostics and leave buttons usable', async () => {
  for (const flags of [{ workerFails: true }, { registrationFails: true }]) {
    const app = boot([], { worker: true, ...flags });
    await app.elements['test-notification-now'].listeners.click();
    assert.equal(app.workerSent.length, 0);
    assert.match(app.elements['notification-diagnostics'].textContent, /Lỗi: Error/);
    assert.equal(app.elements['test-notification-now'].disabled, false);
    assert.equal(app.run('notificationTestPending'), false);
  }
});
test('Deadline marker saved only after successful service worker delivery', async () => {
  const app = boot([], { worker: true });
  app.run(`tasks = [{id:'sw-task', text:'Deadline', completed:false, deadline:'${iso(-1)}'}]`);
  await app.run('checkDeadlines()');
  assert.equal(app.workerSent.length, 1);
  assert.equal(app.run('tasks[0].overdueNotifiedDeadline'), iso(-1));
  await app.run('checkDeadlines()');
  assert.equal(app.workerSent.length, 1);
  const failed = boot([], { worker: true, workerFails: true });
  failed.run(`tasks = [{id:'sw-task', text:'Deadline', completed:false, deadline:'${iso(-1)}'}]`);
  await failed.run('checkDeadlines()');
  assert.equal(failed.run('Boolean(tasks[0].overdueNotifiedDeadline)'), false);
});
test('Service worker click focuses existing TodoList or opens its own scope', async () => {
  const handlers = {};
  let focused = 0;
  let opened = '';
  let tabs = [{ url: 'https://anhhq1608.github.io/TodoList/', focus: async () => { focused++; } }];
  const self = { location: { href: 'https://anhhq1608.github.io/TodoList/sw.js' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    clients: { matchAll: async () => tabs, openWindow: async url => { opened = url; } } };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), { self, URL });
  let pending;
  const event = { notification: { close() {} }, waitUntil: promise => { pending = promise; } };
  handlers.notificationclick(event); await pending;
  assert.equal(focused, 1);
  tabs = [];
  handlers.notificationclick(event); await pending;
  assert.equal(opened, 'https://anhhq1608.github.io/TodoList/');
});

test('Create folders, assign new tasks, persist and reload without changing old tasks', () => {
  const app = boot([task()]);
  assert.equal(app.run('tasks[0].folderId'), '');
  const oldStorage = app.storage.value;
  app.elements['folder-name'].value = '  Học   tập  ';
  app.elements['folder-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.run('folders[0].name'), 'Học tập');
  assert.equal(app.storage.value, oldStorage);
  assert.equal(app.elements['task-folder'].value, app.run('folders[0].id'));
  app.submit('Học HTML');
  assert.equal(app.run('tasks[1].folderId'), app.run('folders[0].id'));
  assert.equal(app.elements['task-list'].children.length, 1);
  const reload = boot([], { storage: app.storage });
  assert.equal(reload.run('folders[0].name'), 'Học tập');
  assert.equal(reload.run('tasks.length'), 2);
  assert.equal(reload.elements['task-list'].children[1].children[1].children[2].textContent, 'Học tập');
});
test('Folder filtering combines with status; editing moves tasks and preserves deadlines', () => {
  const folders = [{ id: 'school', name: 'Học tập' }, { id: 'work', name: 'Công việc' }];
  const initial = [task({ folderId: 'school', deadline: iso(2*HOUR) }), task({ id: '2', folderId: 'school', completed: true }), task({ id: '3', folderId: 'work' })];
  const app = boot([], { storage: { value: JSON.stringify(initial), folders: JSON.stringify(folders) } });
  app.elements['folder-filters'].children[2].listeners.click();
  assert.equal(app.elements['task-list'].children.length, 2);
  assert.equal(app.elements.percentage.textContent, '50%');
  app.filters[1].listeners.click();
  assert.equal(app.elements['task-list'].children.length, 1);
  app.filters[2].listeners.click();
  assert.equal(app.elements['task-list'].children.length, 1);
  app.filters[0].listeners.click();
  app.elements['task-list'].children[0].children[2].children[0].listeners.click();
  assert.equal(app.elements['task-folder'].value, 'school');
  app.elements['task-folder'].value = 'work';
  app.elements['task-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.run('tasks[0].folderId'), 'work');
  assert.equal(app.run('tasks[0].deadline'), iso(2*HOUR));
  assert.equal(app.run('currentFolder'), 'work');
  assert.equal(app.elements['task-list'].children.length, 2);
  app.run('startEditing(tasks[0])');
  app.elements['task-folder'].value = '';
  app.elements['task-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.run('tasks[0].folderId'), '');
  assert.equal(app.elements['task-list'].children.length, 1);
});
test('Reject blank, duplicate, reserved folder names; render names as plain text', () => {
  const app = boot();
  const create = name => { app.elements['folder-name'].value = name; app.elements['folder-form'].listeners.submit({ preventDefault() {} }); };
  create('   '); create('Chưa phân loại'); create('TẤT CẢ MỤC');
  assert.equal(app.run('folders.length'), 0);
  create('Học tập'); create('  học   TẬP  ');
  assert.equal(app.run('folders.length'), 1);
  create('<img src=x onerror=alert(1)>');
  assert.equal(app.run('folders.length'), 2);
  assert.equal(app.elements['folder-filters'].children[3].children[0].textContent, '<img src=x onerror=alert(1)>');
});
test('Missing/corrupt folder storage and blocked writes keep existing tasks accessible', () => {
  for (const folders of ['{broken', 'null', '[]']) {
    const app = boot([], { storage: { value: JSON.stringify([task({ folderId: 'missing' })]), folders } });
    assert.equal(app.elements['task-list'].children.length, 1);
    assert.equal(app.run('taskFolderId(tasks[0])'), '');
  }
  const app = boot([task()], { blocked: true });
  app.elements['folder-name'].value = 'Cá nhân';
  app.elements['folder-form'].listeners.submit({ preventDefault() {} });
  assert.equal(app.run('folders.length'), 0);
  assert.equal(app.run('tasks.length'), 1);
  assert.match(app.elements['folder-message'].textContent, /Không thể lưu/);
});
test('Hidden folder tasks still get deadline notifications', async () => {
  const app = boot([task({ deadline: iso(-1) })]);
  const sentBefore = app.sent.length;
  app.run("folders = [{id:'empty-folder', name:'Mục khác'}]; currentFolder = 'empty-folder'; renderTasks(); tasks[0].overdueNotifiedDeadline = null; saveTasks()");
  assert.equal(app.elements['task-list'].children.length, 0);
  await app.run('checkDeadlines()');
  assert.equal(app.sent.length, sentBefore + 1);
});

test('Custom folder picker selects, closes, and stays in sync when adding or editing tasks', () => {
  const app = boot([], { storage: { value: '[]', folders: JSON.stringify([{ id: 'sports', name: 'Thể thao' }]) } });
  assert.equal(app.elements['folder-selected-name'].textContent, 'Chưa phân loại');
  app.elements['folder-picker'].open = true;
  app.elements['folder-options'].children[1].listeners.click();
  assert.equal(app.elements['task-folder'].value, 'sports');
  assert.equal(app.elements['folder-selected-name'].textContent, 'Thể thao');
  assert.equal(app.elements['folder-picker'].open, false);
  app.submit('Chạy bộ');
  assert.equal(app.run('tasks[0].folderId'), 'sports');
  app.run('startEditing(tasks[0])');
  assert.equal(app.elements['folder-selected-name'].textContent, 'Thể thao');
  assert.equal(app.elements['folder-options'].children[1]['aria-pressed'], 'true');
  app.elements['folder-picker'].open = true;
  app.elements['folder-picker'].listeners.keydown({ key: 'Escape' });
  assert.equal(app.elements['folder-picker'].open, false);
});
test('Toolbar folder selection updates picker and still combines with Active filter', () => {
  const app = boot([], { storage: { value: JSON.stringify([task({ folderId: 'sports' }), task({ id: '2', folderId: 'sports', completed: true })]), folders: JSON.stringify([{ id: 'sports', name: 'Thể thao' }]) } });
  app.elements['folder-filters'].children[2].listeners.click();
  assert.equal(app.elements['folder-selected-name'].textContent, 'Thể thao');
  app.filters[1].listeners.click();
  assert.equal(app.elements['task-list'].children.length, 1);
  assert.equal(app.run('currentFolder'), 'sports');
  const toolbar = html.slice(html.indexOf('<div class="toolbar">'), html.indexOf('<ul id="task-list"'));
  assert.ok(toolbar.includes('id="folder-filters"'));
});

test('Picked folder icon persists and appears in toolbar, menu and selection', () => {
  const app = boot();
  app.elements['folder-icons'].children[4].listeners.click();
  assert.equal(app.run('selectedFolderIcon'), '⚽');
  app.elements['folder-name'].value = 'Thể thao';
  app.elements['folder-form'].listeners.submit({ preventDefault() {} });
  assert.equal(JSON.parse(app.storage.folders)[0].icon, '⚽');
  assert.equal(app.elements['folder-filters'].children[2].children[2].textContent, '⚽');
  assert.equal(app.elements['folder-options'].children[1].children[0].textContent, '⚽');
  assert.equal(app.elements['folder-selected-icon'].textContent, '⚽');
  const reload = boot([], { storage: app.storage });
  assert.equal(reload.run('folders[0].icon'), '⚽');
});
test('Deleting folder keeps tasks, deadlines, completion and notification states after reload', () => {
  const original = task({ folderId: 'work', deadline: iso(2*HOUR), completed: true, notifiedDeadline: iso(2*HOUR) });
  const app = boot([], { storage: { value: JSON.stringify([original]), folders: JSON.stringify([{ id: 'work', name: 'Công việc' }]) } });
  assert.equal(app.run('folders[0].icon'), '📁');
  app.elements['folder-filters'].children[2].listeners.click();
  assert.equal(app.elements['delete-folder'].hidden, false);
  app.run('startEditing(tasks[0])');
  app.elements['delete-folder'].listeners.click();
  assert.equal(app.run('folders.length'), 0);
  assert.equal(app.run('tasks.length'), 1);
  assert.equal(app.run('tasks[0].folderId'), '');
  assert.equal(app.run('tasks[0].deadline'), original.deadline);
  assert.equal(app.run('tasks[0].completed'), true);
  assert.equal(app.run('tasks[0].notifiedDeadline'), original.notifiedDeadline);
  assert.equal(app.elements['task-folder'].value, '');
  assert.equal(app.elements['delete-folder'].hidden, true);
  const reload = boot([], { storage: app.storage });
  assert.equal(reload.run('tasks.length'), 1);
  assert.equal(reload.run('tasks[0].folderId'), '');
});
test('Folder deletion failure preserves folders and tasks; built-in views cannot be deleted', () => {
  const initial = task({ folderId: 'work' });
  const app = boot([], { blocked: true, storage: { value: JSON.stringify([initial]), folders: JSON.stringify([{ id:'work', name:'Work' }]) } });
  app.elements['folder-filters'].children[2].listeners.click();
  app.elements['delete-folder'].listeners.click();
  assert.equal(app.run('folders.length'), 1);
  assert.equal(app.run('tasks[0].folderId'), 'work');
  assert.match(app.elements['folder-message'].textContent, /Không thể xóa/);
  app.elements['folder-filters'].children[0].listeners.click();
  app.elements['delete-folder'].listeners.click();
  assert.equal(app.run('folders.length'), 1);
});

test('Audio automatically activates from background tap or typing, and respects saved mute', async () => {
  const app = boot([], { audio: true });
  assert.equal(app.audio.created, 0);
  await app.documentListeners.pointerdown({ type: 'pointerdown', button: 0, target: { closest: () => null } });
  assert.equal(app.audio.created, 1);
  assert.equal(app.run('audioContext.state'), 'running');
  assert.equal(app.audio.tones, 0);
  const keyboard = boot([], { audio: true });
  await keyboard.documentListeners.keydown({ key: 'a', repeat: false });
  assert.equal(keyboard.run('audioContext.state'), 'running');
  const muted = boot([], { audio: true, storage: { value: '[]', sound: 'false' } });
  await muted.documentListeners.keydown({ key: 'a', repeat: false });
  assert.equal(muted.audio.created, 0);
});

test('Header settings button opens dialog; close button hides it', () => {
  const app = boot();
  app.elements['open-settings'].listeners.click();
  assert.equal(app.elements['settings-dialog'].open, true);
  app.elements['close-settings'].listeners.click();
  assert.equal(app.elements['settings-dialog'].open, false);
  const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
  assert.ok(header.includes('id="open-settings"'));
  assert.equal(html.includes('<details class="app-settings">'), false);
});

test('Completed tasks expire at exactly two hours, active tasks never expire', () => {
  const initial = [task({ completed: true, completedAt: NOW - 2*HOUR + 1 }), task({ id: 'active', completed: false, completedAt: NOW - 10*HOUR })];
  const app = boot(initial);
  assert.equal(app.run('tasks.length'), 2);
  app.run(`cleanupCompletedTasks(${NOW + 1})`);
  assert.equal(app.run('tasks.length'), 1);
  assert.equal(app.run('tasks[0].id'), 'active');
  assert.equal(JSON.parse(app.storage.value).length, 1);
});
test('Checking completion saves timestamp; undo cancels expiry and completing again restarts it', () => {
  const app = boot([task()]);
  let checkbox = app.elements['task-list'].children[0].children[0];
  checkbox.checked = true; checkbox.listeners.change();
  assert.equal(app.run('tasks[0].completedAt'), NOW);
  assert.equal(JSON.parse(app.storage.value)[0].completedAt, NOW);
  app.run(`Date.now = () => ${NOW + HOUR}`);
  checkbox = app.elements['task-list'].children[0].children[0];
  checkbox.checked = false; checkbox.listeners.change();
  assert.equal(app.run('tasks[0].completedAt'), null);
  app.run(`cleanupCompletedTasks(${NOW + 3*HOUR})`);
  assert.equal(app.run('tasks.length'), 1);
  checkbox = app.elements['task-list'].children[0].children[0];
  checkbox.checked = true; checkbox.listeners.change();
  assert.equal(app.run('tasks[0].completedAt'), NOW + HOUR);
});
test('Reload removes expired tasks; old completed tasks get a persisted grace period', () => {
  const expired = boot([task({ completed: true, completedAt: NOW - 3*HOUR })]);
  assert.equal(expired.run('tasks.length'), 0);
  assert.equal(expired.elements['task-list'].children.length, 0);
  const legacy = boot([task({ completed: true })]);
  assert.equal(legacy.run('tasks.length'), 1);
  assert.equal(legacy.run('tasks[0].completedAt'), NOW);
  assert.equal(JSON.parse(legacy.storage.value)[0].completedAt, NOW);
  assert.equal(boot([], { storage: legacy.storage }).run('tasks[0].completedAt'), NOW);
});
test('Cleanup respects latest storage from another tab and keeps its unrelated new tasks', () => {
  const app = boot([task({ completed: true, completedAt: NOW - HOUR })]);
  app.storage.value = JSON.stringify([task({ completed: false }), task({ id: 'new', text: 'New from other tab' })]);
  app.run(`cleanupCompletedTasks(${NOW + 2*HOUR})`);
  assert.equal(JSON.parse(app.storage.value).length, 2);
  assert.equal(JSON.parse(app.storage.value)[0].completed, false);
  app.storage.value = JSON.stringify([task({ completed: true, completedAt: NOW - HOUR }), task({ id: 'new', text: 'New from other tab' })]);
  app.run(`cleanupCompletedTasks(${NOW + HOUR})`);
  assert.equal(app.run('tasks.length'), 1);
  assert.equal(app.run('tasks[0].id'), 'new');
});
