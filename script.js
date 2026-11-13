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
const foldersKey = 'focus-list-folders-v1';
const folderSelect = document.getElementById('task-folder');
let folders = [];
let currentFolder = 'all';
const folderIcons = [ ['📁', 'Thư mục'], ['📚', 'Học tập'], ['💼', 'Công việc'], ['🏠', 'Nhà cửa'], ['⚽', 'Thể thao'], ['🎯', 'Mục tiêu'], ['💡', 'Ý tưởng'], ['🎨', 'Sáng tạo'], ['💻', 'Lập trình'], ['🎵', 'Âm nhạc'], ['❤️', 'Sức khỏe'], ['✈️', 'Du lịch'] ];
let selectedFolderIcon = '📁';
function getFolderIcon(folder) {
  return folderIcons.some(([icon]) => icon === folder?.icon) ? folder.icon : '📁';
}
function renderFolderIcons() {
  const container = document.getElementById('folder-icons');
  container.replaceChildren();
  folderIcons.forEach(([icon, title]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = icon;
    button.className = 'folder-icon-choice';
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-pressed', String(selectedFolderIcon === icon));
    button.title = title;
    button.addEventListener('click', () => {
      selectedFolderIcon = icon;
      renderFolderIcons();
      const selected = Array.from(container.children).find(item => item.getAttribute('aria-pressed') === 'true');
      if (selected) selected.focus();
    });
    container.append(button);
  });
}
renderFolderIcons();
const hour = 60 * 60 * 1000;
let tasks = [];
let tasksNeedSaving = false;
let currentFilter = 'all';
let editingId = null;
let notificationTestPending = false;
const soundKey = 'focus-list-sound-v1';
let soundEnabled = true;
let audioContext = null;
try { soundEnabled = localStorage.getItem(soundKey) !== 'false'; } catch (error) { /* Chờ tương tác đầu tiên để phát âm thanh. */ }

