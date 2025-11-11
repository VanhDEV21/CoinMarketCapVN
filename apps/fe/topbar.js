// Simple Topbar for vanilla HTML sites
window.Topbar = (function () {
  function currentPathKey(href) {
    // so sánh theo tên file (index.html, coins.html, v.v.)
    try {
      const a = document.createElement('a');
      a.href = href;
      const file = (a.pathname || '').split('/').filter(Boolean).pop() || 'index.html';
      return file.toLowerCase();
    } catch { return ''; }
  }

  function markActiveLinks(root) {
    const here = currentPathKey(location.pathname || 'index.html');
    root.querySelectorAll('.nav a').forEach(a => {
      const key = currentPathKey(a.getAttribute('href') || '');
      if (key === here) a.classList.add('active');
    });
  }

// THAY dòng khai báo hàm build hiện tại bằng:
function build({ brand, items, auth, bot }) {
  const wrap = document.createElement('header');
  wrap.className = 'topbar';
  wrap.innerHTML = `
    <div class="inner">
      <a class="brand" href="${brand?.href || '/'}" aria-label="Homepage">
        <span class="logo">◆</span>
        <span>${brand?.text || 'App'}</span>
      </a>

      <nav class="nav" role="navigation" aria-label="Main navigation">
        ${items.map(i => `<a href="${i.href}">${i.text}</a>`).join('')}
      </nav>

      <div class="spacer"></div>

      <div class="actions">
        <a class="btn" id="topbar-bot" href="${(bot && bot.href) || 'https://t.me/CRYPTOANNOUCEBOT'}" target="_blank" rel="noopener">Bot</a>
        <a class="btn" id="authBtn" href="${auth?.loginHref || '#'}">Login</a>
        <button class="hamburger" id="hamburgerBtn" aria-label="Open menu">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </button>
      </div>
    </div>
  `;
  return wrap;
}


  function mount(target, options) {
    const defaults = {
      brand: { text: 'App', href: '/' },
      items: [],
      auth: { loginHref: '/login.html' }
    };
    const opts = Object.assign({}, defaults, options || {});
    const root = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!root) return;

    const el = build(opts);
    root.replaceWith(el); // thay mount point bằng topbar
    markActiveLinks(el);

    // Toggle mobile menu
    const nav = el.querySelector('.nav');
    const burger = el.querySelector('#hamburgerBtn');
    burger?.addEventListener('click', () => nav.classList.toggle('open'));

    // Shadow khi cuộn
    const onScroll = () => {
      if (window.scrollY > 4) el.style.boxShadow = '0 6px 16px rgba(0,0,0,.22)';
      else el.style.boxShadow = 'none';
    };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

    // (Tuỳ chọn) xử lý login/logout nếu bạn lưu token trong localStorage
    const authBtn = el.querySelector('#authBtn');
    try {
      const token = localStorage.getItem('token');
      if (token) {
        authBtn.textContent = 'Logout';
        authBtn.setAttribute('href', '#');
        authBtn.addEventListener('click', (e) => {
          e.preventDefault();
          localStorage.removeItem('token');
          location.href = opts.auth.loginHref || '/login.html';
        });
      }
    } catch {}
  }

  return { mount };
})();
