// 1. Lấy các phần tử HTML và khởi tạo trạng thái ứng dụng.
const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const list = document.getElementById('task-list');
const message = document.getElementById('message');
const filters = document.querySelectorAll('[data-filter]');
const storageKey = 'focus-list-tasks-v1';
let tasks = [];
let currentFilter = 'all';

// 2. Đọc dữ liệu đã lưu; dữ liệu hỏng không làm dừng ứng dụng.
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved)) throw new Error('Dữ liệu không hợp lệ');
  tasks = saved.filter(task => task && typeof task.id === 'string'
    && typeof task.text === 'string' && typeof task.completed === 'boolean');
} catch (error) {
  message.textContent = 'Không thể đọc dữ liệu đã lưu. Bạn vẫn có thể tạo danh sách mới.';
}

function saveTasks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    message.textContent = '';
  } catch (error) {
    message.textContent = 'Không thể lưu dữ liệu. Hãy kiểm tra quyền lưu trữ của trình duyệt.';
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

// 3. Vẽ danh sách. Dùng textContent để nội dung nhập không bị chạy như mã HTML.
function renderTasks() {
  list.replaceChildren();
  const visible = tasks.filter(task => {
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });

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
      // Giữ vị trí bàn phím sau khi vẽ lại danh sách.
      const target = document.getElementById(checkbox.id)
        || document.querySelector('.filters .selected');
      target.focus();
    });

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = task.text;
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = '×';
    deleteButton.setAttribute('aria-label', 'Xóa công việc: ' + task.text);
    deleteButton.addEventListener('click', () => {
      tasks = tasks.filter(existing => existing.id !== task.id);
      saveTasks();
      renderTasks();
      input.focus();
    });
    item.append(checkbox, label, deleteButton);
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
}

// 4. Thêm bằng nút Add Task hoặc Enter; bỏ khoảng trắng thừa.
form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    message.textContent = 'Vui lòng nhập nội dung công việc.';
    input.focus();
    return;
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  tasks.push({ id, text, completed: false });
  setFilter('all'); // Luôn hiển thị công việc vừa thêm.
  saveTasks();
  renderTasks();
  form.reset();
  input.focus();
});

// 5. Xử lý các nút lọc và hiển thị dữ liệu khi mở trang.
filters.forEach(button => {
  button.addEventListener('click', () => {
    setFilter(button.dataset.filter);
    renderTasks();
  });
});
renderTasks();
