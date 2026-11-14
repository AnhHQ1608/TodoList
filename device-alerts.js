// Cảnh báo trong trang, chỉ hoạt động khi trình duyệt còn mở website.
(() => {
  let endpoint = '';
  try { const url = new URL(window.TODO_ANALYTICS?.apiUrl); if (url.protocol === 'https:') endpoint = url.origin; } catch { return; }
  if (!endpoint) return;
  const seenKey = 'focus-admin-alerts-seen-v1';
  let seen;
  try { seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { seen = new Set(); }
  let busy = false;
  const queue = [];
  const queued = new Set();
  let showing = false;
  function remember(id) {
    seen.add(id);
    seen = new Set([...seen].slice(-500));
    try { localStorage.setItem(seenKey, JSON.stringify([...seen])); } catch { /* Chống lặp trong bộ nhớ. */ }
  }
  function showNext() {
    if (showing || !queue.length || document.visibilityState !== 'visible') return;
    const item = queue[0];
    const dialog = document.createElement('dialog'); dialog.className = 'device-alert-dialog';
    const title = document.createElement('h2'); title.textContent = 'Cảnh báo từ quản trị viên';
    const message = document.createElement('p'); message.textContent = item.message;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'secondary'; close.textContent = 'Đã hiểu';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); showing = false; showNext(); });
    dialog.append(title, message, close); document.body.append(dialog);
    try {
      dialog.showModal();
      showing = true;
      queue.shift(); queued.delete(item.id);
      remember(item.id); // Chỉ đánh dấu sau khi hộp thoại thật sự hiển thị.
    } catch { dialog.remove(); }
  }
  async function systemNotice(item) {
    // Không tự yêu cầu quyền. Người dùng bật thông báo trong Cài đặt TodoList.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      if (navigator.serviceWorker) {
        const registration = await navigator.serviceWorker.register('./sw.js');
        if (registration.active) await registration.showNotification('Cảnh báo từ quản trị viên', {
          body: item.message, tag: 'admin-alert-' + item.id, icon: './icons/icon-192.png'
        });
      } else {
        const notification = new Notification('Cảnh báo từ quản trị viên', { body: item.message, tag: 'admin-alert-' + item.id });
        notification.onclick = () => { window.focus(); notification.close(); };
      }
    } catch { /* Vẫn giữ cảnh báo để hiển thị trong trang. */ }
  }
  async function poll() {
    showNext();
    if (busy) return;
    let visitorId;
    try { visitorId = localStorage.getItem('focus-activity-visitor-v1'); } catch { return; }
    if (!visitorId) return;
    busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(endpoint + '/device/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId }), credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      for (const item of (data.alerts || []).slice().reverse()) {
        if (typeof item.id !== 'string' || typeof item.message !== 'string' || seen.has(item.id) || queued.has(item.id)) continue;
        queued.add(item.id); queue.push(item);
        if (document.visibilityState !== 'visible') systemNotice(item);
      }
      showNext();
    } catch { /* Lỗi mạng không ảnh hưởng công việc. */ }
    finally { busy = false; clearTimeout(timer); }
  }
  document.addEventListener('visibilitychange', poll);
  setInterval(poll, 15000);
  poll();
})();