// Mỗi mục có ID riêng; công việc cũ hoặc không có mục được giữ ở Chưa phân loại.
function readFolders() {
  const saved = JSON.parse(localStorage.getItem(foldersKey) || '[]');
  if (!Array.isArray(saved)) throw new Error('Danh sách mục không hợp lệ');
  const ids = new Set();
  return saved.filter(folder => {
    if (!folder || typeof folder.id !== 'string' || !folder.id || folder.id === 'all'
      || typeof folder.name !== 'string' || !folder.name.trim() || ids.has(folder.id)) return false;
    ids.add(folder.id);
    return true;
  }).map(folder => ({ ...folder, icon: getFolderIcon(folder) }));
}
try { folders = readFolders(); } catch (error) {
  document.getElementById('folder-message').textContent = 'Không thể đọc các mục đã lưu. Các công việc vẫn được giữ nguyên.';
}
function taskFolderId(task) {
  return folders.some(folder => folder.id === task.folderId) ? task.folderId : '';
}
function updateFolderPicker() {
  const selected = folderSelect.value;
  document.getElementById('folder-selected-icon').textContent = getFolderIcon(folders.find(folder => folder.id === selected));
  document.getElementById('folder-selected-name').textContent = folders.find(folder => folder.id === selected)?.name || 'Chưa phân loại';
  const options = document.getElementById('folder-options');
  options.replaceChildren();
  for (const folder of [{ id: '', name: 'Chưa phân loại' }, ...folders]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-option' + (folder.id === selected ? ' picked' : '');
    button.setAttribute('aria-pressed', String(folder.id === selected));
    const icon = document.createElement('span');
    icon.className = 'folder-option-icon';
    icon.textContent = getFolderIcon(folder);
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'folder-option-name';
    text.textContent = folder.name;
    const check = document.createElement('span');
    check.textContent = folder.id === selected ? '✓' : '';
    check.setAttribute('aria-hidden', 'true');
    button.append(icon, text, check);
    button.addEventListener('click', () => {
      folderSelect.value = folder.id;
      document.getElementById('folder-picker').open = false;
      updateFolderPicker();
      document.getElementById('folder-picker-trigger').focus();
    });
    options.append(button);
  }
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest?.('#folder-picker')) document.getElementById('folder-picker').open = false;
}, true);
document.getElementById('folder-picker').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.getElementById('folder-picker').open = false;
    document.getElementById('folder-picker-trigger').focus();
  }
});
function renderFolders() {
  const selected = folderSelect.value;
  folderSelect.replaceChildren();
  for (const folder of [{ id: '', name: 'Chưa phân loại' }, ...folders]) {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.append(option);
  }
  folderSelect.value = folders.some(folder => folder.id === selected) ? selected : '';
  updateFolderPicker();
  const activeFolder = folders.find(folder => folder.id === currentFolder);
  const deleteFolderButton = document.getElementById('delete-folder');
  deleteFolderButton.hidden = !activeFolder;
  deleteFolderButton.textContent = activeFolder ? `Xóa mục “${activeFolder.name}”` : 'Xóa mục này';
  const container = document.getElementById('folder-filters');
  container.replaceChildren();
  for (const folder of [{ id: 'all', name: 'Tất cả mục' }, { id: '', name: 'Chưa phân loại' }, ...folders]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-chip' + (currentFolder === folder.id ? ' chosen-folder' : '');
    button.setAttribute('aria-pressed', String(currentFolder === folder.id));
    const name = document.createElement('span');
    name.textContent = folder.name;
    const count = document.createElement('span');
    count.className = 'folder-count';
    count.textContent = tasks.filter(task => folder.id === 'all' || taskFolderId(task) === folder.id).length;
    const icon = document.createElement('span');
    icon.className = 'folder-tab-icon';
    icon.textContent = folder.id === 'all' ? '▦' : getFolderIcon(folder);
    icon.setAttribute('aria-hidden', 'true');
    button.append(name, count, icon);
    button.addEventListener('click', () => {
      currentFolder = folder.id;
      renderTasks();
      if (!editingId) folderSelect.value = folder.id === 'all' ? '' : folder.id;
      updateFolderPicker();
      const active = Array.from(document.getElementById('folder-filters').children)
        .find(item => item.getAttribute('aria-pressed') === 'true');
      if (active) active.focus();
    });
    container.append(button);
  }
}
document.getElementById('folder-form').addEventListener('submit', event => {
  event.preventDefault();
  const nameInput = document.getElementById('folder-name');
  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  const status = document.getElementById('folder-message');
  if (!name || name.length > 40) { status.textContent = 'Nhập tên mục từ 1 đến 40 ký tự.'; nameInput.focus(); return; }
  if (['tất cả mục', 'chưa phân loại', ...folders.map(folder => folder.name.toLocaleLowerCase('vi-VN'))].includes(name.toLocaleLowerCase('vi-VN'))) {
    status.textContent = 'Tên mục đã tồn tại. Hãy chọn tên khác.'; nameInput.focus(); return;
  }
  const folder = { id: 'folder-' + Date.now().toString(36) + Math.random().toString(36).slice(2), name, icon: selectedFolderIcon };
  const nextFolders = [...folders, folder];
  try { localStorage.setItem(foldersKey, JSON.stringify(nextFolders)); } catch (error) {
    status.textContent = 'Không thể lưu mục mới. Kiểm tra quyền lưu trữ của trình duyệt.'; return;
  }
  folders = nextFolders;
  currentFolder = folder.id;
  nameInput.value = '';
  renderTasks();
  folderSelect.value = folder.id;
  updateFolderPicker();
  status.textContent = `Đã tạo mục “${name}”. Bạn có thể thêm công việc vào mục này.`;
  input.focus();
});

// Ghi danh sách mục trước. Nếu ghi task thất bại, tham chiếu mục cũ vẫn tự về Chưa phân loại.
document.getElementById('delete-folder').addEventListener('click', () => {
  const folder = folders.find(folder => folder.id === currentFolder);
  if (!folder) return;
  const nextFolders = folders.filter(item => item.id !== folder.id);
  const status = document.getElementById('folder-message');
  try { localStorage.setItem(foldersKey, JSON.stringify(nextFolders)); } catch (error) {
    status.textContent = 'Không thể xóa mục vì chưa lưu được dữ liệu. Hãy thử lại.'; return;
  }
  folders = nextFolders;
  const moved = tasks.filter(task => task.folderId === folder.id).length;
  tasks.forEach(task => { if (task.folderId === folder.id) task.folderId = ''; });
  if (folderSelect.value === folder.id) folderSelect.value = '';
  currentFolder = '';
  const saved = saveTasks();
  renderTasks();
  status.textContent = `Đã xóa mục “${folder.name}”. ${moved} task được giữ trong Chưa phân loại.`
    + (saved ? '' : ' Không lưu được thay đổi task; các task vẫn được hiển thị trong Chưa phân loại.');
  document.getElementById('folder-name').focus();
});

