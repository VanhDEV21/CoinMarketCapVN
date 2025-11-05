/** ============== CONFIG ============== */
const COINS_BASE     = 'http://localhost:5000/api/coins';
const WATCHLIST_BASE = 'http://localhost:5000/api/watchlist';

const WATCH = {
  GET:    `${WATCHLIST_BASE}/get-watchlist`,
  ADD:    `${WATCHLIST_BASE}/add-watchlist`,
  DEL:    (s) => `${WATCHLIST_BASE}/${encodeURIComponent(s)}`,
  TOGGLE: `${WATCHLIST_BASE}/toggle`,
};
let searchTerm = ''; // <-- query tìm kiếm

const PAGE_SIZE = 20;

/** ============== STATE ============== */
let allCoinsOriginal = [];   // dữ liệu gốc (để reset sort)
let allCoinsView     = [];   // dữ liệu render (sau sort)
let currentPage      = 1;

// === AUTH + NOTIFICATION STATE ===
function isLoggedIn() {
  return !!localStorage.getItem('token');
}

let notificationsEnabled = (localStorage.getItem('notificationsEnabled') === 'true');

function updateNotificationIcon(enabled) {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;
  btn.textContent = enabled ? '🔔' : '🔕';
}

function updateBellVisibility() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;
  btn.style.display = isLoggedIn() ? 'inline-block' : 'none';
  updateNotificationIcon(notificationsEnabled);
}

function showTgModal() {
  const modal = document.getElementById('tg-modal');
  if (modal) modal.style.display = 'block';
}
function hideTgModal() {
  const modal = document.getElementById('tg-modal');
  if (modal) modal.style.display = 'none';
}
document.addEventListener('click', (e) => {
  if (e.target?.id === 'tg-close') hideTgModal();
});

// Lấy trạng thái từ BE để đồng bộ icon
async function refreshNotifStatusFromServer() {
  if (!isLoggedIn()) return;
  try {
    const res = await axios.get('http://localhost:5000/api/notifications/status', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    });
    const serverEnabled = !!res.data?.enabled;
    notificationsEnabled = serverEnabled;
    localStorage.setItem('notificationsEnabled', String(serverEnabled));
    updateNotificationIcon(serverEnabled);
  } catch (e) {
    // ignore
  }
}

// Toggle bật/tắt nhận thông báo
async function toggleNotifications() {
  if (!isLoggedIn()) {
    alert('Please log in first');
    return;
  }

  // hỏi status trước để biết đã liên kết chưa
  let hasChat = false;
  try {
    const s = await axios.get('http://localhost:5000/api/notifications/status', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    });
    hasChat = !!s.data?.hasChat;
  } catch {}

  // Nếu đang muốn bật mà chưa có chatId -> mở modal QR và dừng
  if (!notificationsEnabled && !hasChat) {
    showTgModal();
    return;
  }

  // Cho phép bật/tắt
  const newStatus = !notificationsEnabled;
  try {
    const res = await axios.post(
      'http://localhost:5000/api/notifications/toggle',
      { enabled: newStatus },
      { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }
    );
    notificationsEnabled = !!res.data?.enabled;
    localStorage.setItem('notificationsEnabled', String(notificationsEnabled));
    updateNotificationIcon(notificationsEnabled);
  } catch (e) {
    // nếu BE trả 409 needLink thì cũng mở modal
    if (e?.response?.status === 409) {
      showTgModal();
    } else {
      alert('Failed to update notification preferences');
    }
  }
}

let watchlistSet = new Set();

let viewMode = 'all'; // 'all' | 'watch'

// sortStates: 'none' | 'desc' | 'asc'
const sortStates = { '5m': 'none', '1h': 'none', '24h': 'none' };
const sortFieldByKey = {
  '5m':  'percentChange5min',
  '1h':  'percentChange1h',
  '24h': 'percentChange24h',
};

/** ============== HELPERS ============== */
const changeClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

function openChart(symbol, name) {
  const url = `chart.html?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`;
  window.location.href = url;
}

function currentList() {
  return viewMode === 'watch'
    ? allCoinsView.filter(c => watchlistSet.has(c.symbol))
    : allCoinsView;
}

function setActiveTab() {
  document.getElementById('tab-all')?.classList.toggle('active', viewMode === 'all');
  document.getElementById('tab-watch')?.classList.toggle('active', viewMode === 'watch');
}

/** ============== SORTING ============== */
function clearOtherSorts(exceptKey) {
  for (const k of Object.keys(sortStates)) {
    if (k !== exceptKey) sortStates[k] = 'none';
  }
}

