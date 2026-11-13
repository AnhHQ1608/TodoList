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
const soundKey = 'focus-list-sound-v1';
let soundEnabled = false;
let audioContext = null;
try { soundEnabled = localStorage.getItem(soundKey) === 'true'; } catch (error) { /* Dùng mặc định tắt. */ }

function readTasks() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved)) throw new Error('Dữ liệu không hợp lệ');
  return saved.filter(task => task && typeof task.id === 'string'
    && typeof task.text === 'string' && typeof task.completed === 'boolean')
    .map(task => ({ ...task,
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
  const overdue = tasks.filter(task => !task.completed && task.deadline && Date.parse(task.deadline) <= Date.now());
  document.getElementById('overdue-alert').hidden = overdue.length === 0;
  const summary = overdue.length ? `${overdue.length} công việc chưa hoàn thành: ${overdue.map(task => task.text).join('; ')}` : '';
  const summaryElement = document.getElementById('overdue-summary');
  if (summaryElement.textContent !== summary) summaryElement.textContent = summary;
}
function resetEditor() {
  editingId = null;
  form.reset();
  updateDeadlineDisplay();
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
  updateDeadlineDisplay();
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
    message.textContent = 'Ngày giờ deadline không hợp lệ.'; document.getElementById('open-picker').focus(); return;
  }
  const deadline = date ? date.toISOString() : null;
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

function updateSoundStatus() {
  const supported = Boolean(window.AudioContext || window.webkitAudioContext);
  const active = soundEnabled && audioContext?.state === 'running';
  const button = document.getElementById('toggle-sound');
  button.disabled = !supported;
  button.setAttribute('aria-pressed', String(active));
  button.textContent = active ? 'Tắt âm báo' : soundEnabled ? 'Kích hoạt lại âm báo' : 'Bật âm báo';
  document.getElementById('test-sound').disabled = !active;
  document.getElementById('sound-status').textContent = !supported ? 'Trình duyệt không hỗ trợ âm báo.'
    : active ? 'Đã bật tiếng click và tiếng nhắc deadline.'
    : soundEnabled ? 'Nhấn kích hoạt lại để cho phép phát âm thanh trong phiên này.' : 'Âm báo đang tắt.';
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
document.getElementById('toggle-sound').addEventListener('click', async () => {
  try {
    if (soundEnabled && audioContext?.state === 'running') {
      soundEnabled = false;
      await audioContext.suspend();
    } else {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { updateSoundStatus(); return; }
      if (!audioContext || audioContext.state === 'closed') audioContext = new Audio();
      await audioContext.resume();
      if (audioContext.state !== 'running') throw new Error('Âm thanh bị chặn');
      soundEnabled = true;
    }
    updateSoundStatus();
    try { localStorage.setItem(soundKey, String(soundEnabled)); } catch (error) {
      document.getElementById('sound-status').textContent += ' Không thể lưu cài đặt âm thanh.';
    }
    await checkDeadlines();
  } catch (error) {
    document.getElementById('sound-status').textContent = 'Không bật được âm báo. Hãy thử lại trong trình duyệt hỗ trợ.';
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
    gain.gain.linearRampToValueAtTime(0.035, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + 0.05);
    return true;
  } catch (error) { return false; } // Lỗi âm thanh không cản thao tác trên trang.
}
async function handleInteractionSound(event) {
  const control = event.target.closest?.('button, input, select, a');
  if (!control || control.disabled || control.matches(':disabled') || control.hidden || !soundEnabled) return;
  // Nút nghe thử có âm riêng; nút bật/tắt không phát tiếng khi người dùng tắt.
  if (control.id === 'toggle-sound' || control.id === 'test-sound') return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    // Click thật có thể kích hoạt lại âm thanh đã được bật ở phiên trước.
    if (!audioContext || audioContext.state === 'closed') audioContext = new Audio();
    if (audioContext.state !== 'running') await audioContext.resume();
    updateSoundStatus();
    playClickSound();
  } catch (error) { /* Không chặn click nếu trình duyệt không cho phát tiếng. */ }
}
document.addEventListener('click', handleInteractionSound, true);

// Lưu riêng dấu nhắc sắp hạn/quá hạn và âm thanh để không báo lặp.
function sendDueNotifications() {
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
        new Notification(overdue ? 'Công việc đã quá hạn!' : 'Công việc sắp đến hạn', {
          body: task.text + ' · ' + deadlineInfo(task).text,
          tag: 'focus-' + (overdue ? 'overdue-' : 'deadline-') + task.id + '-' + task.deadline,
          silent: true // Dùng âm báo riêng, tránh hai tiếng chồng nhau.
        });
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