function readTasks() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved)) throw new Error('Dữ liệu không hợp lệ');
  return saved.filter(task => task && typeof task.id === 'string'
    && typeof task.text === 'string' && typeof task.completed === 'boolean')
    .map(task => ({ ...task,
      completedAt: task.completed && Number.isFinite(task.completedAt) && task.completedAt > 0 ? task.completedAt : null,
      folderId: typeof task.folderId === 'string' ? task.folderId : '',
      deadline: typeof task.deadline === 'string' && Number.isFinite(Date.parse(task.deadline))
        ? new Date(task.deadline).toISOString() : null,
      notifiedDeadline: typeof task.notifiedDeadline === 'string' ? task.notifiedDeadline : null,
      overdueNotifiedDeadline: typeof task.overdueNotifiedDeadline === 'string' ? task.overdueNotifiedDeadline : null,
      overdueSoundedDeadline: typeof task.overdueSoundedDeadline === 'string' ? task.overdueSoundedDeadline : null,
      reminderSoundedDeadline: typeof task.reminderSoundedDeadline === 'string' ? task.reminderSoundedDeadline : null
    }));
}
try { tasks = readTasks(); } catch (error) {
  message.textContent = 'Không thể đọc dữ liệu đã lưu. Bạn vẫn có thể tạo danh sách mới.';
}
function saveTasks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    tasksNeedSaving = false;
    message.textContent = '';
    return true;
  } catch (error) {
    tasksNeedSaving = true;
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

// Tự xóa sau 2 giờ hoàn thành. Khi đóng trang, việc dọn diễn ra ở lần mở sau.
function cleanupCompletedTasks(now = Date.now()) {
  let source = tasks;
  // Đọc bản mới nhất trước khi xóa để giữ thay đổi từ tab khác.
  if (!tasksNeedSaving) {
    try { source = readTasks(); } catch (error) { return; }
  }
  let changed = false;
  const remaining = [];
  for (const task of source) {
    if (task.completed && !task.completedAt) {
      task.completedAt = now; // Task cũ chưa có mốc thời gian: bắt đầu tính từ bây giờ.
      changed = true;
    }
    if (task.completed && now - task.completedAt >= 2 * hour) {
      changed = true;
      continue;
    }
    remaining.push(task);
  }
  if (!changed) return;
  tasks = remaining;
  if (editingId && !tasks.some(task => task.id === editingId)) resetEditor();
  saveTasks();
  renderTasks();
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
    const cleanupLabel = document.getElementById('cleanup-' + task.id);
    if (cleanupLabel && task.completedAt) {
      const minutes = Math.max(0, Math.ceil((task.completedAt + 2 * hour - Date.now()) / 60000));
      const hours = Math.floor(minutes / 60);
      cleanupLabel.textContent = minutes === 0 ? 'Đang chờ tự xóa' : `Tự xóa sau ${hours ? hours + ' giờ ' : ''}${minutes % 60 ? minutes % 60 + ' phút' : ''}`;
    }
    const element = document.getElementById('deadline-' + task.id);
    if (!element) return;
    const info = deadlineInfo(task);
    element.textContent = info.text;
    element.className = 'deadline ' + info.className;
  });
  const overdue = tasks.filter(task => !task.completed && task.deadline && Date.parse(task.deadline) <= Date.now());
  document.getElementById('overdue-alert').hidden = overdue.length === 0;
  const summary = overdue.length ? `${overdue.length} công việc chưa hoàn thành: ${overdue.map(task => task.text).join('; ')}` : '';
  const summaryElement = document.getElementById('overdue-summary');
  if (summaryElement.textContent !== summary) summaryElement.textContent = summary;
}
function resetEditor() {
  editingId = null;
  form.reset();
  folderSelect.value = currentFolder === 'all' ? '' : currentFolder;
  document.getElementById('folder-picker').open = false;
  updateFolderPicker();
  updateDeadlineDisplay();
  submitButton.textContent = '＋ Add Task';
  cancelButton.hidden = true;
}
function startEditing(task) {
  editingId = task.id;
  input.value = task.text;
  folderSelect.value = taskFolderId(task);
  updateFolderPicker();
  // datetime-local cần giờ địa phương, không phải chuỗi UTC từ toISOString().
  if (task.deadline) {
    const date = new Date(task.deadline);
    const pad = value => String(value).padStart(2, '0');
    deadlineInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } else deadlineInput.value = '';
  updateDeadlineDisplay();
  submitButton.textContent = 'Lưu thay đổi';
  cancelButton.hidden = false;
  input.focus();
}

