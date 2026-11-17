// 1. Trạng thái ứng dụng. Giữ khóa cũ để không mất công việc đã lưu.
const form = document.getElementById('task-form');
const appLocale = () => window.todoLanguage?.locale || 'vi-VN';
const input = document.getElementById('task-input');
const deadlineInput = document.getElementById('deadline-input');
const submitButton = document.getElementById('submit-task');
const cancelButton = document.getElementById('cancel-edit');
const notificationButton = document.getElementById('enable-notifications');
const notificationStatus = document.getElementById('notification-status');
const list = document.getElementById('task-list');
const message = document.getElementById('message');
const filters = document.querySelectorAll('[data-filter]');
const storageKey = window.todoAccount?.storageKey || 'focus-list-tasks-v1';
function recordActivity(action) {
  try { window.todoActivity?.track(action)?.catch(() => {}); } catch { /* Ghi lịch sử không được làm gián đoạn công việc. */ }
}
const foldersKey = window.todoAccount?.foldersKey || 'focus-list-folders-v1';
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
const taskDateInput = document.getElementById('task-date');
const repeatInput = document.getElementById('task-repeat');
const routinesKey = window.todoAccount?.routinesKey || 'focus-list-routines-v1';
// Lịch lặp là mẫu riêng; task của mỗi ngày có ID riêng để hoàn thành độc lập.
const weekdayNames = ['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ nhật'];
let selectedDay = 'all';
let visibleWeek = weekStart(new Date(Date.now()));
let repeatWeekdays = new Set();
let routines = [];
const overdueHistoryKey = window.todoAccount?.overdueHistoryKey || 'focus-list-overdue-history-v1';
let overdueHistory=[];
const overdueHistoryLifetime=10*24*60*60*1000;
let restoringHistoryId=null;
function readOverdueHistory() {
  const saved=JSON.parse(localStorage.getItem(overdueHistoryKey) || '[]');
  if(!Array.isArray(saved))throw Error('Lịch sử không hợp lệ');
  return saved.filter(item=>item && typeof item.id==='string' && item.task && typeof item.task.id==='string' && typeof item.task.text==='string' && Number.isFinite(Date.parse(item.task.deadline)));
}
try {overdueHistory=readOverdueHistory();} catch {message.textContent='Không đọc được lịch sử quá hạn; các task hiện tại vẫn được giữ.';}
function saveOverdueHistory(next) {
  try {localStorage.setItem(overdueHistoryKey,JSON.stringify(next));overdueHistory=next;window.todoAccount?.save();return true;}
  catch {message.textContent='Không lưu được lịch sử quá hạn trên thiết bị này.';return false;}
}
function captureOverdueHistory(taskSource=tasks) {
  let latest;try {latest=readOverdueHistory();}catch{return false;}
  const original=JSON.stringify(latest);
  latest=latest.filter(entry=>Date.parse(entry.task.deadline)>Date.now()-overdueHistoryLifetime);
  let changed=JSON.stringify(latest)!==original;
  for(const task of taskSource){
    if(!task.deadline || Date.parse(task.deadline)>Date.now() || (task.completed && !(task.completedAt>Date.parse(task.deadline))))continue;
    if(Date.parse(task.deadline)<=Date.now()-overdueHistoryLifetime)continue;
    const id=task.id+':'+task.deadline;
    if(!latest.some(item=>item.id===id)){latest.push({id,task:{...task},recordedAt:Date.now(),restoredAt:null,completedAt:task.completed?task.completedAt:null});changed=true;}
  }
  latest=latest.map(item=>{
    const task=taskSource.find(task=>task.id===item.task.id && task.deadline===item.task.deadline);
    const completedAt=task ? (task.completed?task.completedAt:null) : item.completedAt;
    if(completedAt!==item.completedAt){changed=true;return {...item,completedAt};}
    return item;
  });
  latest=latest.sort((a,b)=>Date.parse(a.task.deadline)-Date.parse(b.task.deadline)||a.id.localeCompare(b.id)).slice(-500);
  if(changed && JSON.stringify(latest)!==original)return saveOverdueHistory(latest);
  overdueHistory=latest;return true;
}
function renderOverdueHistory() {
  const list=document.getElementById('overdue-history-list');list.replaceChildren();
  document.getElementById('overdue-history-count').textContent=String(overdueHistory.length);
  if(!overdueHistory.length){const empty=document.createElement('p');empty.className='help';empty.textContent='Chưa có công việc quá hạn.';list.append(empty);return;}
  [...overdueHistory].reverse().forEach(entry=>{
    const row=document.createElement('article');row.className='history-task';
    const content=document.createElement('div');
    const title=document.createElement('strong');title.textContent=entry.task.text;title.setAttribute('data-no-translate','');
    const deadline=document.createElement('p');deadline.textContent='Hạn cũ · '+new Date(entry.task.deadline).toLocaleString(appLocale());
    const state=document.createElement('small');
    const active=tasks.some(task=>task.id===entry.task.id && task.deadline===entry.task.deadline && !task.completed);
    state.textContent=entry.restoredAt?'Đã khôi phục':entry.completedAt?'Đã hoàn thành':active?'Đang quá hạn':'Không còn trong danh sách';
    content.append(title,deadline,state);
    const restore=document.createElement('button');restore.type='button';restore.className='secondary';restore.textContent=entry.restoredAt?'Đã khôi phục':'Khôi phục';restore.disabled=Boolean(entry.restoredAt);
    restore.addEventListener('click',()=>beginHistoryRestore(entry));row.append(content,restore);list.append(row);
  });
}
function beginHistoryRestore(entry) {
  try {overdueHistory=readOverdueHistory();}catch{message.textContent='Không đọc được lịch sử để khôi phục.';return;}
  entry=overdueHistory.find(item=>item.id===entry.id);
  if(!entry || entry.restoredAt || Date.parse(entry.task.deadline)<=Date.now()-overdueHistoryLifetime){message.textContent='Bản ghi đã hết hạn hoặc đã được khôi phục.';captureOverdueHistory();renderOverdueHistory();return;}
  const existing=tasks.find(task=>task.id===entry.task.id && task.deadline===entry.task.deadline && !task.completed);
  resetEditor();
  if(existing)startEditing(existing);else {input.value=entry.task.text;folderSelect.value=folders.some(folder=>folder.id===entry.task.folderId)?entry.task.folderId:'';updateFolderPicker();}
  restoringHistoryId=entry.id;
  document.getElementById('task-options').open=true;
  repeatInput.checked=false;repeatWeekdays=new Set();updateRepeatEditor();
  taskDateInput.value=dayKey(new Date(Date.now()));deadlineInput.value='';updateDeadlineDisplay();updateScheduleDisplay();
  selectedDay='all';currentFolder='all';setFilter('all');renderTasks();
  submitButton.textContent='Khôi phục task';cancelButton.hidden=false;
  message.textContent='Chọn ngày và deadline mới trong tương lai để khôi phục công việc.';
  form.scrollIntoView?.({behavior:'smooth',block:'center'});input.focus();
}
document.getElementById('open-overdue-history').addEventListener('click',()=>{const panel=document.getElementById('overdue-history');panel.open=true;panel.scrollIntoView?.({behavior:'smooth',block:'center'});});
function dayKey(date) {
  return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value+'T12:00:00').getTime()) && dayKey(new Date(value+'T12:00:00')) === value;
}
function weekStart(value) {
  const date=new Date(value);date.setHours(12,0,0,0);date.setDate(date.getDate()-(date.getDay()+6)%7);return date;
}
function weekDates(start) {
  return Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(date.getDate()+index);return dayKey(date);});
}
function readRoutines() {
  const saved=JSON.parse(localStorage.getItem(routinesKey) || '[]');
  if(!Array.isArray(saved))throw Error('Lịch lặp không hợp lệ');
  return saved.filter(item=>item && typeof item.id==='string' && typeof item.text==='string' && validDay(item.startDate) && Array.isArray(item.weekdays))
    .map(item=>({...item,weekdays:[...new Set(item.weekdays.filter(day=>Number.isInteger(day)&&day>=1&&day<=7))],deadlineTime:typeof item.deadlineTime==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.deadlineTime)?item.deadlineTime:null,excludedDates:Array.isArray(item.excludedDates)?item.excludedDates.filter(validDay):[]}));
}
try { routines=readRoutines(); } catch { message.textContent='Không đọc được lịch lặp. Các task hiện có vẫn được giữ.'; }
function saveRoutines(next) {
  try {localStorage.setItem(routinesKey,JSON.stringify(next));routines=next;window.todoAccount?.save();return true;}
  catch {message.textContent='Không lưu được lịch lặp. Hãy kiểm tra bộ nhớ trình duyệt.';return false;}
}
function markOccurrence(task, excluded) {
  if(!task.routineId || !validDay(task.scheduledDate))return true;
  try {routines=readRoutines();} catch {return false;}
  return saveRoutines(routines.map(item=>item.id!==task.routineId?item:{...item,excludedDates:excluded?[...new Set([...item.excludedDates,task.scheduledDate])]:item.excludedDates.filter(date=>date!==task.scheduledDate)}));
}
function ensureWeekOccurrences() {
  const dates=[...new Set([...weekDates(weekStart(new Date())),...weekDates(visibleWeek)])];
  const ids=new Set(tasks.map(task=>task.id));let changed=false;
  for(const routine of routines)for(const date of dates){
    const weekday=(new Date(date+'T12:00:00').getDay()+6)%7+1;
    const id='repeat-'+routine.id+'-'+date;
    if(date<routine.startDate || !routine.weekdays.includes(weekday) || routine.excludedDates.includes(date) || ids.has(id) || tasks.length>=2000)continue;
    const deadline=routine.deadlineTime ? new Date(date+'T'+routine.deadlineTime).toISOString() : null;
    tasks.push({id,text:routine.text,completed:false,completedAt:null,folderId:routine.folderId || '',scheduledDate:date,routineId:routine.id,deadline,notifiedDeadline:null});ids.add(id);changed=true;
  }
  if(changed)saveTasks();
  return changed;
}
function matchesDay(task) {
  return selectedDay==='all' || (selectedDay==='unscheduled'?!task.scheduledDate:selectedDay==='week'?weekDates(visibleWeek).includes(task.scheduledDate):task.scheduledDate===selectedDay);
}
function selectDay(value) {
  if(validDay(value) && value<dayKey(new Date(Date.now())))return;
  selectedDay=value;
  if(!editingId){taskDateInput.value=validDay(value)?value:'';syncDeadlineWithSchedule();}
  renderTasks();
}
// Khi đổi ngày thực hiện, giữ giờ đã nhập nhưng đưa deadline về đúng ngày đó.
function syncDeadlineWithSchedule() {
  if(repeatInput.checked || !validDay(taskDateInput.value) || !deadlineInput.value)return;
  const existing=new Date(deadlineInput.value);
  if(!Number.isFinite(existing.getTime()))return;
  deadlineInput.value=taskDateInput.value+'T'+String(existing.getHours()).padStart(2,'0')+':'+String(existing.getMinutes()).padStart(2,'0');
  updateDeadlineDisplay();
}
function updateScheduleDisplay() {
  document.getElementById('task-date-display').textContent=validDay(taskDateInput.value)?new Date(taskDateInput.value+'T12:00:00').toLocaleDateString(appLocale(),{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}):'Chọn ngày';
  updateDeadlineDisplay();
}
function updateTaskOptionsSummary() {
  const parts=[];
  if(validDay(taskDateInput.value))parts.push(new Date(taskDateInput.value+'T12:00:00').toLocaleDateString(appLocale(),{day:'2-digit',month:'2-digit'}));
  if(repeatInput.checked)parts.push('Lặp '+repeatWeekdays.size+' ngày/tuần');
  else if(deadlineInput.value && Number.isFinite(new Date(deadlineInput.value).getTime()))parts.push(new Date(deadlineInput.value).toLocaleTimeString(appLocale(),{hour:'2-digit',minute:'2-digit',hour12:false}));
  document.getElementById('task-options-summary').textContent=parts.join(' · ') || 'Không bắt buộc';
}
function handleScheduleChange() {
  if(validDay(taskDateInput.value) && taskDateInput.value<dayKey(new Date(Date.now()))){message.textContent='Không thể chọn ngày trong quá khứ.';return;}
  updateScheduleDisplay();
  syncDeadlineWithSchedule();
  if(!editingId && validDay(selectedDay)){
    if(validDay(taskDateInput.value)){selectedDay=taskDateInput.value;visibleWeek=weekStart(new Date(selectedDay+'T12:00:00'));}
    else if(!taskDateInput.value)selectedDay='unscheduled';
    renderTasks();
  }
}
taskDateInput.addEventListener('change',handleScheduleChange);
function renderWeekPlanner() {
  const today=dayKey(new Date(Date.now()));
  taskDateInput.min=today;
  document.getElementById('week-previous').disabled=visibleWeek.getTime()<=weekStart(new Date(Date.now())).getTime();
  updateScheduleDisplay();
  const dates=weekDates(visibleWeek);
  document.getElementById('week-range').textContent=new Date(dates[0]+'T12:00:00').toLocaleDateString(appLocale(),{day:'numeric',month:'2-digit'})+' – '+new Date(dates[6]+'T12:00:00').toLocaleDateString(appLocale(),{day:'numeric',month:'2-digit',year:'numeric'});
  const container=document.getElementById('week-days');container.replaceChildren();
  dates.forEach((date,index)=>{
    const button=document.createElement('button');button.type='button';button.className='week-day';button.id='week-day-'+date;button.setAttribute('aria-pressed',String(selectedDay===date));button.setAttribute('aria-label',weekdayNames[index]+', '+date);
    button.disabled=date<today;
    if(date===today)button.className+=' is-today';
    const label=document.createElement('span');label.textContent=index===6?'CN':'T'+(index+2);
    const number=document.createElement('strong');number.textContent=String(Number(date.slice(-2)));
    const count=document.createElement('small');count.textContent=String(tasks.filter(task=>task.scheduledDate===date&&(currentFolder==='all'||taskFolderId(task)===currentFolder)&&(currentFilter==='active'?!task.completed:currentFilter==='completed'?task.completed:true)).length);
    button.append(label,number,count);button.addEventListener('click',()=>{selectDay(date);document.getElementById('week-day-'+date)?.focus();});container.append(button);
  });
  for(const [id,value] of [['week-all','all'],['week-whole','week'],['week-unscheduled','unscheduled']])document.getElementById(id).setAttribute('aria-pressed',String(selectedDay===value));
}
function renderRepeatDays() {
  const container=document.getElementById('repeat-days');container.replaceChildren();
  weekdayNames.forEach((name,index)=>{const day=index+1;const button=document.createElement('button');button.type='button';button.id='repeat-weekday-'+day;button.textContent=index===6?'CN':'T'+(index+2);button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(repeatWeekdays.has(day)));button.addEventListener('click',()=>{if(repeatWeekdays.has(day))repeatWeekdays.delete(day);else repeatWeekdays.add(day);renderRepeatDays();document.getElementById('repeat-weekday-'+day)?.focus();});container.append(button);});
  updateTaskOptionsSummary();
}
function updateRepeatEditor() {
  updateScheduleDisplay();
  document.getElementById('repeat-options').hidden=!repeatInput.checked;
  document.getElementById('task-deadline-field').hidden=Boolean(repeatInput.checked);
  form.classList.toggle('repeat-mode',Boolean(repeatInput.checked));
  document.getElementById('open-picker').disabled=repeatInput.checked;
  renderRepeatDays();
}
repeatInput.addEventListener('change',()=>{
  const original=tasks.find(task=>task.id===editingId);
  const routine=routines.find(item=>item.id===original?.routineId);
  if(routine)taskDateInput.value=repeatInput.checked?routine.startDate:original.scheduledDate;
  if(repeatInput.checked && !repeatWeekdays.size){const date=validDay(taskDateInput.value)?new Date(taskDateInput.value+'T12:00:00'):new Date(Date.now());repeatWeekdays.add((date.getDay()+6)%7+1);}
  updateRepeatEditor();
});
for(const [id,value] of [['week-all','all'],['week-whole','week'],['week-unscheduled','unscheduled']])document.getElementById(id).addEventListener('click',()=>selectDay(value));
for(const [id,direction] of [['week-previous',-1],['week-next',1]])document.getElementById(id).addEventListener('click',()=>{const target=new Date(visibleWeek);target.setDate(target.getDate()+7*direction);if(target<weekStart(new Date(Date.now())))return;visibleWeek=target;selectDay('week');});
document.getElementById('week-current').addEventListener('click',()=>{visibleWeek=weekStart(new Date());selectDay('week');});
renderRepeatDays();
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
  document.getElementById('folder-selected-name').setAttribute('data-no-translate', String(Boolean(selected)));
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
    if(folder.id)text.setAttribute('data-no-translate','');
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
    if(folder.id)option.setAttribute('data-no-translate','');
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
    if(folder.id && folder.id!=='all')name.setAttribute('data-no-translate','');
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
  try { localStorage.setItem(foldersKey, JSON.stringify(nextFolders)); window.todoAccount?.save(); } catch (error) {
    status.textContent = 'Không thể lưu mục mới. Kiểm tra quyền lưu trữ của trình duyệt.'; return;
  }
  folders = nextFolders;
  recordActivity('folder_created');
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
  try { localStorage.setItem(foldersKey, JSON.stringify(nextFolders)); window.todoAccount?.save(); } catch (error) {
    status.textContent = 'Không thể xóa mục vì chưa lưu được dữ liệu. Hãy thử lại.'; return;
  }
  folders = nextFolders;
  const moved = tasks.filter(task => task.folderId === folder.id).length;
  tasks.forEach(task => { if (task.folderId === folder.id) task.folderId = ''; });
  if (folderSelect.value === folder.id) folderSelect.value = '';
  currentFolder = '';
  const saved = saveTasks();
  renderTasks();
  recordActivity('folder_deleted');
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
      scheduledDate: validDay(task.scheduledDate) ? task.scheduledDate : null,
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
    window.todoAccount?.save();
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
  if(!captureOverdueHistory(source))return;
  let changed = false;
  let deleted = false;
  const remaining = [];
  for (const task of source) {
    if (task.completed && !task.completedAt) {
      task.completedAt = now; // Task cũ chưa có mốc thời gian: bắt đầu tính từ bây giờ.
      changed = true;
    }
    if (task.completed && now - task.completedAt >= 2 * hour) {
      changed = true;
      deleted = true;
      continue;
    }
    remaining.push(task);
  }
  if (!changed) return;
  tasks = remaining;
  if (editingId && !tasks.some(task => task.id === editingId)) resetEditor();
  const saved = saveTasks();
  if (saved && deleted) recordActivity('task_auto_deleted');
  renderTasks();
}

