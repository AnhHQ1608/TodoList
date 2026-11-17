// Chỉ khởi động TodoList sau khi máy chủ xác nhận phiên và tải dữ liệu tài khoản.
(() => {
  const sessionKey = 'focus-user-session-v1';
  const sync = document.getElementById('account-sync');
  const gate = document.getElementById('account-gate-message');
  let endpoint = '', session, version = 0, busy = false, dirty = false, stopped = false, timer;
  try {
    endpoint = new URL(window.TODO_ANALYTICS.apiUrl).origin;
    session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
  } catch { /* Phiên không hợp lệ. */ }
  function login() { location.replace('login.html'); }
  if (!session?.token || !session.user?.id || session.endpoint !== endpoint || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) { login(); return; }
  const tasksKey = 'focus-list-tasks-v1:' + session.user.id;
  const foldersKey = 'focus-list-folders-v1:' + session.user.id;
  const routinesKey = 'focus-list-routines-v1:' + session.user.id;
  const overdueHistoryKey = 'focus-list-overdue-history-v1:' + session.user.id;
  const pendingKey = 'focus-user-pending-v1:' + session.user.id;
  async function api(path, data) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint + path, {method:data ? 'POST' : 'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},
        ...(data ? {body:JSON.stringify(data)} : {}),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal});
      const result = await response.json();
      if(response.status === 401){ stopped = true; login(); }
      if(!response.ok){ const error = Error(result.error || 'Không kết nối được máy chủ.'); error.status = response.status; throw error; }
      return result;
    } finally { clearTimeout(timeout); }
  }
  function snapshot() { return {tasks:JSON.parse(localStorage.getItem(tasksKey) || '[]'),folders:JSON.parse(localStorage.getItem(foldersKey) || '[]'),routines:JSON.parse(localStorage.getItem(routinesKey) || '[]'),overdueHistory:JSON.parse(localStorage.getItem(overdueHistoryKey) || '[]')}; }
  async function flush() {
    if(stopped || busy || !dirty) return;
    busy = true; dirty = false;
    sync.textContent = 'Đang đồng bộ…';
    try {
      const result = await api('/account/data', {version,data:snapshot()});
      version = result.version;
      if(!dirty) localStorage.removeItem(pendingKey);
      else localStorage.setItem(pendingKey,JSON.stringify({version,data:snapshot()}));
      sync.textContent = 'Đã đồng bộ';
    } catch(error) {
      dirty = true;
      if(error.status === 409) stopped = true;
      sync.textContent = error.status === 409 ? 'Có thay đổi ở thiết bị khác. Bản chưa đồng bộ vẫn giữ trên máy; tải lại để xử lý.' : 'Chưa đồng bộ. Bản sửa vẫn giữ trên máy; bấm Thử lại.';
      document.getElementById('account-retry').hidden = false;
    } finally { busy = false; if(dirty && !stopped) timer = setTimeout(flush, 15000); }
  }
  function save() {
    dirty = true;
    // Ghi lại phiên bản gốc để tải lại trang không làm mất bản chưa đồng bộ.
    try { localStorage.setItem(pendingKey, JSON.stringify({version,data:snapshot()})); } catch { sync.textContent = 'Không lưu được bản dự phòng.'; }
    if(stopped) return;
    clearTimeout(timer); timer = setTimeout(flush, 700);
  }
  async function loadScript(src) {
    await new Promise((resolve,reject) => {const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Không tải được ứng dụng. Hãy tải lại trang.'));document.head.append(script);});
  }
  async function start() {
    try {
      const me = await api('/auth/me');
      if(me.user.id !== session.user.id) throw Error('Phiên tài khoản không khớp. Hãy đăng nhập lại.');
      const remote = await api('/account/data'); version = remote.version;
      const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
      let data = remote.data;
      if(pending){
        if(pending.version === version){ data = {...pending.data,routines:pending.data.routines === undefined ? remote.data.routines || [] : pending.data.routines,overdueHistory:pending.data.overdueHistory===undefined?remote.data.overdueHistory || []:pending.data.overdueHistory}; dirty = true; }
        else {
          // Không tự chọn một phía khi có xung đột. Bản chưa đồng bộ được giữ riêng.
          document.getElementById('account-conflict').hidden = false;
          document.getElementById('account-conflict-download').onclick = () => {
            const url=URL.createObjectURL(new Blob([JSON.stringify(pending.data,null,2)],{type:'application/json'}));
            const a=document.createElement('a');a.href=url;a.download='focus-list-chua-dong-bo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          };
          await new Promise(resolve => { document.getElementById('account-use-server').onclick = () => {
            localStorage.setItem(pendingKey + ':backup:' + Date.now(), JSON.stringify(pending));
            localStorage.removeItem(pendingKey);document.getElementById('account-conflict').hidden=true;resolve();
          }; });
        }
      }
      localStorage.setItem(tasksKey, JSON.stringify(data.tasks));
      localStorage.setItem(foldersKey, JSON.stringify(data.folders));
      localStorage.setItem(routinesKey, JSON.stringify(data.routines || []));
      localStorage.setItem(overdueHistoryKey, JSON.stringify(data.overdueHistory || []));
      const visitorKey='focus-activity-visitor-v1:' + me.user.id;
      let visitor=localStorage.getItem(visitorKey);
      if(!/^[0-9a-f-]{36}$/.test(visitor || '')){visitor=crypto.randomUUID();localStorage.setItem(visitorKey,visitor);}
      localStorage.setItem('focus-activity-visitor-v1',visitor);
      window.todoAccount = Object.freeze({user:me.user,storageKey:tasksKey,foldersKey,routinesKey,overdueHistoryKey,save,
        headers:()=>({Authorization:'Bearer '+session.token})});
      document.getElementById('account-name').textContent = me.user.fullName || me.user.username;
      document.getElementById('account-fullname').value = me.user.fullName || '';
      document.getElementById('account-profile-form').hidden = Boolean(me.user.fullName);
      document.getElementById('account-profile').setAttribute('aria-expanded',String(!me.user.fullName));
      await loadScript('activity.js?v=accounts-1');
      await loadScript('device-alerts.js?v=sounds-2');
      await loadScript('script.js?v=vinyl-vi-voice-1');
      document.documentElement.classList.remove('account-loading');
      document.getElementById('account-gate').hidden = true;
      sync.textContent = dirty ? 'Đang đồng bộ…' : 'Đã đồng bộ';
      if(dirty) flush();
      try {
        const current=snapshot();
        const hasOld=[['tasks','focus-list-tasks-v1'],['folders','focus-list-folders-v1']].some(([kind,key]) => {
          const old=JSON.parse(localStorage.getItem(key) || '[]');
          const ids=new Set(current[kind].map(item=>item.id));
          return Array.isArray(old) && old.some(item=>item && !ids.has(item.id));
        });
        document.getElementById('account-import').hidden = !hasOld;
      } catch { /* Không để dữ liệu cũ hỏng chặn tài khoản mới. */ }
    } catch(error) {
      gate.textContent = error.message || 'Không tải được tài khoản. Hãy kiểm tra kết nối và tải lại.';
      const screen = document.getElementById('account-gate');
      screen.setAttribute('data-state', 'error');
      screen.setAttribute('aria-busy', 'false');
      document.getElementById('account-gate-retry').hidden = false;
    }
  }
  document.getElementById('account-gate-retry').addEventListener('click', () => location.reload());
  document.getElementById('account-profile').addEventListener('click', () => {
    const form=document.getElementById('account-profile-form');form.hidden=!form.hidden;
    document.getElementById('account-profile').setAttribute('aria-expanded',String(!form.hidden));
    if(!form.hidden)document.getElementById('account-fullname').focus();
  });
  document.getElementById('account-profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button=document.getElementById('account-profile-save');if(button.disabled)return;
    button.disabled=true;
    try {
      const result=await api('/auth/profile',{fullName:document.getElementById('account-fullname').value.trim()});
      window.todoAccount.user.fullName=result.user.fullName;
      session.user=result.user;
      localStorage.setItem(sessionKey,JSON.stringify(session));
      document.getElementById('account-name').textContent=result.user.fullName;
      document.getElementById('account-fullname').value=result.user.fullName;
      document.getElementById('account-profile-message').textContent='Đã lưu họ và tên.';
      document.getElementById('account-profile-form').hidden=true;
      document.getElementById('account-profile').setAttribute('aria-expanded','false');
    }catch(error){document.getElementById('account-profile-message').textContent=error.message || 'Không lưu được họ tên.';}
    finally{button.disabled=false;}
  });
  document.getElementById('account-retry').addEventListener('click', () => { if(stopped) location.reload(); else flush(); });
  document.getElementById('account-logout').addEventListener('click', async () => {
    clearTimeout(timer);
    if(dirty && !stopped) await flush();
    // Luôn giữ bản chưa đồng bộ trong bộ nhớ riêng của tài khoản.
    stopped = true;
    try { await api('/auth/logout', {}); } catch { /* Vẫn bỏ phiên trên máy khi mất mạng. */ }
    localStorage.removeItem(sessionKey); login();
  });
  document.getElementById('account-import').addEventListener('click', async () => {
    if(stopped || busy) return;
    try {
      const current=snapshot();
      for(const [kind,key] of [['tasks','focus-list-tasks-v1'],['folders','focus-list-folders-v1']]){
        const old=JSON.parse(localStorage.getItem(key) || '[]');
        if(!Array.isArray(old))throw Error('Dữ liệu cũ không hợp lệ.');
        const ids=new Set(current[kind].map(item=>item.id));
        current[kind].push(...old.filter(item=>item && !ids.has(item.id)));
      }
      localStorage.setItem(tasksKey,JSON.stringify(current.tasks));localStorage.setItem(foldersKey,JSON.stringify(current.folders));
      save(); clearTimeout(timer); await flush(); location.reload();
    } catch(error){sync.textContent=error.message;}
  });
  window.addEventListener('storage', event => {
    if(event.key===sessionKey || event.key===null){stopped=true;location.reload();}
  });
  window.addEventListener('online', () => { if(dirty)flush(); });
  window.addEventListener('beforeunload', event => { if(dirty){event.preventDefault();event.returnValue='';} });
  start();
})();
