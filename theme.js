// Nạp sớm để giữ giao diện đã chọn khi tải trang, không cần đăng nhập.
(() => {
  const key = 'focus-theme-v1';
  let theme = 'dark';
  try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch { /* Dùng tối khi không đọc được storage. */ }
  function apply(value) {
    theme = value === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#101329');
    const scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', theme === 'light' ? 'only light' : 'dark');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.setAttribute('aria-checked', String(theme === 'light'));
    const label = document.getElementById('theme-state-label');
    if (label) label.textContent = theme === 'light' ? 'Giao diện sáng' : 'Giao diện tối';
  }
  apply(theme);
  function bindToggle() {
    apply(theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      apply(theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, theme); } catch { /* Vẫn đổi giao diện trong phiên này. */ }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
  else bindToggle();
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      try { apply(localStorage.getItem(key)); } catch { /* Giữ giao diện hiện tại. */ }
    }
  });
})();
