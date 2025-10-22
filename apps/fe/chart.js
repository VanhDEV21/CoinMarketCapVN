// ===== chart.js (CMC style, average line, up/down by avg - stable) =====
(function () {
  const API_BASE = 'http://localhost:5000/api/coins';

  // đọc query
  const qs = new URLSearchParams(location.search);
  const symbol = (qs.get('symbol') || '');
  const name = qs.get('name') || '';

  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');

  if (!symbol) {
    titleEl.textContent = 'Missing symbol';
    subtitleEl.textContent = '';
    return;
  }
  titleEl.textContent = `${name} (${symbol}) — ~7 Days`;

  let chart;
  // Hàm lấy dữ liệu cho coin theo symbol
async function getCoinInfoBySymbol(symbol) {
  try {
    // Gọi API /top-coins để lấy danh sách các coin
    const response = await axios.get('http://localhost:5000/api/coins/top-coins');

    // Tìm coin trong danh sách theo symbol
    const coin = response.data.find(c => c.symbol === symbol);

    if (!coin) {
      console.error('Coin not found');
      return null;
    }

    // Trả về thông tin coin cần thiết
    return {
      name: coin.name,
      symbol: coin.symbol,
      currentPrice: coin.currentPrice,
      marketCap: coin.marketCap,
      circulatingSupply: coin.circulating_supply,
      totalSupply: coin.total_supply,
      maxSupply: coin.max_supply || '∞',
      volume24h: coin.volume24h,
      volumeChange24h: coin.volumeChange24h,
      percentChange1h: coin.percentChange1h,
      percentChange24h: coin.percentChange24h,
      percentChange7d: coin.percentChange7d,
      marketCapDominance: coin.marketCapDominance,
      cmcRank: coin.cmc_rank,
      fullyDilutedMarketCap: coin.fullyDilutedMarketCap,
      timestamp: coin.timestamp,
    };
  } catch (error) {
    console.error('Error fetching coin data:', error);
    return null;
  }
}

async function fetchCoinInfo(symbol) {
  try {
        const coin = await getCoinInfoBySymbol(symbol);
    if (!coin) {
      console.error('Coin not found');
      return;
    }

    // Cập nhật thông tin đồng tiền vào phần Coin Info
    document.getElementById('price').textContent = `$${coin.currentPrice}`;
    document.getElementById('market-cap').textContent = `$${coin.marketCap.toLocaleString()}`;
    document.getElementById('volume-change-24h').textContent = `$${coin.volumeChange24h.toLocaleString()}`;
    document.getElementById('circulating-supply').textContent = coin.circulatingSupply.toLocaleString();
    document.getElementById('total-supply').textContent = coin.totalSupply ? coin.totalSupply.toLocaleString() : '--';
    document.getElementById('max-supply').textContent = coin.maxSupply ? coin.maxSupply.toLocaleString() : '--';
    document.getElementById('fdv').textContent = `${coin.fullyDilutedMarketCap}`;
  } catch (err) {
    console.error('Error fetching coin info:', err);
  }
}
 fetchCoinInfo(symbol);

// === NEW: chèn điểm giao giữa đoạn (p0->p1) với avg để đổi màu đúng tại giao điểm
function injectAvgIntersections(points, avg) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    if (i === 0) { out.push(p1); continue; }
    const p0 = points[i-1];

    const d0 = p0.y - avg;
    const d1 = p1.y - avg;

    // Khác phía so với avg => có giao điểm
    if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) {
      const x0 = +new Date(p0.x), x1 = +new Date(p1.x);
      const ratio = (avg - p0.y) / (p1.y - p0.y); // 0..1
      const xCross = new Date(x0 + ratio * (x1 - x0));
      out.push({ x: xCross, y: avg });  // chèn điểm giao
    }
    out.push(p1);
  }
  return out;
}

  (async function loadAndRender() {
    try {
      const { data } = await axios.get(`${API_BASE}/history/${symbol}`);
      if (!Array.isArray(data) || data.length < 2) {
        subtitleEl.textContent = 'No/insufficient data returned from API.';
        console.error('History API returned:', data);
        return;
      }

      // đảm bảo thời gian tăng dần
      data.sort((a, b) => new Date(a.t) - new Date(b.t));
      // chuẩn hóa thành {x, y}
      const rawPoints = data.map(d => ({ x: new Date(d.t), y: Number(d.price) }));
      const prices = rawPoints.map(p => p.y);

      // average toàn bộ chuỗi hiện có
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;

      // chèn điểm giao để segment đổi màu chính xác ngay tại avg
      const points = injectAvgIntersections(rawPoints, avg);


      const first = points[0].x, last = points.at(-1).x;
      const change = ((points.at(-1).y - points[0].y) / points[0].y) * 100;

      subtitleEl.textContent =
        `Points: ${data.length} • ${first.toLocaleString()} → ${last.toLocaleString()} • Δ ${change.toFixed(2)}% • Avg: $${avg}`;

      const ctx = document.getElementById('coinChart').getContext('2d');
      if (chart) chart.destroy();

      // màu & theme
      const GREEN = '#1ecb73', RED = '#ff3b57';
      const GRID  = '#1f2a38', TICK = '#7e8ca3';

      // gradient an toàn (tạo sau layout)
      let greenGrad = 'rgba(30,203,115,0.18)';
      let redGrad   = 'rgba(255,59,87,0.18)';
      const gradientPlugin = {
        id: 'safeGradient',
        afterLayout(c) {
          const { ctx, chartArea } = c;
          if (!chartArea) return;
          const g1 = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g1.addColorStop(0, 'rgba(30,203,115,0.22)');
          g1.addColorStop(1, 'rgba(30,203,115,0.00)');
          const g2 = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g2.addColorStop(0, 'rgba(255,59,87,0.22)');
          g2.addColorStop(1, 'rgba(255,59,87,0.00)');
          greenGrad = g1; redGrad = g2;

          // cập nhật background sau khi có gradient (không animation)
          c.data.datasets[0].backgroundColor = greenGrad; // up
          c.data.datasets[1].backgroundColor = redGrad;   // down
        }
      };

      chart = new Chart(ctx, {
        type: 'line',
        // data: {
        //   labels,
        //   datasets: [
        //     // 1) đoạn TRÊN average (xanh)
        //     {
        //       label: `${symbol} Price (above avg)`,
        //       data: upData,
        //       borderColor: GREEN,
        //       backgroundColor: greenGrad,  
        //       borderWidth: 2,
        //       pointRadius: 0,
        //       tension: 0.25,
        //       fill: true
        //     },
        //     // 2) đoạn DƯỚI average (đỏ)
        //     {
        //       label: `${symbol} Price (below avg)`,
        //       data: downData,
        //       borderColor: RED,
        //       backgroundColor: redGrad,
        //       borderWidth: 2,
        //       pointRadius: 0,
        //       tension: 0.25,
        //       fill: true
        //     },
        //     // 3) đường AVERAGE (gạch đứt)
        //     {
        //       label: '7D Average',
        //       data: labels.map(() => avg),
        //       borderColor: '#9aa7bd',
        //       borderDash: [6, 6],
        //       borderWidth: 1.5,
        //       pointRadius: 0,
        //       tension: 0,
        //       fill: false
        //     }
        //   ]
        // },
        data: {
          // Không cần labels khi dùng {x,y} + thang time
          datasets: [
            // === MAIN: đường giá duy nhất (liền mạch)
            {
              label: `${symbol} Price`,
              data: points,
              parsing: false,
              spanGaps: true,
              borderWidth: 2,
              pointRadius: 0,
              // NEW ↓ chấm hiện ra khi hover và đổi màu theo phía trên/dưới avg
              pointHoverRadius: 4,
              pointHoverBackgroundColor: ctx =>
                (ctx.parsed.y >= avg) ? '#1ecb73' : '#ff3b57',
              pointHoverBorderColor: ctx =>
                (ctx.parsed.y >= avg) ? '#1ecb73' : '#ff3b57',
              pointHoverBorderWidth: 2,
              tension: 0.25,
              fill: true,
              borderColor: '#1ecb73',
              backgroundColor: 'rgba(30,203,115,0.18)',
              segment: {
                borderColor: ctx =>
                  (ctx.p0.parsed.y >= avg && ctx.p1.parsed.y >= avg) ? '#1ecb73' : '#ff3b57'
                // backgroundColor set trong gradientPlugin
              }
            },

            // === AVG line (xám gạch đứt)
            {
              label: '7D Average',
              data: points.map(p => ({ x: p.x, y: avg })),
              parsing: false,
              borderColor: '#9aa7bd',
              borderDash: [6, 6],
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f1620',
              borderColor: '#29374a',
              borderWidth: 1,
              titleColor: '#c9d4e5',
              bodyColor: '#e9f0ff',
              // NEW ↓ tô màu ô vuông từng dòng trong tooltip
              callbacks: {
                labelColor: (ctx) => {
                  if (ctx.datasetIndex === 0) {
                    // dòng GIÁ: xanh nếu >= avg, đỏ nếu < avg
                    const y = ctx.parsed?.y;
                    const color = (y >= avg) ? '#1ecb73' : '#ff3b57';
                    return { borderColor: color, backgroundColor: color };
                  }
                  // dòng AVG: xám
                  return { borderColor: '#9aa7bd', backgroundColor: '#9aa7bd' };
                },
                label: (ctx) => {
                  const v = Number(ctx.parsed?.y);
                  if (ctx.datasetIndex === 0) {
                    // dòng GIÁ
                    return ' $' + v;
                  }
                  // dòng AVG
                  return ' Avg $' + avg;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' },
              grid: { color: GRID },
              ticks: { color: TICK }
            },
            y: {
              position: 'right',
              grid: { color: GRID },
              ticks: {
                color: TICK,
                callback: v => '$' + Number(v)
              }
            }
          },
          layout: { padding: { left: 6, right: 6, top: 4, bottom: 0 } },
          elements: { line: { capBezierPoints: true } }
        },
        plugins: [gradientPlugin]
      });
    } catch (err) {
      console.error('Chart load error:', err?.response?.status, err?.response?.data || err.message);
      subtitleEl.textContent = 'Error loading chart data.';
    }
  })();
})();









