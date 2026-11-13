// Service worker chỉ hiển thị thông báo được trang yêu cầu.
// Không hẹn giờ nền, không cache và không tự gửi nhắc khi trang đã đóng.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const home = new URL('./', self.location.href).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(client => client.url.startsWith(home));
    if (tab) return tab.focus();
    return self.clients.openWindow(home);
  })());
});
