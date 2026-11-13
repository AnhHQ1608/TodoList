// 1. Trạng thái ứng dụng. Giữ khóa cũ để không mất công việc đã lưu.
const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const deadlineInput = document.getElementById('deadline-input');
const submitButton = document.getElementById('submit-task');
const cancelButton = document.getElementById('cancel-edit');
const notificationButton = document.getElementById('enable-notifications');
const notificationStatus = document.getElementById('notification-status');
const list = document.getElementById('task-list');
const message = document.getElementById('message');
const filters = document.querySelectorAll('[data-filter]');
const storageKey = 'focus-list-tasks-v1';
const hour = 60 * 60 * 1000;
let tasks = [];
let currentFilter = 'all';
let editingId = null;

function readTasks() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved)) throw new Error('Dữ liệu không hợp lệ');
  return saved.filter(task => task && typeof task.id === 'string'
    && typeof task.text === 'string' && typeof task.completed === 'boolean')
    .map(task => ({ ...task,
      deadline: typeof task.deadline === 'string' && Number.isFinite(Date.parse(task.deadline))
        ? new Date(task.deadline).toISOString() : null,
      notifiedDeadline: typeof task.notifiedDeadline === 'string' ? task.notifiedDeadline : null
    }));
}
try { tasks = readTasks(); } catch (error) {
  message.textContent = 'Không thể đọc dữ liệu đã lưu. Bạn vẫn có thể tạo danh sách mới.';
}
function saveTasks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    message.textContent = '';
    return true;
  } catch (error) {
    message.textContent = 'Không thể lưu dữ liệu. Thay đổi và trạng thái nhắc chỉ được giữ trong tab này.';
    return false;
  }
}
function setFilter(filter) {
  currentFilter = filter;
  filters.forEach(button => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

// 2. Tính thời gian bằng timestamp để không bị sai khi bộ hẹn giờ chạy trễ.
function deadlineInfo(task, now = Date.now()) {
  if (!task.deadline) return { text: 'Không có deadline', className: '' };
  const date = new Date(task.deadline);
  const formatted = date.toLocaleString('vi-VN');
  if (task.completed) return { text: 'Đã hoàn thành · Deadline: ' + formatted, className: '' };
  const remaining = date.getTime() - now;
  if (remaining <= 0) return { text: 'Quá hạn · Deadline: ' + formatted, className: 'overdue' };
  const minutes = Math.ceil(remaining / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const time = days ? `${days} ngày ${hours} giờ` : hours ? `${hours} giờ ${minutes % 60} phút` : `${minutes} phút`;
  return { text: `Còn ${time} · ${formatted}`, className: remaining < 24 * hour ? 'warning' : '' };
}
function updateCountdowns() {
  // Chỉ cập nhật chữ và màu, không vẽ lại form hoặc làm mất focus.
  tasks.forEach(task => {
    const element = document.getElementById('deadline-' + task.id);
    if (!element) return;
    const info = deadlineInfo(task);
    element.textContent = info.text;
    element.className = 'deadline ' + info.className;
  });
}
function resetEditor() {
  editingId = null;
  form.reset();
  submitButton.textContent = '＋ Add Task';
  cancelButton.hidden = true;
}
function startEditing(task) {
  editingId = task.id;
  input.value = task.text;
  // datetime-local cần giờ địa phương, không phải chuỗi UTC từ toISOString().
  if (task.deadline) {
    const date = new Date(task.deadline);
    const pad = value => String(value).padStart(2, '0');
    deadlineInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } else deadlineInput.value = '';
  submitButton.textContent = 'Lưu thay đổi';
  cancelButton.hidden = false;
  input.focus();
}

// 3. Vẽ danh sách. textContent ngăn nội dung nhập bị chạy như HTML.
function renderTasks() {
  list.replaceChildren();
  const visible = tasks.filter(task => currentFilter === 'active' ? !task.completed
    : currentFilter === 'completed' ? task.completed : true);
  visible.forEach(task => {
    const item = document.createElement('li');
    item.className = task.completed ? 'task completed' : 'task';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'task-' + task.id;
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => {
      task.completed = checkbox.checked;
      saveTasks();
      renderTasks();
      (document.getElementById(checkbox.id) || document.querySelector('.filters .selected')).focus();
      checkDeadlines();
    });
    const content = document.createElement('div');
    content.className = 'task-content';
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = task.text;
    const deadline = document.createElement('p');
    deadline.id = 'deadline-' + task.id;
    content.append(label, deadline);
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit';
    editButton.textContent = 'Sửa';
    editButton.setAttribute('aria-label', 'Sửa công việc: ' + task.text);
    editButton.addEventListener('click', () => startEditing(task));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = '×';
    deleteButton.setAttribute('aria-label', 'Xóa công việc: ' + task.text);
    deleteButton.addEventListener('click', () => {
      tasks = tasks.filter(existing => existing.id !== task.id);
      if (editingId === task.id) resetEditor();
      saveTasks();
      renderTasks();
      input.focus();
    });
    actions.append(editButton, deleteButton);
    item.append(checkbox, content, actions);
    list.append(item);
  });
  const completed = tasks.filter(task => task.completed).length;
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  document.getElementById('task-count').textContent = visible.length + ' công việc';
  document.getElementById('completed-count').textContent = `Đã hoàn thành ${completed} / ${tasks.length} công việc`;
  document.getElementById('percentage').textContent = percent + '%';
  document.getElementById('progress-fill').style.width = percent + '%';
  document.getElementById('progress').setAttribute('aria-valuenow', percent);
  const empty = document.getElementById('empty-state');
  empty.hidden = visible.length > 0;
  const texts = {
    all: ['Sẵn sàng cho một ngày hiệu quả?', 'Thêm công việc đầu tiên và bắt đầu từ những điều nhỏ.'],
    active: ['Không có công việc đang chờ!', 'Bạn có thể thêm công việc mới khi sẵn sàng.'],
    completed: ['Chưa có công việc hoàn thành', 'Đánh dấu một công việc để ghi nhận bước tiến của bạn.']
  };
  empty.querySelector('h3').textContent = texts[currentFilter][0];
  empty.querySelector('p').textContent = texts[currentFilter][1];
  updateCountdowns();
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) { message.textContent = 'Vui lòng nhập nội dung công việc.'; input.focus(); return; }
  const date = deadlineInput.value ? new Date(deadlineInput.value) : null;
  if (date && !Number.isFinite(date.getTime())) {
    message.textContent = 'Ngày giờ deadline không hợp lệ.'; deadlineInput.focus(); return;
  }
  const deadline = date ? date.toISOString() : null;
  if (editingId) {
    const task = tasks.find(task => task.id === editingId);
    if (!task) { resetEditor(); message.textContent = 'Công việc đã bị xóa ở tab khác.'; return; }
    if (task.deadline !== deadline) task.notifiedDeadline = null;
    task.text = text;
    task.deadline = deadline;
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    tasks.push({ id, text, completed: false, deadline, notifiedDeadline: null });
    setFilter('all');
  }
  saveTasks();
  resetEditor();
  renderTasks();
  input.focus();
  checkDeadlines();
});
cancelButton.addEventListener('click', () => { resetEditor(); input.focus(); });
filters.forEach(button => button.addEventListener('click', () => { setFilter(button.dataset.filter); renderTasks(); }));