// 2. Tính thời gian bằng timestamp để không bị sai khi bộ hẹn giờ chạy trễ.
function deadlineInfo(task, now = Date.now()) {
  if (!task.deadline) return { text: 'Không có deadline', className: '' };
  const date = new Date(task.deadline);
  const formatted = date.toLocaleString(appLocale());
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
  captureOverdueHistory();renderOverdueHistory();
  // Chỉ cập nhật chữ và màu, không vẽ lại form hoặc làm mất focus.
  tasks.forEach(task => {
    const cleanupLabel = document.getElementById('cleanup-' + task.id);
    if (cleanupLabel && task.completedAt) {
      const seconds = Math.max(0, Math.ceil((task.completedAt + 2 * hour - Date.now()) / 1000));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const pad = value => String(value).padStart(2, '0');
      cleanupLabel.textContent = seconds === 0 ? 'Đang tự xóa…'
        : `Tự xóa sau ${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`;
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
  restoringHistoryId=null;
  editingId = null;
  form.reset();
  taskDateInput.value=validDay(selectedDay)?selectedDay:'';
  repeatInput.checked=false;repeatWeekdays=new Set();document.getElementById('repeat-time').value='';updateRepeatEditor();
  folderSelect.value = currentFolder === 'all' ? '' : currentFolder;
  document.getElementById('folder-picker').open = false;
  updateFolderPicker();
  updateDeadlineDisplay();
  submitButton.textContent = '＋ Add Task';
  cancelButton.hidden = true;
  document.getElementById('task-options').open=false;
}
function startEditing(task) {
  restoringHistoryId=null;
  editingId = task.id;
  input.value = task.text;
  const routine=routines.find(item=>item.id===task.routineId);
  taskDateInput.value=routine?.startDate || task.scheduledDate || '';
  repeatInput.checked=Boolean(routine);repeatWeekdays=new Set(routine?.weekdays || []);document.getElementById('repeat-time').value=routine?.deadlineTime || '';updateRepeatEditor();
  folderSelect.value = taskFolderId(task);
  updateFolderPicker();
  // datetime-local cần giờ địa phương, không phải chuỗi UTC từ toISOString().
  if (task.deadline) {
    const date = new Date(task.deadline);
    const pad = value => String(value).padStart(2, '0');
    deadlineInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } else deadlineInput.value = '';
  syncDeadlineWithSchedule();
  updateDeadlineDisplay();
  submitButton.textContent = 'Lưu thay đổi';
  cancelButton.hidden = false;
  document.getElementById('task-options').open=Boolean(task.scheduledDate || task.deadline || routine);
  input.focus();
}

// 3. Vẽ danh sách. textContent ngăn nội dung nhập bị chạy như HTML.
function renderTasks() {
  ensureWeekOccurrences();
  renderWeekPlanner();
  renderFolders();
  list.replaceChildren();
  const visible = tasks.filter(task => matchesDay(task) && (currentFolder === 'all' || taskFolderId(task) === currentFolder)
    && (currentFilter === 'active' ? !task.completed : currentFilter === 'completed' ? task.completed : true));
  visible.forEach(task => {
    const item = document.createElement('li');
    item.className = task.completed ? 'task completed' : 'task';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'task-' + task.id;
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => {
      captureOverdueHistory();
      if(!markOccurrence(task,checkbox.checked)){checkbox.checked=task.completed;return;}
      task.completed = checkbox.checked;
      task.completedAt = task.completed ? Date.now() : null;
      if (saveTasks()) recordActivity(task.completed ? 'task_completed' : 'task_reopened');
      renderTasks();
      (document.getElementById(checkbox.id) || document.querySelector('.filters .selected')).focus();
      checkDeadlines();
    });
    const content = document.createElement('div');
    content.className = 'task-content';
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = task.text;
    label.setAttribute('data-no-translate','');
    const deadline = document.createElement('p');
    deadline.id = 'deadline-' + task.id;
    content.append(label, deadline);
    const folderBadge = document.createElement('span');
    folderBadge.className = 'task-folder-badge';
    folderBadge.setAttribute('data-icon', getFolderIcon(folders.find(folder => folder.id === taskFolderId(task))));
    folderBadge.textContent = folders.find(folder => folder.id === taskFolderId(task))?.name || 'Chưa phân loại';
    if(taskFolderId(task))folderBadge.setAttribute('data-no-translate','');
    content.append(folderBadge);
    if(task.scheduledDate){const badge=document.createElement('span');badge.className='task-schedule-badge';badge.textContent=(task.routineId?'↻ ':'')+new Date(task.scheduledDate+'T12:00:00').toLocaleDateString(appLocale(),{weekday:'short',day:'numeric',month:'numeric'});content.append(badge);}
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
      if(!captureOverdueHistory())return;
      if(!markOccurrence(task,true))return;
      tasks = tasks.filter(existing => existing.id !== task.id);
      if (editingId === task.id) resetEditor();
      if (saveTasks()) recordActivity('task_deleted');
      renderTasks();
      input.focus();
    });
    actions.append(editButton, deleteButton);
    item.append(checkbox, content, actions);
    list.append(item);
  });
  const scopedTasks = tasks.filter(task => matchesDay(task) && (currentFolder === 'all' || taskFolderId(task) === currentFolder));
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
  document.getElementById('task-section-title').textContent=selectedDay==='week'?'Công việc trong tuần':validDay(selectedDay)?'Công việc ngày '+new Date(selectedDay+'T12:00:00').toLocaleDateString(appLocale()):'Công việc của bạn';
  updateCountdowns();
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if(repeatInput.checked || deadlineInput.value || restoringHistoryId)document.getElementById('task-options').open=true;
  captureOverdueHistory();
  if(restoringHistoryId && overdueHistory.find(entry=>entry.id===restoringHistoryId)?.restoredAt){message.textContent='Công việc này đã được khôi phục ở tab khác. Hãy hủy form và kiểm tra lại.';return;}
  const text = input.value.trim();
  if (!text) { message.textContent = 'Vui lòng nhập nội dung công việc.'; input.focus(); return; }
  const scheduledDate=taskDateInput.value || null;
  if(scheduledDate && !validDay(scheduledDate)){message.textContent='Ngày thực hiện không hợp lệ.';return;}
  const originalTask=tasks.find(task=>task.id===editingId);
  const originalRoutine=routines.find(item=>item.id===originalTask?.routineId);
  const originalDay=repeatInput.checked?originalRoutine?.startDate:originalTask?.scheduledDate;
  if(scheduledDate && scheduledDate<dayKey(new Date(Date.now())) && (restoringHistoryId || scheduledDate!==originalDay)){
    document.getElementById('task-options').open=true;message.textContent='Ngày thực hiện không được ở quá khứ. Chọn hôm nay hoặc ngày sau.';return;
  }
  if(restoringHistoryId && (repeatInput.checked || !deadlineInput.value)){message.textContent='Chọn deadline mới để khôi phục riêng công việc này.';return;}
  if(repeatInput.checked){submitRepeatingTask(text,scheduledDate);return;}
  const date = deadlineInput.value ? new Date(deadlineInput.value) : null;
  if (date && !Number.isFinite(date.getTime())) {
    message.textContent = 'Ngày giờ deadline không hợp lệ.'; document.getElementById('open-picker').focus(); return;
  }
  const deadline = date ? date.toISOString() : null;
  if(date && scheduledDate && dayKey(date)!==scheduledDate){
    message.textContent='Deadline phải cùng ngày thực hiện. Hãy chọn lại giờ deadline.';
    document.getElementById('open-picker').focus();return;
  }
  const originalDeadline = editingId ? tasks.find(task => task.id === editingId)?.deadline : null;
  if (date && date.getTime() <= Date.now() && (restoringHistoryId || deadline !== originalDeadline)) {
    message.textContent = 'Deadline phải sau thời gian hiện tại.';
    document.getElementById('open-picker').focus();
    return;
  }
  const folderId = folders.some(folder => folder.id === folderSelect.value) ? folderSelect.value : '';
  const activity = editingId ? 'task_updated' : 'task_created';
  if (editingId) {
    const task = tasks.find(task => task.id === editingId);
    if (!task) { resetEditor(); message.textContent = 'Công việc đã bị xóa ở tab khác.'; return; }
    if(task.routineId && restoringHistoryId){
      if(!markOccurrence(task,true))return;task.routineId=null;
    }else if(task.routineId){
      const oldId=task.routineId;
      if(!saveRoutines(routines.filter(item=>item.id!==oldId)))return;
      const today=dayKey(new Date(Date.now()));
      tasks=tasks.filter(item=>item.id===task.id || item.routineId!==oldId || item.completed || item.scheduledDate<today);
      task.routineId=null;
    }
    if (task.deadline !== deadline) {
      task.notifiedDeadline = null;
      task.overdueNotifiedDeadline = null;
      task.overdueSoundedDeadline = null;
      task.reminderSoundedDeadline = null;
    }
    task.text = text;
    task.deadline = deadline;
    task.folderId = folderId;
    task.scheduledDate=scheduledDate;
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    tasks.push({ id, text, completed: false, completedAt: null, deadline, folderId, scheduledDate, notifiedDeadline: null });
    setFilter('all');
  }
  if (currentFolder !== 'all') currentFolder = folderId;
  if(validDay(selectedDay)&&scheduledDate!==selectedDay)selectedDay=scheduledDate || 'unscheduled';
  const saved=saveTasks();
  if(saved)recordActivity(activity);
  if(restoringHistoryId){
    if(!saved)return;
    const entryId=restoringHistoryId;
    if(!saveOverdueHistory(overdueHistory.map(entry=>entry.id===entryId?{...entry,restoredAt:Date.now()}:entry)))return;
  }
  resetEditor();
  renderTasks();
  input.focus();
  checkDeadlines();
});
function submitRepeatingTask(text,startDate) {
  if(!repeatWeekdays.size){message.textContent='Chọn ít nhất một thứ để lặp hằng tuần.';return;}
  const time=document.getElementById('repeat-time').value || null;
  if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){message.textContent='Giờ deadline phải theo dạng HH:mm.';return;}
  const original=tasks.find(task=>task.id===editingId);
  const old=routines.find(item=>item.id===original?.routineId);
  if(!old && routines.length>=100){message.textContent='Tối đa 100 lịch lặp cho mỗi tài khoản.';return;}
  const id=old?.id || Date.now().toString(36)+Math.random().toString(36).slice(2);
  const routine={id,text,folderId:folders.some(folder=>folder.id===folderSelect.value)?folderSelect.value:'',startDate:startDate || dayKey(new Date(Date.now())),weekdays:[...repeatWeekdays].sort(),deadlineTime:time,excludedDates:old?.excludedDates || []};
  if(time && (!old || time!==old.deadlineTime || routine.startDate!==old.startDate)){
    const next=new Date((routine.startDate>dayKey(new Date(Date.now()))?routine.startDate:dayKey(new Date(Date.now())))+'T12:00:00');
    for(let count=0;count<7 && !routine.weekdays.includes((next.getDay()+6)%7+1);count++)next.setDate(next.getDate()+1);
    if(new Date(dayKey(next)+'T'+time).getTime()<=Date.now()){message.textContent='Giờ deadline hôm nay đã qua. Chọn giờ khác hoặc ngày bắt đầu sau hôm nay.';return;}
  }
  if(!saveRoutines([...routines.filter(item=>item.id!==id),routine]))return;
  const today=dayKey(new Date(Date.now()));
  tasks=tasks.filter(task=>{
    if(task.routineId!==id)return task.id!==original?.id || task.completed;
    if(task.completed || task.scheduledDate<today)return true;
    return task.scheduledDate>=routine.startDate && routine.weekdays.includes((new Date(task.scheduledDate+'T12:00:00').getDay()+6)%7+1);
  }).map(task=>{
    if(task.routineId!==id || task.completed || task.scheduledDate<today)return task;
    const deadline=time?new Date(task.scheduledDate+'T'+time).toISOString():null;
    return {...task,text,folderId:routine.folderId,deadline,...(deadline!==task.deadline?{notifiedDeadline:null,overdueNotifiedDeadline:null,overdueSoundedDeadline:null,reminderSoundedDeadline:null}:{})};
  });
  if(!old){
    const first=new Date(routine.startDate+'T12:00:00');
    for(let count=0;count<7 && !routine.weekdays.includes((first.getDay()+6)%7+1);count++)first.setDate(first.getDate()+1);
    visibleWeek=weekStart(first);
  }
  selectedDay='week';setFilter('all');
  if(currentFolder!=='all')currentFolder=routine.folderId;
  ensureWeekOccurrences();saveTasks();recordActivity(editingId?'task_updated':'task_created');resetEditor();renderTasks();input.focus();checkDeadlines();
}
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
  const testAlert = document.getElementById('test-sound');
  if (testAlert) testAlert.disabled = !active;
  const testNotify = document.getElementById('test-sound-notify');
  if (testNotify) testNotify.disabled = !active;
  document.getElementById('sound-status').textContent = supported ? '' : 'Trình duyệt không hỗ trợ âm thanh.';
}
function playAlertSound(overdue = false) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return false;
  try {
    const notes = overdue ? [
      { freq: 880, delay: 0, duration: 0.13, peak: 0.12, decay: 0.12 },
      { freq: 880, delay: 0.13, duration: 0.13, peak: 0.12, decay: 0.12 },
      { freq: 587.33, delay: 0.27, duration: 0.32, peak: 0.14, decay: 0.30 }
    ] : [
      { freq: 523.25, delay: 0, duration: 0.26, peak: 0.11, decay: 0.25 },
      { freq: 783.99, delay: 0.12, duration: 0.38, peak: 0.13, decay: 0.36 }
    ];
    const now = audioContext.currentTime;
    notes.forEach(note => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = now + note.delay;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(note.freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.peak, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.decay);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + note.duration);
    });
    return true;
  } catch (error) {
    document.getElementById('sound-status').textContent = 'Không phát được âm báo. Hãy thử kích hoạt lại.';
    return false;
  }
}
function playNotificationSound() { return playAlertSound(false); }
function playWarningSound() { return playAlertSound(true); }
window.playClickSound = playClickSound;
window.playAlertSound = playAlertSound;
window.playNotificationSound = playNotificationSound;
window.playWarningSound = playWarningSound;
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
const testSoundNotify = document.getElementById('test-sound-notify');
if (testSoundNotify) testSoundNotify.addEventListener('click', () => playAlertSound(false));

