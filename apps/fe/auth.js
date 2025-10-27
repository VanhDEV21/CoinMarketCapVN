  (function () {
    // 1) Trạng thái đăng nhập
    const token = localStorage.getItem('token') || null;
    window.isAuthed = !!token;

    // 2) Gắn Authorization header cho axios (nếu đã login)
    if (window.axios && token) {
      window.axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // 3) Bắt lỗi 401 toàn cục -> hiện gợi ý đăng nhập (không redirect)
    if (window.axios && !window.__axiosAuthInterceptorInstalled) {
      window.axios.interceptors.response.use(
        (res) => res,
        (err) => {
          if (err?.response?.status === 401) {
            const hint = document.getElementById('login-hint');
            if (hint) hint.style.display = 'block';
          }
          return Promise.reject(err);
        }
      );
      window.__axiosAuthInterceptorInstalled = true;
    }

    // 4) Hàm logout dùng cho nút trên header
    window.logout = function () {
      localStorage.removeItem('token');
      // reload để UI/axios reset về trạng thái chưa login
      window.location.reload();
    };

    // 5) Bật/tắt nút Login/Logout nếu trang có 2 nút đó
    window.addEventListener('DOMContentLoaded', () => {
      const btnLogin  = document.getElementById('btn-login');
      const btnLogout = document.getElementById('btn-logout');
      if (window.isAuthed) {
        if (btnLogout) btnLogout.style.display = 'inline-block';
      } else {
        if (btnLogin) btnLogin.style.display = 'inline-block';
      }
    });
  })();