// 4. Chỉ yêu cầu quyền khi người dùng nhấn nút, không hỏi khi tải trang.
function updateNotificationStatus() {
  notificationButton.disabled = false;
  if (!('Notification' in window) || !window.isSecureContext) {
    notificationStatus.textContent = 'Thông báo không khả dụng. Hãy dùng trình duyệt hỗ trợ trên HTTPS hoặc localhost.';
    notificationButton.disabled = true;
  } else if (Notification.permission === 'granted') {
    notificationStatus.textContent = 'Đã cấp quyền. Nhắc deadline khi trang đang mở (tùy hỗ trợ trình duyệt).';
    notificationButton.textContent = 'Đã bật thông báo';
    notificationButton.disabled = true;
  } else if (Notification.permission === 'denied') {
    notificationStatus.textContent = 'Quyền đã bị chặn. Hãy cho phép thông báo trong cài đặt trang của trình duyệt.';
    notificationButton.textContent = 'Thông báo bị chặn';
    notificationButton.disabled = true;
  } else {
    notificationStatus.textContent = 'Bật để nhận nhắc trong 1 giờ cuối trước deadline.';
    notificationButton.textContent = 'Bật thông báo';
  }
}
notificationButton.addEventListener('click', async () => {
  if (!('Notification' in window) || !window.isSecureContext) return;
  try {
    await Notification.requestPermission();
    updateNotificationStatus();
    await checkDeadlines();
  } catch (error) { notificationStatus.textContent = 'Không thể bật thông báo trên trình duyệt này.'; }
});

// 5. Một lần cho mỗi deadline; lưu dấu nhắc để tải lại trang không gửi trùng.
function sendDueNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !window.isSecureContext) return;
  let saved = [];
  try { saved = readTasks(); } catch (error) { /* Vẫn dùng trạng thái trong bộ nhớ nếu không đọc được. */ }
  for (const task of tasks) {
    const stored = saved.find(item => item.id === task.id);
    if (stored && stored.deadline === task.deadline && stored.notifiedDeadline === task.deadline) {
      task.notifiedDeadline = stored.notifiedDeadline;
    }
    const remaining = task.deadline ? Date.parse(task.deadline) - Date.now() : 0;
    if (task.completed || remaining <= 0 || remaining > hour || task.notifiedDeadline === task.deadline) continue;
    try {
      new Notification('Công việc sắp đến hạn', {
        body: `${task.text} · ${deadlineInfo(task).text}`,
        tag: 'focus-deadline-' + task.id + '-' + task.deadline
      });
      task.notifiedDeadline = task.deadline;
      saveTasks();
    } catch (error) {
      notificationStatus.textContent = 'Trình duyệt không gửi được thông báo hệ thống. Hãy theo dõi cảnh báo trong danh sách.';
    }
  }
}
async function checkDeadlines() {
  updateCountdowns();
  // Web Locks tuần tự hóa kiểm tra giữa các tab trên trình duyệt hỗ trợ.
  if (navigator.locks) {
    await navigator.locks.request('focus-list-deadline-check', sendDueNotifications);
  } else sendDueNotifications();
}
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  try { tasks = readTasks(); renderTasks(); } catch (error) { message.textContent = 'Không thể đồng bộ dữ liệu từ tab khác.'; }
});
window.addEventListener('focus', () => { updateNotificationStatus(); checkDeadlines(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { updateNotificationStatus(); checkDeadlines(); }
});
renderTasks();
updateNotificationStatus();
checkDeadlines();
// Bộ hẹn giờ chỉ hoạt động khi trang còn mở; đây không phải push notification.
setInterval(checkDeadlines, 15000);
