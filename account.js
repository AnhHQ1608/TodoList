// Trang đăng nhập không lưu mật khẩu, chỉ lưu token phiên đã cấp từ máy chủ.
(() => {
  const $ = id => document.getElementById(id);
  const key = 'focus-user-session-v1';
  let endpoint = '';
  try { const url = new URL(window.TODO_ANALYTICS?.apiUrl); if (url.protocol === 'https:') endpoint = url.origin; } catch { /* Báo lỗi cấu hình. */ }
  let register = new URLSearchParams(location.search).get('mode') === 'register';
  let busy = false;
  function select(value) {
    register = value;
    $('auth-login-tab').setAttribute('aria-selected', String(!value));
    $('auth-register-tab').setAttribute('aria-selected', String(value));
    $('auth-confirm-field').hidden = !value;
    $('auth-confirm').required = value;
    $('auth-fullname-field').hidden = !value;
    $('auth-fullname').required = value;
    $('auth-password').autocomplete = value ? 'new-password' : 'current-password';
    $('auth-title').textContent = value ? 'Bắt đầu một ngày mới.' : 'Chào mừng trở lại.';
    $('auth-submit').textContent = value ? 'Tạo tài khoản' : 'Đăng nhập';
    $('auth-message').textContent = '';
  }
  $('auth-login-tab').addEventListener('click', () => { if(!busy) select(false); });
  $('auth-register-tab').addEventListener('click', () => { if(!busy) select(true); });
  $('auth-show-password').addEventListener('click', () => {
    const show = $('auth-password').type === 'password';
    $('auth-password').type = show ? 'text' : 'password';
    $('auth-show-password').textContent = show ? 'Ẩn' : 'Hiện';
    $('auth-show-password').setAttribute('aria-pressed', String(show));
    $('auth-show-password').setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  });
  $('auth-form').addEventListener('submit', async event => {
    event.preventDefault(); if(busy) return;
    if(!endpoint){ $('auth-message').textContent = 'Chưa kết nối máy chủ tài khoản.'; return; }
    if(register && $('auth-password').value !== $('auth-confirm').value){ $('auth-message').textContent = 'Hai mật khẩu chưa trùng nhau.'; return; }
    busy = true; $('auth-submit').disabled = true; $('auth-message').textContent = 'Đang xử lý…';
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(endpoint + (register ? '/auth/register' : '/auth/login'), {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:$('auth-username').value.trim(),password:$('auth-password').value,...(register?{fullName:$('auth-fullname').value.trim()}:{})}),credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      const data = await response.json();
      if(!response.ok) throw Error(data.error || 'Không thể đăng nhập.');
      localStorage.setItem(key, JSON.stringify({token:data.token,user:data.user,expiresAt:data.expiresAt,endpoint}));
      $('auth-password').value = ''; $('auth-confirm').value = '';
      location.replace('index.html');
    } catch(error) { $('auth-message').textContent = error.name === 'AbortError' ? 'Kết nối quá lâu. Hãy thử lại.' : error.message || 'Không kết nối được máy chủ.'; }
    finally { clearTimeout(timer); busy = false; $('auth-submit').disabled = false; }
  });
  select(register);
})();
