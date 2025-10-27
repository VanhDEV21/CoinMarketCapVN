// // ===== app.js =====

// /** API */
// const API_BASE = 'http://localhost:5000/api/coins';


// /** Màu chữ: tăng = xanh, giảm = đỏ, không đổi = trắng (không class) */
// const changeClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

// /** Điều hướng sang trang chart */
// function openChart(symbol, name) {
//   const url = `chart.html?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`;
//   window.location.href = url;
// }

// /** Render bảng */
// function displayCoins(coins) {
//   const tbody = document.getElementById('coin-table-body');
//   if (!tbody) return;
//   tbody.innerHTML = '';

//   coins.forEach((coin) => {
//     const row = document.createElement('tr');

//     const cls5m  = changeClass(coin.percentChange5min);
//     const cls1h  = changeClass(coin.percentChange1h);
//     const cls24h = changeClass(coin.percentChange24h);

//     row.innerHTML = `
//       <td>${coin.cmc_rank}</td>
//       <td>${coin.name} (${coin.symbol})</td>
//       <td>$${(coin.currentPrice)}</td>
//       <td class="${cls5m}">${coin.percentChange5min.toFixed(2)}%</td>
//       <td class="${cls1h}">${coin.percentChange1h.toFixed(2)}%</td>
//       <td class="${cls24h}">${coin.percentChange24h.toFixed(2)}%</td>
//       <td>$${coin.volume24h.toLocaleString()}</td>
//       <td>$${coin.marketCap.toLocaleString()}</td>
//     `;

//     // Click cả dòng -> mở chart
//     row.style.cursor = 'pointer';
//     row.addEventListener('click', () => openChart(coin.symbol, coin.name));

//     tbody.appendChild(row);
//   });
// }
// // Hàm gọi API để lấy top 100 coins từ database
// async function fetchTopCoins() {
//   await axios.get('http://localhost:5000/api/coins/top-coins')
//     .then(response => {
//       console.log('API top-coins success:', response.data);
//       // Hiển thị dữ liệu lên bảng
//       displayCoins(response.data);
//     })
//     .catch(error => {
//       console.error('Error fetching top coins:', error);
//     });
// }

// // Hàm tự động gọi API mỗi 10 giây
// setInterval(() => {
//   fetchTopCoins();
// }, 60 * 1000);

// /** Khởi động */
// window.addEventListener('DOMContentLoaded', () => {
//   fetchTopCoins();
// });



/** API */
const API_BASE = 'http://localhost:5000/api/coins';

const PAGE_SIZE = 20; // ✅ mỗi trang hiển thị 20 coin
let allCoins = [];
let currentPage = 1;

/** Màu chữ: tăng = xanh, giảm = đỏ, không đổi = trắng (không class) */
const changeClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

/** Điều hướng sang trang chart */
function openChart(symbol, name) {
  const url = `chart.html?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`;
  window.location.href = url;
}

/** Render bảng với phân trang */
function displayCoinsPage(page = 1) {
  const tbody = document.getElementById('coin-table-body');
  if (!tbody || allCoins.length === 0) return;

  tbody.innerHTML = '';

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageCoins = allCoins.slice(start, end);

  pageCoins.forEach((coin) => {
    const row = document.createElement('tr');

    const cls5m  = changeClass(coin.percentChange5min);
    const cls1h  = changeClass(coin.percentChange1h);
    const cls24h = changeClass(coin.percentChange24h);

    row.innerHTML = `
      <td>${coin.cmc_rank}</td>
      <td>${coin.name} (${coin.symbol})</td>
      <td>$${(coin.currentPrice)}</td>
      <td class="${cls5m}">${coin.percentChange5min.toFixed(2)}%</td>
      <td class="${cls1h}">${coin.percentChange1h.toFixed(2)}%</td>
      <td class="${cls24h}">${coin.percentChange24h.toFixed(2)}%</td>
      <td>$${coin.volume24h.toLocaleString()}</td>
      <td>$${coin.marketCap.toLocaleString()}</td>
    `;

    // Click cả dòng -> mở chart
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => openChart(coin.symbol, coin.name));

    tbody.appendChild(row);
  });

  renderPagination();
}

/** Render thanh phân trang */
function renderPagination() {
  const totalPages = Math.ceil(allCoins.length / PAGE_SIZE);
  const container = document.getElementById('pagination');
  if (!container) return;
  container.innerHTML = '';

  // Nút "Prev"
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '<';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      displayCoinsPage(currentPage);
    }
  };
  container.appendChild(prevBtn);

  // Các nút số trang
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = (i === currentPage) ? 'active' : '';
    btn.onclick = () => {
      currentPage = i;
      displayCoinsPage(currentPage);
    };
    container.appendChild(btn);
  }

  // Nút "Next"
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '>';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      displayCoinsPage(currentPage);
    }
  };
  container.appendChild(nextBtn);
}

/** Gọi API lấy top coins */
async function fetchTopCoins() {
  try {
    const res = await axios.get(`${API_BASE}/top-coins`);
    allCoins = res.data;
    currentPage = 1;
    displayCoinsPage(currentPage);
  } catch (err) {
    console.error('Error fetching top coins:', err);
  }
}

// Auto refresh mỗi 1 phút
setInterval(fetchTopCoins, 60 * 1000);
window.addEventListener('DOMContentLoaded', fetchTopCoins);