function applyCurrentSort() {
  // tìm sort đang active
  let activeKey = null;
  for (const k of Object.keys(sortStates)) {
    if (sortStates[k] !== 'none') { activeKey = k; break; }
  }

  if (!activeKey) {
    // reset về thứ tự gốc
    allCoinsView = [...allCoinsOriginal];
    return;
  }

  const dir  = sortStates[activeKey];                  // 'desc' | 'asc'
  const fKey = sortFieldByKey[activeKey];             // field trong object
  allCoinsView = [...allCoinsOriginal].sort((a, b) => {
    const av = Number(a[fKey] ?? 0);
    const bv = Number(b[fKey] ?? 0);
    return dir === 'desc' ? (bv - av) : (av - bv);
  });
}

function updateSortHeaderUI() {
  // gắn title để dễ hiểu trạng thái
  const th5m  = document.getElementById('th-5m');
  const th1h  = document.getElementById('th-1h');
  const th24h = document.getElementById('th-24h');
  if (th5m)  th5m.title  = `5m % (${sortStates['5m']})`;
  if (th1h)  th1h.title  = `1h % (${sortStates['1h']})`;
  if (th24h) th24h.title = `24h % (${sortStates['24h']})`;
}

function cycleSort(key) {
  // none -> desc -> asc -> none
  const cur = sortStates[key];
  const next = cur === 'none' ? 'desc' : cur === 'desc' ? 'asc' : 'none';
  sortStates[key] = next;
  clearOtherSorts(key);
  applyCurrentSort();
  updateSortHeaderUI();
  currentPage = 1;
  displayCoinsPage(currentPage);
}

/** ============== WATCHLIST API ============== */
async function loadWatchlist() {
  if (!isLoggedIn()) { watchlistSet = new Set(); return; }
  try {
    const res = await axios.get(WATCH.GET);
    const symbols = (res.data?.items || []).map(i => i.symbol);
    watchlistSet = new Set(symbols);
  } catch (e) {
    console.warn('watchlist load failed', e?.response?.status || e);
    watchlistSet = new Set();
  }
}

async function toggleWatch(symbol) {
  if (!isLoggedIn()) {
    const hint = document.getElementById('login-hint');
    if (hint) hint.style.display = 'block';
    return;
  }
  const has = watchlistSet.has(symbol);
  try {
    if (has) {
      await axios.delete(WATCH.DEL(symbol));
      watchlistSet.delete(symbol);
    } else {
      await axios.post(WATCH.ADD, { symbol });
      watchlistSet.add(symbol);
    }

    // nếu đang ở tab Watch, giữ trang hợp lý khi số item thay đổi
    if (viewMode === 'watch') {
      const total = currentList().length;
      const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (currentPage > maxPage) currentPage = maxPage;
    }

    // cập nhật icon ngay
    document.querySelectorAll(`.watch-btn[data-symbol="${symbol}"]`)
      .forEach(b => b.classList.toggle('on', !has));

    displayCoinsPage(currentPage);
  } catch (e) {
    console.error('Watchlist API error', e?.response?.status, e?.response?.data || e);
    const status = e?.response?.status;
    if (status === 401) {
      document.getElementById('login-hint')?.style && (document.getElementById('login-hint').style.display = 'block');
    } else if (status === 404) {
      alert('Watchlist endpoint not found. Check backend routes.');
    } else {
      alert('Watchlist failed. See console for details.');
    }
  }
}

/** ============== RENDER TABLE ============== */
function displayCoinsPage(page = 1) {
  const tbody = document.getElementById('coin-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Áp dụng tab (all/watch) + search filter
  const list0 = currentList();
  const list = filterAndRank(list0);
  if (list.length === 0) {
    if (viewMode === 'watch') {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'empty-hint';
      td.textContent = 'Your watchlist is empty.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    renderPagination(0);
    return;
  }

  const start = (page - 1) * PAGE_SIZE;
  const end   = start + PAGE_SIZE;
  const pageCoins = list.slice(start, end);

  pageCoins.forEach((coin) => {
    const row = document.createElement('tr');
    row.dataset.symbol = coin.symbol;
    row.dataset.name   = coin.name;

    const cls5m  = changeClass(coin.percentChange5min);
    const cls1h  = changeClass(coin.percentChange1h);
    const cls24h = changeClass(coin.percentChange24h);
    const watched = watchlistSet.has(coin.symbol);

    row.innerHTML = `
      <td>${coin.cmc_rank}</td>
      <td>
        <button class="watch-btn ${watched ? 'on' : ''}"
                data-symbol="${coin.symbol}"
                title="${watched ? 'Remove from Watchlist' : 'Add to Watchlist'}">★</button>
        ${highlight(coin.name, searchTerm)} (${highlight(coin.symbol, searchTerm)})
      </td>
      <td>$${Number(coin.currentPrice).toLocaleString(undefined,{ maximumFractionDigits: 8 })}</td>
      <td class="${cls5m}">${Number(coin.percentChange5min).toFixed(2)}%</td>
      <td class="${cls1h}">${Number(coin.percentChange1h).toFixed(2)}%</td>
      <td class="${cls24h}">${Number(coin.percentChange24h).toFixed(2)}%</td>
      <td>$${Number(coin.volume24h).toLocaleString()}</td>
      <td>$${Number(coin.marketCap).toLocaleString()}</td>
    `;


    tbody.appendChild(row);
  });

  renderPagination(list.length);
}

/** ============== PAGINATION ============== */
function renderPagination(totalCount) {
  const container = document.getElementById('pagination');
  if (!container) return;

  const total = totalCount ?? currentList().length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '<';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; displayCoinsPage(currentPage); } };
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = (i === currentPage) ? 'active' : '';
    btn.onclick = () => { currentPage = i; displayCoinsPage(currentPage); };
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '>';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; displayCoinsPage(currentPage); } };
  container.appendChild(nextBtn);
}