// 3. Vẽ danh sách. textContent ngăn nội dung nhập bị chạy như HTML.
function renderTasks() {
  renderFolders();
  list.replaceChildren();
  const visible = tasks.filter(task => (currentFolder === 'all' || taskFolderId(task) === currentFolder)
    && (currentFilter === 'active' ? !task.completed : currentFilter === 'completed' ? task.completed : true));
  visible.forEach(task => {
    const item = document.createElement('li');
    item.className = task.completed ? 'task completed' : 'task';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'task-' + task.id;
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => {
      task.completed = checkbox.checked;
      task.completedAt = task.completed ? Date.now() : null;
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
    const folderBadge = document.createElement('span');
    folderBadge.className = 'task-folder-badge';
    folderBadge.setAttribute('data-icon', getFolderIcon(folders.find(folder => folder.id === taskFolderId(task))));
    folderBadge.textContent = folders.find(folder => folder.id === taskFolderId(task))?.name || 'Chưa phân loại';
    content.append(folderBadge);
    if (task.completed) {
      const cleanupLabel = document.createElement('p');
      cleanupLabel.id = 'cleanup-' + task.id;
      cleanupLabel.className = 'cleanup-label';
      content.append(cleanupLabel);
    }
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
  const scopedTasks = tasks.filter(task => currentFolder === 'all' || taskFolderId(task) === currentFolder);
  const completed = scopedTasks.filter(task => task.completed).length;
  const percent = scopedTasks.length ? Math.round(completed / scopedTasks.length * 100) : 0;
  document.getElementById('task-count').textContent = visible.length + ' công việc';
  document.getElementById('completed-count').textContent = `Đã hoàn thành ${completed} / ${scopedTasks.length} công việc`;
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
    message.textContent = 'Ngày giờ deadline không hợp lệ.'; document.getElementById('open-picker').focus(); return;
  }
  const deadline = date ? date.toISOString() : null;
  const folderId = folders.some(folder => folder.id === folderSelect.value) ? folderSelect.value : '';
  if (editingId) {
    const task = tasks.find(task => task.id === editingId);
    if (!task) { resetEditor(); message.textContent = 'Công việc đã bị xóa ở tab khác.'; return; }
    if (task.deadline !== deadline) {
      task.notifiedDeadline = null;
      task.overdueNotifiedDeadline = null;
      task.overdueSoundedDeadline = null;
      task.reminderSoundedDeadline = null;
    }
    task.text = text;
    task.deadline = deadline;
    task.folderId = folderId;
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    tasks.push({ id, text, completed: false, completedAt: null, deadline, folderId, notifiedDeadline: null });
    setFilter('all');
  }
  if (currentFolder !== 'all') currentFolder = folderId;
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
  document.getElementById('test-notification').disabled = notificationTestPending
    || !('Notification' in window) || !window.isSecureContext || Notification.permission === 'denied';
  document.getElementById('test-notification-now').disabled = document.getElementById('test-notification').disabled;
  document.getElementById('notification-diagnostics').textContent = 'Quyền thông báo: '
    + (!('Notification' in window) ? 'không hỗ trợ' : Notification.permission)
    + ' · Kết nối an toàn: ' + (window.isSecureContext ? 'có' : 'không')
    + ' · Service worker: ' + ('serviceWorker' in navigator ? 'có hỗ trợ' : 'không hỗ trợ');
  if (!('Notification' in window) || !window.isSecureContext) {
    notificationStatus.textContent = 'Thông báo không khả dụng. Hãy dùng trình duyệt hỗ trợ trên HTTPS hoặc localhost.';
    notificationButton.disabled = true;
  } else if (Notification.permission === 'granted') {
    notificationStatus.textContent = 'Đã cấp quyền thông báo hệ thống, kể cả khi bạn ở tab/app khác. Giữ trang mở và thử nút gửi thử.';
    notificationButton.textContent = 'Đã bật thông báo';
    notificationButton.disabled = true;
  } else if (Notification.permission === 'denied') {
    notificationStatus.textContent = 'Quyền đã bị chặn. Hãy cho phép thông báo trong cài đặt trang của trình duyệt.';
    notificationButton.textContent = 'Thông báo bị chặn';
    notificationButton.disabled = true;
  } else {
    notificationStatus.textContent = 'Bật để nhận nhắc sắp đến hạn và thông báo quá hạn.';
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

let notificationRegistration = null;
function getNotificationRegistration() {
  if (!notificationRegistration) {
    notificationRegistration = (async () => {
      let timeout;
      try {
        return await Promise.race([
          (async () => {
            const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
            return registration.active ? registration : await navigator.serviceWorker.ready;
          })(),
          new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Service worker chưa sẵn sàng sau 10 giây. Hãy tải lại trang và thử lại.')), 10000);
          })
        ]);
      } finally { clearTimeout(timeout); }
    })().catch(error => { notificationRegistration = null; throw error; });
  }
  return notificationRegistration;
}
// Ưu tiên thông báo bền vững của service worker, hỗ trợ nhiều trình duyệt hơn.
function sendDesktopNotification(title, options, onFailure) {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    return getNotificationRegistration().then(async registration => {
      await registration.showNotification(title, { ...options, requireInteraction: true, renotify: Boolean(options.tag) });
      document.getElementById('notification-diagnostics').textContent = 'Trình duyệt đã chấp nhận thông báo qua service worker. Không thể xác nhận Windows có hiện banner hay không. Nếu không thấy, nhấn Win + N để kiểm tra trung tâm thông báo.';
    });
  }
  const notification = new Notification(title, { ...options, requireInteraction: true });
  notification.onclick = event => {
    event.preventDefault();
    window.focus();
    notification.close();
  };
  notification.onerror = () => {
    if (onFailure) onFailure();
    notificationStatus.textContent = 'Không hiển thị được thông báo hệ thống. Kiểm tra quyền trang, cài đặt thông báo của trình duyệt và chế độ Không làm phiền.';
  };
  return notification;
}
async function runNotificationTest(delay = 5000) {
  if (notificationTestPending || !('Notification' in window) || !window.isSecureContext) return;
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
    updateNotificationStatus();
    if (Notification.permission !== 'granted') return;
    notificationTestPending = true;
    document.getElementById('test-notification').disabled = true;
    document.getElementById('test-notification-now').disabled = true;
    notificationStatus.textContent = 'Sẽ gửi sau 5 giây. Bây giờ hãy chuyển sang tab hoặc ứng dụng khác.';
    const sendTest = async () => {
      try {
        if (Notification.permission !== 'granted') return;
        await sendDesktopNotification('Focus List · Thông báo thử', {
          body: 'Bạn vẫn nhận được thông báo khi dùng tab hoặc app khác. Bấm thông báo để quay lại TodoList.',
          tag: 'focus-desktop-test-' + Date.now(), silent: !soundEnabled
        });
        notificationStatus.textContent = 'Đã gửi yêu cầu thông báo thử. Nếu không thấy banner, kiểm tra cài đặt thông báo của hệ điều hành và trình duyệt.';
      } catch (error) {
        notificationStatus.textContent = 'Trình duyệt không gửi được thông báo hệ thống. Hãy thử Chrome hoặc Edge trên máy tính và kiểm tra quyền thông báo.';
        document.getElementById('notification-diagnostics').textContent = `Lỗi: ${error.name || 'Error'} · ${error.message || 'Không rõ nguyên nhân'}`;
      } finally {
        notificationTestPending = false;
        document.getElementById('test-notification').disabled = Notification.permission === 'denied';
        document.getElementById('test-notification-now').disabled = Notification.permission === 'denied';
      }
    };
    if (delay) setTimeout(sendTest, delay);
    else { notificationStatus.textContent = 'Đang gửi thông báo hệ thống…'; await sendTest(); }
  } catch (error) { notificationStatus.textContent = 'Không thể xin quyền thông báo. Hãy kiểm tra cài đặt trang của trình duyệt.'; }
}
document.getElementById('test-notification').addEventListener('click', () => runNotificationTest(5000));
document.getElementById('test-notification-now').addEventListener('click', () => runNotificationTest(0));

