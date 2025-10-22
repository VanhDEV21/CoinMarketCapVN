// ===== app.js =====

/** API */
const API_BASE = 'http://localhost:5000/api/coins';


/** Màu chữ: tăng = xanh, giảm = đỏ, không đổi = trắng (không class) */
const changeClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

/** Điều hướng sang trang chart */
function openChart(symbol, name) {
  const url = `chart.html?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`;
  window.location.href = url;
}

/** Render bảng */
function displayCoins(coins) {
  const tbody = document.getElementById('coin-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  coins.forEach((coin) => {
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
}
// Hàm gọi API để lấy top 100 coins từ database
async function fetchTopCoins() {
  await axios.get('http://localhost:5000/api/coins/top-coins')
    .then(response => {
      console.log('API top-coins success:', response.data);
      // Hiển thị dữ liệu lên bảng
      displayCoins(response.data);
    })
    .catch(error => {
      console.error('Error fetching top coins:', error);
    });
}

// Hàm tự động gọi API mỗi 10 giây
setInterval(() => {
  fetchTopCoins();
}, 60 * 1000);

/** Khởi động */
window.addEventListener('DOMContentLoaded', () => {
  fetchTopCoins();
});

