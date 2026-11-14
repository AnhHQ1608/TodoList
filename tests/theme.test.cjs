const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function boot(storage = new Map(), { noToggle = false, blocked = false } = {}) {
  const events = {}, attributes = {}, metaAttributes = {}, buttonAttributes = {}, buttonEvents = {};
  const toggle = { setAttribute: (key, value) => { buttonAttributes[key] = value; }, addEventListener: (type, fn) => { buttonEvents[type] = fn; } };
  vm.runInNewContext(fs.readFileSync('theme.js', 'utf8'), {
    document: { readyState: 'loading', documentElement: { setAttribute: (key, value) => { attributes[key] = value; } },
      querySelector: () => ({ setAttribute: (key, value) => { metaAttributes[key] = value; } }),
      getElementById: () => noToggle ? null : toggle, addEventListener: (type, fn) => { events[type] = fn; } },
    window: { addEventListener: (type, fn) => { events[type] = fn; } },
    localStorage: { getItem: key => { if (blocked) throw Error('Blocked'); return storage.get(key); }, setItem: (key, value) => { if (blocked) throw Error('Blocked'); storage.set(key, value); } }
  });
  return { events, attributes, metaAttributes, buttonAttributes, buttonEvents, storage };
}
test('Theme defaults dark, toggles light and persists across reload', () => {
  const app = boot();
  assert.equal(app.attributes['data-theme'], 'dark');
  app.events.DOMContentLoaded();
  app.buttonEvents.click();
  assert.equal(app.attributes['data-theme'], 'light');
  assert.equal(app.buttonAttributes['aria-checked'], 'true');
  assert.equal(app.metaAttributes.content, '#ffffff');
  assert.equal(boot(app.storage).attributes['data-theme'], 'light');
  app.buttonEvents.click();
  assert.equal(app.storage.get('focus-theme-v1'), 'dark');
});
test('Theme works on admin without toggle and syncs changes from another tab', () => {
  const store = new Map([['focus-theme-v1', 'light']]);
  const app = boot(store, { noToggle: true });
  app.events.DOMContentLoaded();
  assert.equal(app.attributes['data-theme'], 'light');
  store.set('focus-theme-v1', 'dark');
  app.events.storage({ key: 'focus-theme-v1' });
  assert.equal(app.attributes['data-theme'], 'dark');
});
test('Blocked storage does not prevent theme toggle', () => {
  const app = boot(new Map(), { blocked: true });
  app.events.DOMContentLoaded();
  assert.doesNotThrow(() => app.buttonEvents.click());
  assert.equal(app.attributes['data-theme'], 'light');
});