function updateSoundStatus() {
  const supported = Boolean(window.AudioContext || window.webkitAudioContext);
  const active = soundEnabled && audioContext?.state === 'running';
  const toggle = document.getElementById('toggle-sound');
  toggle.disabled = !supported;
  toggle.checked = soundEnabled;
  document.getElementById('test-sound').disabled = !active;
  document.getElementById('sound-status').textContent = supported ? '' : 'Trình duyệt không hỗ trợ âm thanh.';
}
function playAlertSound(overdue = false) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return false;
  try {
    const frequencies = overdue ? [660, 520, 660] : [660, 880];
    frequencies.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + index * 0.22;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
    return true;
  } catch (error) {
    document.getElementById('sound-status').textContent = 'Không phát được âm báo. Hãy thử kích hoạt lại.';
    return false;
  }
}
document.getElementById('toggle-sound').addEventListener('change', async () => {
  const toggle = document.getElementById('toggle-sound');
  try {
    if (toggle.checked) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { updateSoundStatus(); return; }
      if (!audioContext || audioContext.state === 'closed') audioContext = new Audio();
      await audioContext.resume();
      if (audioContext.state !== 'running') throw new Error('Âm thanh bị chặn');
      soundEnabled = true;
    } else {
      soundEnabled = false;
      if (audioContext?.state === 'running') await audioContext.suspend();
    }
    updateSoundStatus();
    try { localStorage.setItem(soundKey, String(soundEnabled)); } catch (error) {
      document.getElementById('sound-status').textContent = 'Không thể lưu cài đặt âm thanh.';
    }
    await checkDeadlines();
  } catch (error) {
    toggle.checked = soundEnabled;
    document.getElementById('sound-status').textContent = 'Không bật được âm thanh trên trình duyệt này.';
  }
});
document.getElementById('test-sound').addEventListener('click', () => playAlertSound(true));