/** ============== FETCH ============== */
async function fetchTopCoins() {
  try {
    const res = await axios.get(`${COINS_BASE}/top-coins`);
    const data = Array.isArray(res.data) ? res.data : [];
    allCoinsOriginal = data.map((c, i) => ({
      ...c,
      __idx: i,
      _normName: normalize(c.name),
      _normSymbol: normalize((c.symbol || '')),
    }));

    allCoinsView = [...allCoinsOriginal];

    // áp sort hiện tại (nếu có) sau khi fetch
    applyCurrentSort();

    await loadWatchlist();
    currentPage = 1;
    displayCoinsPage(currentPage);
  } catch (err) {
    console.error('Error fetching top coins:', err);
  }
}

/** ============== EVENTS ============== */
// Event delegation: 1 listener cho cả bảng
function bindTableEvents() {
  const tbody = document.getElementById('coin-table-body');
  if (!tbody) return;

  tbody.addEventListener('click', (e) => {
    const star = e.target.closest('.watch-btn');
    if (star) {
      e.stopPropagation();
      toggleWatch(star.dataset.symbol);
      return;
    }
    const row = e.target.closest('tr');
    if (row?.dataset.symbol && row?.dataset.name) {
      openChart(row.dataset.symbol, row.dataset.name);
    }
  });
}

function bindTabs() {
  document.getElementById('tab-all')?.addEventListener('click', () => {
    viewMode = 'all'; currentPage = 1; setActiveTab(); displayCoinsPage(currentPage);
  });
  document.getElementById('tab-watch')?.addEventListener('click', () => {
    viewMode = 'watch'; currentPage = 1; setActiveTab(); displayCoinsPage(currentPage);
  });
}
function debounce(fn, wait = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function normalize(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text, qRaw) {
  if (!qRaw) return text;
  const re = new RegExp(`(${escapeRegex(qRaw)})`, 'ig');
  return String(text ?? '').replace(re, '<mark>$1</mark>');
}

function hasActiveSort() {
  return Object.values(sortStates).some(s => s !== 'none');
}

// Xếp hạng theo độ khớp: symbol==query > symbol startsWith > name/symbol includes
function scoreByQuery(coin, qNorm) {
  const sym = coin._normSymbol;
  const name = coin._normName;
  if (!qNorm) return 0;
  if (sym === qNorm) return 3;
  if (sym.startsWith(qNorm)) return 2;
  if (sym.includes(qNorm) || name.includes(qNorm)) return 1;
  return 0;
}

// Lọc + (nếu không bật sort) thì xếp hạng theo relevance
function filterAndRank(list) {
  const q = (searchTerm || '').trim();
  if (!q) return list;
  const qNorm = normalize(q);
  let filtered = list.filter(c => c._normSymbol.includes(qNorm) || c._normName.includes(qNorm));
  if (!hasActiveSort()) {
    filtered = filtered.sort((a, b) => {
      const sa = scoreByQuery(a, qNorm);
      const sb = scoreByQuery(b, qNorm);
      if (sa !== sb) return sb - sa;
      return Number(b.marketCap ?? 0) - Number(a.marketCap ?? 0); // tie-break theo MC
    });
  }
  return filtered;
}
function bindSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', debounce((e) => {
    searchTerm = e.target.value || '';
    currentPage = 1;
    displayCoinsPage(currentPage);
  }, 150));
}

function bindSorting() {
  document.getElementById('th-5m')?.addEventListener('click', () => cycleSort('5m'));
  document.getElementById('th-1h')?.addEventListener('click', () => cycleSort('1h'));
  document.getElementById('th-24h')?.addEventListener('click', () => cycleSort('24h'));
}

/** ============== INIT ============== */
window.addEventListener('DOMContentLoaded', async() => {
  bindTableEvents();
  bindTabs();
  bindSorting();
  bindSearch()
  updateSortHeaderUI();
  updateBellVisibility(); 
  await refreshNotifStatusFromServer();
  fetchTopCoins();
  setInterval(fetchTopCoins, 60 * 1000);
});
