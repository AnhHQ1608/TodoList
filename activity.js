// Chỉ ghi tên thao tác. Không đọc nội dung task, thư mục, deadline hay phím gõ.
(() => {
  const allowed = new Set(['visit', 'heartbeat', 'task_created', 'task_updated', 'task_deleted', 'task_completed', 'task_reopened', 'task_auto_deleted', 'folder_created', 'folder_deleted']);
  const visitorKey = 'focus-activity-visitor-v1';
  const config = window.TODO_ANALYTICS || {};
  let endpoint = '';
  try {
    const url = new URL(config.apiUrl);
    if (url.protocol === 'https:') endpoint = url.origin;
  } catch { /* Chưa cấu hình: tuyệt đối không gửi dữ liệu. */ }
  const privacySignal = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  let sessionId = null;
  let pending = 0;
  const browser = navigator.userAgent || '';
  const device = /iPad|Tablet/i.test(browser) ? 'tablet' : /Mobi|Android|iPhone/i.test(browser) ? 'mobile' : 'desktop';
  const browserName = /coc_coc|coccoc/i.test(browser) ? 'CocCoc' : /Edg/i.test(browser) ? 'Edge'
    : /Firefox|FxiOS/i.test(browser) ? 'Firefox' : /Chrome|CriOS/i.test(browser) ? 'Chrome' : /Safari/i.test(browser) ? 'Safari' : 'Other';
  const os = /iPhone|iPad|iPod/i.test(browser) ? 'iOS' : /Android/i.test(browser) ? 'Android'
    : /Windows/i.test(browser) ? 'Windows' : /Mac/i.test(browser) ? 'macOS' : /Linux/i.test(browser) ? 'Linux' : 'Other';
  function canTrack() { return Boolean(endpoint && !privacySignal && window.crypto?.randomUUID); }
  function updateControls() {
    document.getElementById('activity-notice').hidden = !endpoint || privacySignal;
  }
  async function track(action) {
    if (!allowed.has(action) || !canTrack() || pending >= 10) return;
    let visitorId;
    try {
      visitorId = localStorage.getItem(visitorKey);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId || '')) {
        visitorId = crypto.randomUUID();
        localStorage.setItem(visitorKey, visitorId);
      }
    } catch { return; }
    if (!sessionId) sessionId = crypto.randomUUID();
    const payload = { eventId: crypto.randomUUID(), visitorId, sessionId, action, browser: browserName, os, device };
    pending++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(endpoint + '/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch { /* Backend lỗi hoặc chặn mạng không ảnh hưởng TodoList. Không lưu hàng đợi nội dung. */ }
    finally { clearTimeout(timeout); pending--; }
  }
  window.todoActivity = Object.freeze({ track });
  updateControls();
  track('visit');
  setInterval(() => { if (document.visibilityState === 'visible') track('heartbeat'); }, 60000);
})();
