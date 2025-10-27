// ===== chart.js (Line + Avg + Volume + Candle toggle) =====
(function () {
  const API_BASE = 'http://localhost:5000/api/coins';

  // --- query + DOM
  const qs = new URLSearchParams(location.search);
  const symbol = (qs.get('symbol') || '');
  const name = qs.get('name') || '';
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  
  if (!symbol) { titleEl.textContent = 'Missing symbol'; subtitleEl.textContent = ''; return; }
  titleEl.textContent = `${name} (${symbol}) — ~7 Days`;

  let chart;
  let rawHistory = { points: [], volumes: [] };

  // [ADD] --- chart type toggle
  let chartType = 'line'; // default
  document.getElementById('btn-line').onclick = () => {
    chartType = 'line';
    renderChart();
    setActive('btn-line');
  };
  document.getElementById('btn-candle').onclick = () => {
    chartType = 'candle';
    renderChart();
    setActive('btn-candle');
  };
  function setActive(id) {
    document.querySelectorAll('.chart-type-switch button').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // --- coin info (rút gọn)
  async function getCoinInfoBySymbol(symbol) {
    try {
      const { data } = await axios.get(`${API_BASE}/top-coins`);
      const c = data.find(x => x.symbol === symbol);
      if (!c) return null;
      return {
        currentPrice: c.currentPrice,
        marketCap: c.marketCap,
        circulatingSupply: c.circulating_supply,
        totalSupply: c.total_supply,
        maxSupply: c.max_supply || '∞',
        volumeChange24h: c.volumeChange24h,
        fullyDilutedMarketCap: c.fullyDilutedMarketCap
      };
    } catch { return null; }
  }
  (async () => {
    const c = await getCoinInfoBySymbol(symbol);
    if (!c) return;
    const $ = id => document.getElementById(id);
    $('price').textContent = `$${c.currentPrice}`;
    $('market-cap').textContent = `$${(c.marketCap ?? 0).toLocaleString()}`;
    $('circulating-supply').textContent = (c.circulatingSupply ?? 0).toLocaleString();
    $('volume-change-24h').textContent = `${c.volumeChange24h ?? '--'}%`;
    $('total-supply').textContent = c.totalSupply ? c.totalSupply.toLocaleString() : '--';
    $('max-supply').textContent = c.maxSupply ? c.maxSupply.toLocaleString() : '--';
    $('fdv').textContent = `${c.fullyDilutedMarketCap ?? '--'}`;
  })();

  // --- helper: chèn giao điểm với avg để đổi màu mượt
  function injectAvgIntersections(points, avg) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      if (i === 0) { out.push(p1); continue; }
      const p0 = points[i-1];
      const d0 = p0.y - avg, d1 = p1.y - avg;
      if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) {
        const x0 = +p0.x, x1 = +p1.x;
        const ratio = (avg - p0.y) / (p1.y - p0.y);
        out.push({ x: new Date(x0 + ratio * (x1 - x0)), y: avg });
      }
      out.push(p1);
    }
    return out;
  }

  // --- màu & theme
  const GREEN = '#1ecb73', RED = '#ff3b57';
  const GRID  = '#1f2a38', TICK = '#7e8ca3';

  // --- render chung
  function baseOptions({ ySuggestedMin, suggestedMaxVol }) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1620',
          borderColor: '#29374a',
          borderWidth: 1,
          titleColor: '#c9d4e5',
          bodyColor: '#e9f0ff',
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.type === 'bar') {
                const v = Number(ctx.parsed?.y || 0);
                return 'Volume ' + new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:2 }).format(v);
              }
              if (ctx.dataset.label === 'Avg') return ' Avg $' + (ctx.parsed?.y ?? 0);
              return ' $' + (ctx.parsed?.y ?? 0);
            }
          }
        }
      },
      layout: {
        padding: { left: 10, right: 10 }
      },

      elements: { line: { capBezierPoints: true }, point: { hitRadius: 8 } },
      scales: {
        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' }, grid: { color: GRID }, ticks: { color: TICK } },
        y: { position: 'right', grid: { color: GRID }, suggestedMin: ySuggestedMin, ticks: { color: TICK, callback: v => '$' + Number(v) } },
        yVol: { position: 'left', grid: { drawOnChartArea: false }, suggestedMin: 0, suggestedMax: suggestedMaxVol, ticks: { display: false } }
      }
    };
  }

  function destroyChart() { if (chart) chart.destroy(); }

  // --- render LINE (giữ volume dưới)
  function renderLine(points, volumes) {
    const prices = points.map(p => p.y);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = Math.max(1e-12, maxP - minP);
    const avg = prices.reduce((s,v)=>s+v,0)/prices.length;
    const lastX = points.at(-1).x;
    const sevenDaysAgo = new Date(+lastX - 7*24*60*60*1000);   
    // đẩy trục giá lên để chừa đáy cho volume
    const ySuggestedMin = minP + range * 0.22;

    const maxVol = Math.max(...volumes, 0);
    const suggestedMaxVol = maxVol > 0 ? maxVol * 10 : 1;

    const volColors = volumes.map((_, i) => {
      if (i === 0) return 'rgba(128,128,128,0.35)';
      return points[i].y >= points[i - 1].y ? 'rgba(0,200,140,0.38)' : 'rgba(255,70,70,0.38)';
    });

    const injected = injectAvgIntersections(points, avg);
    const greenGrad = 'rgba(30,203,115,0.12)';
    const redGrad   = 'rgba(255,59,87,0.12)';

    const ctx = document.getElementById('coinChart').getContext('2d');
    destroyChart();
    chart = new Chart(ctx, {
      data: {
        datasets: [
          // Volume
          {
            type: 'bar',
            label: 'Volume',
            data: points.map((p, i) => ({ x: p.x, y: volumes[i] })),
            parsing: false,
            yAxisID: 'yVol',
            backgroundColor: volColors,
            borderWidth: 0,
            barThickness: Math.max(1, Math.floor(700 / points.length)),
            maxBarThickness: 4,
            categoryPercentage: 1,
            barPercentage: 1,
            order: 0
          },
          // Price line + area fill
          {
            type: 'line',
            label: `${symbol} Price`,
            data: injected,
            parsing: false,
            yAxisID: 'y',
            spanGaps: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 3.5,
            pointHoverBackgroundColor: ctx => (ctx.parsed.y >= avg) ? GREEN : RED,
            pointHoverBorderColor:   ctx => (ctx.parsed.y >= avg) ? GREEN : RED,
            pointHoverBorderWidth: 2,
            tension: 0.25,
            fill: { target: ySuggestedMin },  // không đè volume
            borderColor: GREEN,
            backgroundColor: greenGrad,
            segment: {
              borderColor: ctx => (ctx.p0.parsed.y >= avg && ctx.p1.parsed.y >= avg) ? GREEN : RED,
              backgroundColor: ctx => (ctx.p0.parsed.y >= avg && ctx.p1.parsed.y >= avg) ? greenGrad : redGrad
            },
            order: 2
          },
          // Avg line
          {
            type: 'line',
            label: 'Avg',
            data: points.map(p => ({ x: p.x, y: avg })),
            parsing: false,
            yAxisID: 'y',
            borderColor: '#9aa7bd',
            borderDash: [6, 6],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0,
            order: 3
          }
        ]
      },
      options: {
        ...baseOptions({ ySuggestedMin, suggestedMaxVol }),
        scales:{
          ...baseOptions({ ySuggestedMin, suggestedMaxVol }).scales,
          x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' },
          grid: { color: GRID },
          ticks: { color: TICK },
          min: sevenDaysAgo,       
          max: lastX
        }}
      },


    });
  }

  // [ADD] --- render candle (từ API /ohlc/:symbol)