// Bắt click ở document để các nút vừa tạo (công việc, lịch) cũng có tiếng.
// Âm click pop / giọt nước trong trẻo, tươi sáng (C6 1046.5Hz -> C5 523.25Hz trong 25ms), không bị đục/thô.
function playClickSound() {
  if (!soundEnabled || audioContext?.state !== 'running') return false;
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1046.5, now);
    if (typeof oscillator.frequency.exponentialRampToValueAtTime === 'function') {
      oscillator.frequency.exponentialRampToValueAtTime(523.25, now + 0.024);
    }
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + 0.032);
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
  if (control.id === 'toggle-sound' || control.id === 'test-sound' || control.id === 'test-sound-notify') return;
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
    if(ensureWeekOccurrences())renderTasks();
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
  if (event.key !== storageKey && event.key !== foldersKey && event.key !== routinesKey && event.key !== overdueHistoryKey && event.key !== null) return;
  try {
    overdueHistory=readOverdueHistory();
    routines=readRoutines();
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
// Đồng hồ cập nhật từng giây; chỉ dọn dữ liệu khi có task thực sự hết hạn.
setInterval(() => {
  if (tasks.some(task => task.completed && task.completedAt && Date.now() - task.completedAt >= 2 * hour)) {
    checkDeadlines();
  } else updateCountdowns();
}, 1000);

// 6. Bộ chọn lịch riêng. Chỉ ghi vào deadline thật khi nhấn Xác nhận.
const picker = document.getElementById('date-picker');
const calendarDays = document.getElementById('calendar-days');
const hourInput = document.getElementById('picker-hour');
const minuteInput = document.getElementById('picker-minute');
let selectedDate = null;
let pickerMode = 'deadline';
let calendarMonth = null;
const padDate = value => String(value).padStart(2, '0');
function localDateValue(date) {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}T${padDate(date.getHours())}:${padDate(date.getMinutes())}`;
}
function updateDeadlineDisplay() {
  document.getElementById('deadline-label').textContent=validDay(taskDateInput.value)?'Giờ deadline (không bắt buộc)':'Deadline (không bắt buộc)';
  document.getElementById('deadline-display').textContent = deadlineInput.value
    ? new Date(deadlineInput.value).toLocaleString(appLocale(), { ...(validDay(taskDateInput.value)?{}:{day:'2-digit',month:'2-digit',year:'numeric'}), hour: '2-digit', minute: '2-digit', hour12: false })
    : validDay(taskDateInput.value)?'Chọn giờ':'Chọn ngày & giờ';
  updateTaskOptionsSummary();
}
// Mỗi hàng cao 44px; CSS scroll-snap tự căn vào giữa sau khi vuốt.
function paintTimeWheel(name,value) {
  const wheel=document.getElementById(name+'-wheel');
  Array.from(wheel.children).forEach((option,index)=>option.setAttribute('aria-selected',String(index===value)));
  wheel.setAttribute('aria-activedescendant',name+'-wheel-'+value);
}
function syncTimeWheels() {
  for(const [name,field,max] of [['hour',hourInput,23],['minute',minuteInput,59]]){
    if(!/^\d{1,2}$/.test(field.value) || Number(field.value)>max)continue;
    const value=Number(field.value);document.getElementById(name+'-wheel').scrollTop=value*44;paintTimeWheel(name,value);
  }
}
for(const [name,field,max] of [['hour',hourInput,23],['minute',minuteInput,59]]){
  const wheel=document.getElementById(name+'-wheel');
  function choose(value,smooth=false){
    value=Math.max(0,Math.min(max,value));field.value=padDate(value);paintTimeWheel(name,value);updatePickerPreview();
    wheel.focus();
    if(wheel.scrollTo)wheel.scrollTo({top:value*44,behavior:smooth?'smooth':'auto'});else wheel.scrollTop=value*44;
  }
  for(let value=0;value<=max;value++){
    const option=document.createElement('button');option.type='button';option.id=name+'-wheel-'+value;option.textContent=padDate(value);option.setAttribute('role','option');option.setAttribute('tabindex','-1');option.setAttribute('aria-selected','false');
    option.addEventListener('click',()=>choose(value));wheel.append(option);
  }
  wheel.addEventListener('scroll',()=>{
    const value=Math.max(0,Math.min(max,Math.round(wheel.scrollTop/44)));field.value=padDate(value);paintTimeWheel(name,value);updatePickerPreview();
  });
  wheel.addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();choose(event.key==='Home'?0:event.key==='End'?max:(Number(field.value)||0)+(event.key==='ArrowDown'?1:-1));
  });
}
function readPickerTime() {
  if (!/^\d{1,2}$/.test(hourInput.value) || !/^\d{1,2}$/.test(minuteInput.value)) return null;
  const hours = Number(hourInput.value);
  const minutes = Number(minuteInput.value);
  return hours <= 23 && minutes <= 59 ? { hours, minutes } : null;
}
function updatePickerPreview() {
  if(pickerMode==='schedule'){
    const past=dayKey(selectedDate)<dayKey(new Date(Date.now()));
    document.getElementById('apply-deadline').disabled=past;
    document.getElementById('picker-error').textContent=past?'Ngày thực hiện không được ở quá khứ.':'';
    document.getElementById('picker-preview').textContent=selectedDate.toLocaleDateString(appLocale(),{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    return;
  }
  const time = readPickerTime();
  if (!time) {
    document.getElementById('apply-deadline').disabled = true;
    document.getElementById('picker-error').textContent = 'Nhập giờ 00–23 và phút 00–59.';
    document.getElementById('picker-preview').textContent = '';
    return;
  }
  const date = new Date(selectedDate);
  date.setHours(time.hours, time.minutes, 0, 0);
  const invalid = date.getTime() <= Date.now();
  const wrongDay=validDay(taskDateInput.value) && dayKey(date)!==taskDateInput.value;
  document.getElementById('apply-deadline').disabled = invalid || wrongDay;
  document.getElementById('picker-error').textContent = wrongDay ? 'Deadline phải cùng ngày thực hiện.' : invalid ? 'Chọn thời gian trong tương lai.' : '';
  document.getElementById('picker-preview').textContent = date.toLocaleString(appLocale(), {
    ...(validDay(taskDateInput.value)?{}:{weekday:'long',day:'2-digit',month:'long',year:'numeric'}),hour:'2-digit',minute:'2-digit',hour12:false
  });
}
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function renderCalendar() {
  calendarDays.replaceChildren();
  document.getElementById('calendar-month').textContent = appLocale()==='vi-VN' ? `Tháng ${calendarMonth.getMonth() + 1}, ${calendarMonth.getFullYear()}` : calendarMonth.toLocaleDateString(appLocale(),{month:'long',year:'numeric'});
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  // Tuần bắt đầu bằng thứ Hai; hiển thị đủ 6 hàng để lịch không nhảy chiều cao.
  const offset = (first.getDay() + 6) % 7;
  const now = new Date(Date.now());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (let index = 0; index < 42; index++) {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + index);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = date.getDate();
    button.className = 'calendar-day';
    button.disabled = date.getTime() < todayStart || (pickerMode==='deadline' && validDay(taskDateInput.value) && dayKey(date)!==taskDateInput.value);
    if (date.getMonth() !== calendarMonth.getMonth()) button.className += ' outside';
    if (sameDay(date, now)) { button.className += ' today'; button.setAttribute('aria-current', 'date'); }
    const chosen = sameDay(date, selectedDate);
    if (chosen) button.className += ' chosen';
    button.setAttribute('aria-pressed', String(chosen));
    button.setAttribute('aria-label', date.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    button.addEventListener('click', () => {
      if (button.disabled) return;
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
function openDatePicker(mode='deadline') {
  document.getElementById('task-options').open=true;
  pickerMode=mode==='schedule'?'schedule':'deadline';
  const existing = deadlineInput.value ? new Date(deadlineInput.value) : null;
  selectedDate = existing && existing.getTime() > Date.now() ? existing : new Date(Math.ceil((Date.now() + 1) / 60000) * 60000);
  const locked=pickerMode==='deadline' && validDay(taskDateInput.value);
  picker.classList.toggle('time-only',locked);
  if(locked){
    const time=existing && Number.isFinite(existing.getTime()) ? existing : selectedDate;
    selectedDate=new Date(taskDateInput.value+'T'+padDate(time.getHours())+':'+padDate(time.getMinutes()));
  }
  if(pickerMode==='schedule')selectedDate=validDay(taskDateInput.value) && taskDateInput.value>=dayKey(new Date(Date.now()))?new Date(taskDateInput.value+'T12:00:00'):new Date(Date.now());
  document.getElementById('picker-title').textContent=pickerMode==='schedule'?'Ngày thực hiện':'Chọn deadline';
  if(locked)document.getElementById('picker-title').textContent='Chọn giờ deadline';
  for(const id of ['picker-calendar-nav','picker-weekdays','calendar-days'])document.getElementById(id).hidden=locked;
  document.getElementById('pick-today').hidden=locked;
  document.getElementById('pick-tomorrow').hidden=locked;
  document.getElementById('picker-time-section').hidden=pickerMode==='schedule';
  document.getElementById('apply-deadline').textContent=pickerMode==='schedule'?'Chọn ngày này':'Xác nhận deadline';
  document.getElementById('clear-deadline').textContent=pickerMode==='schedule'?'Bỏ ngày':'Bỏ deadline';
  document.getElementById('previous-month').disabled=locked;
  document.getElementById('next-month').disabled=locked;
  const today=new Date(Date.now());const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
  document.getElementById('pick-today').disabled=locked && taskDateInput.value!==dayKey(today);
  document.getElementById('pick-tomorrow').disabled=locked && taskDateInput.value!==dayKey(tomorrow);
  calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  hourInput.value = padDate(selectedDate.getHours());
  minuteInput.value = padDate(selectedDate.getMinutes());
  renderCalendar();
  picker.showModal(); // dialog hỗ trợ Escape, giữ focus và chặn tương tác phía sau.
  syncTimeWheels();
  document.getElementById('open-picker').setAttribute('aria-expanded', 'true');
  if(pickerMode==='schedule'){
    document.getElementById('open-picker').setAttribute('aria-expanded','false');
    document.getElementById('open-schedule-picker').setAttribute('aria-expanded','true');
  }
}
for (const [field, max, name] of [[hourInput, 23, 'hour'], [minuteInput, 59, 'minute']]) {
  field.addEventListener('input', () => {
    field.value = field.value.replace(/\D/g, '').slice(0, 2);
    updatePickerPreview();
    syncTimeWheels();
  });
  field.addEventListener('change', updatePickerPreview);
  field.addEventListener('focus', () => field.select());
  field.addEventListener('blur', () => {
    if (/^\d{1,2}$/.test(field.value) && Number(field.value) <= max) field.value = padDate(Number(field.value));
    updatePickerPreview();
  });
  const stepTime = delta => {
    const value = Number(field.value) || 0;
    field.value = padDate(Math.min(max, Math.max(0, value + delta)));
    updatePickerPreview();
    syncTimeWheels();
  };
  document.getElementById(name + '-down').addEventListener('click', () => stepTime(-1));
  document.getElementById(name + '-up').addEventListener('click', () => stepTime(1));
  field.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepTime(event.key === 'ArrowUp' ? 1 : -1);
    }
  });
}
document.getElementById('open-picker').addEventListener('click', openDatePicker);
document.getElementById('open-schedule-picker').addEventListener('click',()=>openDatePicker('schedule'));
function closeDatePicker() { picker.close(); document.getElementById('open-picker').setAttribute('aria-expanded', 'false');document.getElementById('open-schedule-picker').setAttribute('aria-expanded','false'); document.getElementById(pickerMode==='schedule'?'open-schedule-picker':'open-picker').focus(); }
picker.addEventListener('close', () => {document.getElementById('open-picker').setAttribute('aria-expanded', 'false');document.getElementById('open-schedule-picker').setAttribute('aria-expanded','false');});
document.getElementById('close-picker').addEventListener('click', closeDatePicker);
document.getElementById('cancel-picker').addEventListener('click', closeDatePicker);
picker.addEventListener('click', event => { if (event.target === picker) {
  const bounds = picker.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDatePicker();
} });
for (const [id, step] of [['previous-month', -1], ['next-month', 1]]) {
  document.getElementById(id).addEventListener('click', () => {
    if(pickerMode==='deadline' && validDay(taskDateInput.value))return;
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + step, 1);
    renderCalendar();
  });
}
for (const [id, offset] of [['pick-today', 0], ['pick-tomorrow', 1]]) {
  document.getElementById(id).addEventListener('click', () => {
    const now = new Date(Date.now());
    const target=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
    if(pickerMode==='deadline' && validDay(taskDateInput.value) && dayKey(target)!==taskDateInput.value)return;
    selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderCalendar();
  });
}
document.getElementById('apply-deadline').addEventListener('click', () => {
  if(pickerMode==='schedule'){
    if(dayKey(selectedDate)<dayKey(new Date(Date.now()))){updatePickerPreview();return;}
    taskDateInput.value=dayKey(selectedDate);handleScheduleChange();closeDatePicker();return;
  }
  const time = readPickerTime();
  if (!time) { updatePickerPreview(); return; }
  const date = new Date(selectedDate);
  date.setHours(time.hours, time.minutes, 0, 0);
  if (date.getTime() <= Date.now() || (validDay(taskDateInput.value) && dayKey(date)!==taskDateInput.value)) {
    updatePickerPreview();
    return;
  }
  deadlineInput.value = localDateValue(date);
  updateDeadlineDisplay();
  closeDatePicker();
});
document.getElementById('clear-deadline').addEventListener('click', () => {
  if(pickerMode==='schedule'){taskDateInput.value='';handleScheduleChange();closeDatePicker();return;}
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
  selectMenuSection(null);
  settingsDialog.showModal();
  settingsButton.setAttribute('aria-expanded', 'true');
});
function closeSettings() { settingsDialog.close(); settingsButton.setAttribute('aria-expanded', 'false'); settingsButton.focus(); }
settingsDialog.addEventListener('close', () => settingsButton.setAttribute('aria-expanded', 'false'));
document.getElementById('close-settings').addEventListener('click', closeSettings);
settingsDialog.addEventListener('click', event => {
  if (event.target !== settingsDialog) return;
  const bounds = settingsDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSettings();
});

const menuSections = ['language', 'guide', 'sound', 'notifications', 'contact'];
function selectMenuSection(section) {
  for (const name of menuSections) {
    const active = name === section;
    const tab = document.getElementById('menu-' + name + '-tab');
    tab.setAttribute('aria-expanded', String(active));
    document.getElementById('menu-' + name + '-panel').hidden = !active;
  }
}
for (const section of menuSections) {
  const tab = document.getElementById('menu-' + section + '-tab');
  tab.addEventListener('click', () => selectMenuSection(tab.getAttribute('aria-expanded') === 'true' ? null : section));
  tab.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = menuSections.indexOf(section);
    const next = event.key === 'Home' ? menuSections[0] : event.key === 'End' ? menuSections.at(-1)
      : menuSections[(index + (event.key === 'ArrowDown' ? 1 : -1) + menuSections.length) % menuSections.length];
    document.getElementById('menu-' + next + '-tab').focus();
  });
}

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

// Đồng hồ dùng múi giờ của thiết bị và luôn tính lại từ thời gian thật.
function updateHeaderClock(now = Date.now()) {
  const date = new Date(now);
  const pad = value => String(value).padStart(2, '0');
  const time = document.getElementById('current-time');
  time.textContent = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  time.setAttribute('datetime', date.toISOString());
  const daytime = date.getHours() >= 6 && date.getHours() < 18;
  const icon = document.getElementById('time-period-icon');
  icon.textContent = daytime ? '☀' : '☾';
  icon.setAttribute('aria-label', daytime ? 'Ban ngày' : 'Ban đêm');
}
updateHeaderClock();
setInterval(updateHeaderClock, 1000);
// Đổi chữ và định dạng ngày ngay tại chỗ, giữ nguyên nội dung đang nhập.
window.addEventListener('languagechange', () => {
  renderTasks();renderRepeatDays();updateScheduleDisplay();updateTaskOptionsSummary();
  if(picker.open)renderCalendar();
});
