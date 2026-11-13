// Không nhúng mật khẩu, không lưu token đăng nhập vào localStorage.
(() => {
  const $ = id => document.getElementById(id);
  const labels = { visit: 'Mở trang', heartbeat: 'Trang đang hoạt động', task_created: 'Thêm task', task_updated: 'Sửa task', task_deleted: 'Xóa task', task_completed: 'Hoàn thành task', task_reopened: 'Mở lại task', task_auto_deleted: 'Tự xóa task sau 2 giờ', folder_created: 'Tạo thư mục', folder_deleted: 'Xóa thư mục' };
  let endpoint = '';
  try { const url = new URL(window.TODO_ANALYTICS?.apiUrl); if (url.protocol === 'https:') endpoint = url.origin; } catch { /* Chưa cấu hình. */ }
  let token = '';
  let offset = 0;
  let expiresTimer;
  let busy = false;
  function logout(message = 'Đã đăng xuất.') {
    token = '';
    clearTimeout(expiresTimer);
    $('admin-dashboard').hidden = true;
    $('admin-login').hidden = false;
    $('sessions-body').replaceChildren();
    $('events-body').replaceChildren();
    $('session-filter').replaceChildren();
    $('admin-message').textContent = message;
  }
  async function api(path, body) {
    const response = await fetch(endpoint + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && token) logout('Phiên đăng nhập hết hạn. Hãy đăng nhập lại.');
      throw Error(data.error || 'Không tải được dữ liệu.');
    }
    return data;
  }
  const date = value => new Date(value * 1000).toLocaleString('vi-VN');
  const short = value => value.slice(0, 8);
  function isOwnDevice(visitorId) {
    try { return visitorId === localStorage.getItem('focus-activity-visitor-v1'); } catch { return false; }
  }
  function cell(row, text) { const td = document.createElement('td'); td.textContent = text; row.append(td); return td; }
  async function loadEvents() {
    const session = $('session-filter').value;
    const data = await api('/admin/events?offset=' + offset + (session ? '&session=' + encodeURIComponent(session) : ''));
    if (!token) return;
    $('events-body').replaceChildren();
    data.events.forEach(event => {
      const row = document.createElement('tr');
      cell(row, date(event.created_at)); cell(row, (isOwnDevice(event.visitor_id) ? 'admin · ' : '') + short(event.session_id)); cell(row, labels[event.action] || 'Thao tác khác');
      $('events-body').append(row);
    });
    if (!data.events.length) { const row = document.createElement('tr'); cell(row, 'Chưa có thao tác phù hợp.'); $('events-body').append(row); }
    $('events-page').textContent = 'Trang ' + (offset / 100 + 1);
    $('events-previous').disabled = offset === 0;
    $('events-next').disabled = !data.hasMore;
  }
  async function refresh() {
    if (busy || !token) return;
    busy = true;
    $('admin-refresh').disabled = true;
    try {
      const data = await api('/admin/sessions');
      if (!token) return;
      const selected = $('session-filter').value;
      $('sessions-body').replaceChildren();
      $('session-filter').replaceChildren();
      const all = document.createElement('option'); all.value = ''; all.textContent = 'Tất cả phiên'; $('session-filter').append(all);
      data.sessions.forEach(session => {
        const own = isOwnDevice(session.visitor_id);
        const option = document.createElement('option'); option.value = session.session_id; option.textContent = (own ? 'admin · ' : '') + short(session.session_id) + ' · ' + session.browser; $('session-filter').append(option);
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        const button = document.createElement('button'); button.type = 'button'; button.className = 'session-link'; button.textContent = short(session.session_id); button.title = session.session_id;
        button.addEventListener('click', () => { $('session-filter').value = session.session_id; offset = 0; loadEvents().catch(showError); });
        const visitor = document.createElement('small'); visitor.textContent = own ? 'Thiết bị của bạn · admin' : 'Khách ' + short(session.visitor_id);
        identity.append(button, visitor); row.append(identity);
        cell(row, own ? 'admin · ' + session.device : session.device); cell(row, session.browser + ' / ' + session.os); cell(row, date(session.last_seen));
        cell(row, Date.now() / 1000 - session.last_seen < 120 ? 'Vừa hoạt động' : 'Không hoạt động gần đây');
        $('sessions-body').append(row);
      });
      $('session-filter').value = data.sessions.some(session => session.session_id === selected) ? selected : '';
      await loadEvents();
      if (token) $('admin-message').textContent = 'Đã cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN');
    } catch (error) { showError(error); }
    finally { busy = false; $('admin-refresh').disabled = false; }
  }
  function showError(error) { $('admin-message').textContent = error.message || 'Không kết nối được máy chủ.'; }
  $('admin-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!endpoint) return;
    $('admin-login-button').disabled = true;
    try {
      const data = await api('/admin/login', { password: $('admin-password').value });
      token = data.token;
      $('admin-password').value = '';
      expiresTimer = setTimeout(() => logout('Phiên đăng nhập hết hạn.'), data.expiresIn * 1000);
      $('admin-login').hidden = true; $('admin-dashboard').hidden = false; offset = 0;
      await refresh();
    } catch (error) { showError(error); }
    finally { $('admin-login-button').disabled = false; }
  });
  $('admin-refresh').addEventListener('click', refresh);
  $('admin-logout').addEventListener('click', () => logout());
  $('session-filter').addEventListener('change', () => { offset = 0; loadEvents().catch(showError); });
  $('events-previous').addEventListener('click', () => { offset = Math.max(0, offset - 100); loadEvents().catch(showError); });
  $('events-next').addEventListener('click', () => { offset += 100; loadEvents().catch(showError); });
  if (!endpoint) {
    $('admin-login-button').disabled = true;
    $('admin-message').textContent = 'Chưa kết nối backend. Xem ACTIVITY_SETUP.md để triển khai; hiện chưa có dữ liệu được thu thập.';
  }
  setInterval(() => { if (token && document.visibilityState === 'visible') refresh(); }, 30000);
})();