async function renderCandle() {
  try {
    const { data } = await axios.get(`${API_BASE}/ohlc/${symbol}`);
    if (!data || !data.length) {
      subtitleEl.textContent = 'No candle data returned from API.';
      return;
    }

    // --- Chuẩn hóa dữ liệu nến
    const candleData = data.map(d => ({
      x: new Date(d.t),
      o: d.open,
      h: d.high,
      l: d.low,
      c: d.close
    }));

    const lastDate = new Date(candleData.at(-1).x);
    const firstDate = new Date(candleData[0].x);
    const sevenDaysAgo = new Date(lastDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const filtered =
      candleData.length > 0
        ? candleData.filter(d => d.x >= sevenDaysAgo)
        : candleData;

    const rangeDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

    const ctx = document.getElementById('coinChart').getContext('2d');
    destroyChart();

    chart = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: `${symbol} OHLC Chart`,
            data: filtered,
            borderColor: '#1ecb73',
            color: {
              up: '#1ecb73',
              down: '#ff3b57',
              unchanged: '#7e8ca3'
            },
            barThickness: 8,
            borderWidth: 1.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#0f1620',
            borderColor: '#29374a',
            borderWidth: 1,
            titleColor: '#c9d4e5',
            bodyColor: '#e9f0ff',
            callbacks: {
              label: ctx => {
                const d = ctx.raw;
                return `O:${d.o}  H:${d.h}  L:${d.l}  C:${d.c}`;
              }
            }
          }
        },
        layout: {
          padding: { left: 10, right: 10, bottom: 14 } 
        },
        scales: {
          x: {
            type: 'timeseries',
            // ✅ ép unit + step để có nhãn như line chart
            time: {
              unit: rangeDays < 1 ? 'hour' : 'day',
              stepSize: rangeDays < 1 ? 2 : 1,
              tooltipFormat: 'MMM dd HH:mm',
              displayFormats: {
                hour: 'HH:mm',
                day: 'MMM dd'
              }
            },
            // ✅ giúp hiện nhãn đều, không auto-skip quá mạnh tay
            ticks: {
              display: true,
              color: '#7e8ca3',
              source: 'data',        // lấy mốc từ chính dữ liệu nến
              autoSkip: false,       // đừng bỏ quá nhiều nhãn
              maxRotation: 0,
              minRotation: 0,
              padding: 6,
              maxTicksLimit: 12      // tránh quá dày
            },
            grid: { color: '#1f2a38' },
            offset: false,            // tránh tạo khoảng trắng hai đầu làm “tụt” labels
            bounds: 'ticks' 
          },
          y: {
            position: 'right',
            grid: { color: '#1f2a38' },
            ticks: {
              color: '#7e8ca3',
              callback: v => '$' + Number(v).toLocaleString()
            }
          }
        }
      }
    });

    // --- Cập nhật subtitle cho đẹp
    const first = filtered[0].x;
    const avg =
      filtered.reduce((s, d) => s + (d.c ?? 0), 0) / filtered.length;
    const change =
      ((filtered.at(-1).c - filtered[0].o) / filtered[0].o) * 100;

    subtitleEl.textContent = `Candles: ${filtered.length} • ${first.toLocaleString()} → ${lastDate.toLocaleString()} • Δ ${change.toFixed(
      2
    )}% • Avg: $${avg.toFixed(2)}`;
  } catch (err) {
    console.error('Error loading candle data:', err);
    subtitleEl.textContent = 'Error loading candle data.';
  }
}




  // [ADD] --- smart switch renderer
  function renderChart() {
    if (chartType === 'line') {
      renderLine(rawHistory.points, rawHistory.volumes);
    } else {
      renderCandle();
    }
  }

  // --- fetch + initial render
  (async function loadAndRender() {
    try {
      const { data } = await axios.get(`${API_BASE}/history/${symbol}`);
      if (!Array.isArray(data) || data.length < 2) {
        subtitleEl.textContent = 'No/insufficient data returned from API.'; return;
      }
      data.sort((a,b)=>new Date(a.t)-new Date(b.t));
      rawHistory.points  = data.map(d => ({ x: new Date(d.t), y: Number(d.price) }));
      rawHistory.volumes = data.map(d => Number(d.volume ?? 0));

      const first = rawHistory.points[0].x, last = rawHistory.points.at(-1).x;
      const change = ((rawHistory.points.at(-1).y - rawHistory.points[0].y) / rawHistory.points[0].y) * 100;
      const avg = rawHistory.points.reduce((s,p)=>s+p.y,0)/rawHistory.points.length;
      subtitleEl.textContent = `Points: ${data.length} • ${first.toLocaleString()} → ${last.toLocaleString()} • Δ ${change.toFixed(2)}% • Avg: $${avg}`;

      renderChart(); // [ADD] dùng hàm tổng hợp
    } catch (err) {
      console.error('Chart load error:', err?.response?.status, err?.response?.data || err.message);
      subtitleEl.textContent = 'Error loading chart data.';
    }
  })();
})();