// Bắt click ở document để các nút vừa tạo (công việc, lịch) cũng có tiếng.
function playClickSound() {
  if (!soundEnabled || audioContext?.state !== 'running') return false;
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1100, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + 0.1);
    return true;
  } catch (error) { return false; } // Lỗi âm thanh không cản thao tác trên trang.
}
let lastPointerControl = null;
let lastPointerTime = 0;
async function activateAudioFromGesture() {
  if (!soundEnabled) return false;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    if (!audioContext || audioContext.state === 'closed') audioContext = new Audio();
    if (audioContext.state !== 'running') await audioContext.resume();
    updateSoundStatus();
    return audioContext.state === 'running';
  } catch (error) {
    document.getElementById('sound-status').textContent = 'Trình duyệt đang chặn âm thanh. Bạn có thể nhấn nút âm thanh để thử lại.';
    return false;
  }
}
async function handleInteractionSound(event) {
  if (event.type === 'pointerdown' && event.button > 0) return;
  let control = event.target.closest?.('button, input, select, summary, a, label');
  // Bấm chữ của checkbox cũng chỉ phát một tiếng cho checkbox tương ứng.
  if (control?.tagName === 'LABEL') control = control.control;
  if (!soundEnabled) return;
  if (!control) { await activateAudioFromGesture(); return; }
  if (control.disabled || control.matches(':disabled') || control.hidden) return;
  // Nút nghe thử có âm riêng; nút bật/tắt không phát tiếng khi người dùng tắt.
  if (control.id === 'toggle-sound' || control.id === 'test-sound') return;
  if (event.type === 'pointerdown') {
    lastPointerControl = control;
    lastPointerTime = Date.now();
  } else if (event.type === 'click' && control === lastPointerControl && Date.now() - lastPointerTime < 1500) {
    lastPointerControl = null;
    return; // pointerdown đã phát tiếng; không phát lần hai khi click tiếp theo đến.
  }
  if (await activateAudioFromGesture()) playClickSound();
}
document.addEventListener('pointerdown', handleInteractionSound, true);
document.addEventListener('click', handleInteractionSound, true);
document.addEventListener('keydown', event => {
  if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) return activateAudioFromGesture();
});

// Lưu riêng dấu nhắc sắp hạn/quá hạn và âm thanh để không báo lặp.
async function sendDueNotifications() {
  const canNotify = 'Notification' in window && Notification.permission === 'granted' && window.isSecureContext;
  let saved = [];
  try { saved = readTasks(); } catch (error) { /* Vẫn dùng trạng thái trong bộ nhớ. */ }
  let soundPlayed = false;
  let changed = false;
  // Ưu tiên tiếng quá hạn nếu nhiều sự kiện xuất hiện cùng lúc.
  const ordered = [...tasks].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  for (const task of ordered) {
    if (task.completed || !task.deadline) continue;
    const remaining = Date.parse(task.deadline) - Date.now();
    if (remaining > hour) continue;
    const overdue = remaining <= 0;
    const notificationField = overdue ? 'overdueNotifiedDeadline' : 'notifiedDeadline';
    const soundField = overdue ? 'overdueSoundedDeadline' : 'reminderSoundedDeadline';
    const stored = saved.find(item => item.id === task.id);
    if (stored && (stored.completed || stored.deadline !== task.deadline)) continue;
    for (const field of [notificationField, soundField]) {
      if (stored && stored[field] === task.deadline) task[field] = task.deadline;
    }
    if (canNotify && task[notificationField] !== task.deadline) {
      try {
        const notificationDeadline = task.deadline;
        const delivery = sendDesktopNotification(overdue ? 'Công việc đã quá hạn!' : 'Công việc sắp đến hạn', {
          body: task.text + ' · ' + deadlineInfo(task).text,
          tag: 'focus-' + (overdue ? 'overdue-' : 'deadline-') + task.id + '-' + task.deadline,
          silent: true // Dùng âm báo riêng, tránh hai tiếng chồng nhau.
        }, () => {
          // Lỗi bất đồng bộ: cho phép thử lại ở lần kiểm tra kế tiếp.
          if (task.deadline === notificationDeadline && task[notificationField] === notificationDeadline) {
            task[notificationField] = null;
            saveTasks();
          }
        });
        if (delivery && typeof delivery.then === 'function') await delivery;
        task[notificationField] = task.deadline;
        changed = true;
      } catch (error) {
        notificationStatus.textContent = 'Trình duyệt không gửi được thông báo hệ thống. Hãy theo dõi cảnh báo trong danh sách.';
      }
    }
    if (task[soundField] !== task.deadline && (soundPlayed || playAlertSound(overdue))) {
      soundPlayed = true;
      task[soundField] = task.deadline;
      changed = true;
    }
  }
  if (changed) saveTasks();
}
async function checkDeadlines() {
  const runChecks = async () => {
    cleanupCompletedTasks();
    updateCountdowns();
    await sendDueNotifications();
  };
  // Web Locks tuần tự hóa kiểm tra giữa các tab trên trình duyệt hỗ trợ.
  if (navigator.locks) {
    await navigator.locks.request('focus-list-deadline-check', runChecks);
  } else await runChecks();
}
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== foldersKey && event.key !== null) return;
  try {
    folders = readFolders();
    tasks = readTasks();
    if (currentFolder !== 'all' && !folders.some(folder => folder.id === currentFolder)) currentFolder = 'all';
    renderTasks();
  } catch (error) { message.textContent = 'Không thể đồng bộ dữ liệu từ tab khác.'; }
});
window.addEventListener('focus', () => { updateNotificationStatus(); updateSoundStatus(); checkDeadlines(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { updateNotificationStatus(); checkDeadlines(); }
});
renderTasks();
updateNotificationStatus();
updateSoundStatus();
checkDeadlines();
// Bộ hẹn giờ chỉ hoạt động khi trang còn mở; đây không phải push notification.
setInterval(checkDeadlines, 15000);

// 6. Bộ chọn lịch riêng. Chỉ ghi vào deadline thật khi nhấn Xác nhận.
const picker = document.getElementById('date-picker');
const calendarDays = document.getElementById('calendar-days');
const hourSelect = document.getElementById('picker-hour');
const minuteSelect = document.getElementById('picker-minute');
let selectedDate = null;
let calendarMonth = null;
const padDate = value => String(value).padStart(2, '0');
function localDateValue(date) {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}T${padDate(date.getHours())}:${padDate(date.getMinutes())}`;
}
function updateDeadlineDisplay() {
  document.getElementById('deadline-display').textContent = deadlineInput.value
    ? new Date(deadlineInput.value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : 'Chọn ngày & giờ';
}
function updatePickerPreview() {
  const date = new Date(selectedDate);
  date.setHours(Number(hourSelect.value), Number(minuteSelect.value), 0, 0);
  document.getElementById('picker-preview').textContent = date.toLocaleString('vi-VN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
}
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function renderCalendar() {
  calendarDays.replaceChildren();
  document.getElementById('calendar-month').textContent = `Tháng ${calendarMonth.getMonth() + 1}, ${calendarMonth.getFullYear()}`;
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  // Tuần bắt đầu bằng thứ Hai; hiển thị đủ 6 hàng để lịch không nhảy chiều cao.
  const offset = (first.getDay() + 6) % 7;
  for (let index = 0; index < 42; index++) {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + index);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = date.getDate();
    button.className = 'calendar-day';
    if (date.getMonth() !== calendarMonth.getMonth()) button.className += ' outside';
    if (sameDay(date, new Date())) { button.className += ' today'; button.setAttribute('aria-current', 'date'); }
    const chosen = sameDay(date, selectedDate);
    if (chosen) button.className += ' chosen';
    button.setAttribute('aria-pressed', String(chosen));
    button.setAttribute('aria-label', date.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    button.addEventListener('click', () => {
      selectedDate = date;
      calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      renderCalendar();
      const active = Array.from(calendarDays.children).find(day => day.getAttribute('aria-pressed') === 'true');
      if (active) active.focus();
    });
    calendarDays.append(button);
  }
  updatePickerPreview();
}
function openDatePicker() {
  selectedDate = deadlineInput.value ? new Date(deadlineInput.value) : new Date();
  calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  hourSelect.value = padDate(selectedDate.getHours());
  minuteSelect.value = padDate(selectedDate.getMinutes());
  renderCalendar();
  picker.showModal(); // dialog hỗ trợ Escape, giữ focus và chặn tương tác phía sau.
}
for (const [select, count] of [[hourSelect, 24], [minuteSelect, 60]]) {
  for (let value = 0; value < count; value++) {
    const option = document.createElement('option');
    option.value = padDate(value);
    option.textContent = padDate(value);
    select.append(option);
  }
  select.addEventListener('change', updatePickerPreview);
}
document.getElementById('open-picker').addEventListener('click', openDatePicker);
function closeDatePicker() { picker.close(); document.getElementById('open-picker').focus(); }
document.getElementById('close-picker').addEventListener('click', closeDatePicker);
document.getElementById('cancel-picker').addEventListener('click', closeDatePicker);
picker.addEventListener('click', event => { if (event.target === picker) {
  const bounds = picker.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDatePicker();
} });
for (const [id, step] of [['previous-month', -1], ['next-month', 1]]) {
  document.getElementById(id).addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + step, 1);
    renderCalendar();
  });
}
for (const [id, offset] of [['pick-today', 0], ['pick-tomorrow', 1]]) {
  document.getElementById(id).addEventListener('click', () => {
    const now = new Date();
    selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderCalendar();
  });
}
document.getElementById('apply-deadline').addEventListener('click', () => {
  const date = new Date(selectedDate);
  date.setHours(Number(hourSelect.value), Number(minuteSelect.value), 0, 0);
  deadlineInput.value = localDateValue(date);
  updateDeadlineDisplay();
  closeDatePicker();
});
document.getElementById('clear-deadline').addEventListener('click', () => {
  deadlineInput.value = '';
  updateDeadlineDisplay();
  closeDatePicker();
});
updateDeadlineDisplay();

// Cài đặt được mở từ nút bánh răng trên đầu trang.
const settingsDialog = document.getElementById('settings-dialog');
const settingsButton = document.getElementById('open-settings');
settingsButton.addEventListener('click', () => {
  updateNotificationStatus();
  updateSoundStatus();
  settingsDialog.showModal();
});
function closeSettings() { settingsDialog.close(); settingsButton.focus(); }
document.getElementById('close-settings').addEventListener('click', closeSettings);
settingsDialog.addEventListener('click', event => {
  if (event.target !== settingsDialog) return;
  const bounds = settingsDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSettings();
});

// Hiệu ứng bấm/chạm, tách biệt với âm thanh và logic công việc.
function showClickEffect(x, y, target) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const container = target?.closest?.('dialog[open]') || document.getElementById('click-effects');
  // Tối đa 10 hiệu ứng đang chạy để không tích lũy phần tử khi click nhanh.
  const effects = container.querySelectorAll('.click-ripple');
  if (effects.length >= 10) effects[0].remove();
  const ripple = document.createElement('span');
  ripple.className = 'click-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.setProperty('--click-x', x + 'px');
  ripple.style.setProperty('--click-y', y + 'px');
  container.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  setTimeout(() => ripple.remove(), 800); // Dọn cả khi tab bị ẩn giữa hiệu ứng.
}
document.addEventListener('pointerup', event => {
  if (event.button > 0) return;
  showClickEffect(event.clientX, event.clientY, event.target);
}, true);
document.addEventListener('keyup', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const control = event.target.closest?.('button, summary, a');
  if (!control) return;
  const bounds = control.getBoundingClientRect();
  showClickEffect(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, control);
});
