// ===== chart.js (Line + Avg + Volume + Candle + MarketCap) =====
(function () {

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/apps/fe/sw.js')
      .catch(console.error);
  }
  const API_BASE = 'http://localhost:5000/api/coins';

  // --- query + DOM
  const qs = new URLSearchParams(location.search);
  const symbol = (qs.get('symbol') || '');
  const name = qs.get('name') || '';
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');

  if (!symbol) { titleEl.textContent = 'Missing symbol'; subtitleEl.textContent = ''; return; }
  titleEl.textContent = `${name} (${symbol})`;

  // --- timeframe (NEW)
  const validTF = ['5m', '10m', '15m', '30m', '1h'];
  let tf = (qs.get('tf') || '1h').toLowerCase();
  if (!validTF.includes(tf)) tf = '1h';

  // Nếu trang có <select id="tf"> thì đồng bộ 2 chiều
  const tfEl = document.getElementById('tf');
  if (tfEl) {
    tfEl.value = tf;
    tfEl.addEventListener('change', () => {
      tf = tfEl.value;
      const url = new URL(location.href);
      url.searchParams.set('tf', tf);
      history.replaceState({}, '', url.toString());
      if (chartType === 'candle') renderChart(); // reload nến khi đổi TF
    });
  }

  let chart;
  let rawHistory = { points: [], volumes: [], marketCap: [] };
  let chartType = 'line';              // 'line' | 'candle' | 'marketCap'
  let rangeKey = '7d';                 // future: '1d' | '7d' | '30d'

  // ===== helpers =====
  function setActive(id) {
    document.querySelectorAll('.chart-type-switch button').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }
  // ƯỚC LƯỢNG KHOẢNG CÁCH THỜI GIAN GIỮA CÁC ĐIỂM (để set minRange)
  function estimateSpacingMs(arr) {
    if (!arr || arr.length < 2) return 5 * 60 * 1000; // fallback 5'
    let min = Infinity;
    for (let i = 1; i < arr.length; i++) {
      const d = +arr[i].x - +arr[i - 1].x;
      if (d > 0 && d < min) min = d;
    }
    return Number.isFinite(min) ? min : 5 * 60 * 1000;
  }

  function destroyChart() { if (chart) chart.destroy(); }

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

  // --- theme
  const GREEN = '#1ecb73', RED = '#ff3b57';
  const GRID  = '#1f2a38', TICK = '#7e8ca3';

  function baseOptions({ ySuggestedMin, suggestedMaxVol }) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1620',
          borderColor: '#29374a',
          borderWidth: 1,
          titleColor: '#c9d4e5',
          bodyColor: '#e9f0ff',
          filter: (item) => item.dataset?.label !== 'Avg', // ẩn dòng Avg cho gọn
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.type === 'bar') {
                const v = Number(ctx.parsed?.y || 0);
                return 'Volume ' + new Intl.NumberFormat('en-US', {
                  notation: 'compact', maximumFractionDigits: 2
                }).format(v);
              }
              return ' $' + (ctx.parsed?.y ?? 0);
            }
          }
        },
        decimation: { enabled: true, algorithm: 'lttb', samples: 1000 }
      },
      layout: { padding: { left: 10, right: 10 } },
      elements: { line: { capBezierPoints: true }, point: { hitRadius: 8 } },
      scales: {
        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' },
             grid: { color: GRID }, ticks: { color: TICK } },
        y: { position: 'right', grid: { color: GRID }, suggestedMin: ySuggestedMin,
             ticks: { color: TICK, callback: v => '$' + Number(v) } },
        yVol: { position: 'left', grid: { drawOnChartArea: false },
                suggestedMin: 0, suggestedMax: suggestedMaxVol, ticks: { display: false } }
      }
    };
  }

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

  // ===== Renderers =====
  function renderLinePrice(points, volumes) {
    if (!points?.length) return;

    const prices = points.map(p => p.y);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = Math.max(1e-12, maxP - minP);
    const avg = prices.reduce((s,v)=>s+v,0)/prices.length;

    const firstX = points[0].x;
    const lastX  = points.at(-1).x;

    const ySuggestedMin = minP + range * 0.30;

    const VOLUME_HEIGHT_FRAC = 0.12;
    const maxVol = Math.max(...volumes, 0);
    const suggestedMaxVol = maxVol > 0 ? (maxVol / VOLUME_HEIGHT_FRAC) : 1;
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
          {
            type: 'bar',
            label: 'Volume',
            data: points.map((p, i) => ({ x: p.x, y: volumes[i] })),
            parsing: false, yAxisID: 'yVol',
            backgroundColor: volColors, borderWidth: 0,
            barThickness: Math.max(1, Math.floor(700 / points.length)), maxBarThickness: 4,
            categoryPercentage: 1, barPercentage: 1, order: 0
          },
          {
            type: 'line',
            label: `${symbol} Price`,
            data: injected, parsing: false, yAxisID: 'y', spanGaps: true,
            borderWidth: 2, pointRadius: 0, tension: 0.25,
            fill: { target: ySuggestedMin },
            borderColor: GREEN, backgroundColor: greenGrad,
            segment: {
              borderColor: ctx => (ctx.p0.parsed.y >= avg && ctx.p1.parsed.y >= avg) ? GREEN : RED,
              backgroundColor: ctx => (ctx.p0.parsed.y >= avg && ctx.p1.parsed.y >= avg) ? greenGrad : redGrad
            },
            order: 2
          },
          {
            type: 'line',
            label: 'Avg',
            data: points.map(p => ({ x: p.x, y: avg })),
            parsing: false, yAxisID: 'y',
            borderColor: '#9aa7bd', borderDash: [6, 6], borderWidth: 1.5,
            pointRadius: 0, fill: false, tension: 0, order: 3
          }
        ]
      },
      options: {
        ...baseOptions({ ySuggestedMin, suggestedMaxVol }),
        scales: {
          ...baseOptions({ ySuggestedMin, suggestedMaxVol }).scales,
          x: {
            type: 'time',
            time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' },
            grid: { color: GRID }, ticks: { color: TICK },
            min: firstX,        // 👈 full lịch sử
            max: lastX
          }
        }
      }
    });
  }

  // === renderMarketCapChart: 4 ngày đầu + minRange theo mật độ điểm
  function renderMarketCapChart(points, volumes, marketCap) {
    const caps = marketCap;
    if (!points?.length || !caps?.length) return;

    const firstX = points[0].x;
    const lastX  = points.at(-1).x;

    const ONE_DAY = 24 * 60 * 60 * 1000;
    const rangeDays = (+lastX - +firstX) / ONE_DAY;
    const timeUnit = rangeDays <= 2 ? 'hour' : 'day';

    const minC = Math.min(...caps), maxC = Math.max(...caps);
    const range = Math.max(1e-12, maxC - minC);

    const VOLUME_HEIGHT_FRAC = 0.12;
    const maxVol = Math.max(...volumes, 0);
    const suggestedMaxVol = maxVol > 0 ? (maxVol / VOLUME_HEIGHT_FRAC) : 1;

    const volColors = caps.map((_, i) => {
      if (i === 0) return 'rgba(128,128,128,0.35)';
      return caps[i] >= caps[i - 1] ? 'rgba(0,200,140,0.35)' : 'rgba(255,70,70,0.35)';
    });

    const ctx = document.getElementById('coinChart').getContext('2d');
    destroyChart();
    chart = new Chart(ctx, {
      data: {
        datasets: [
          {
            type: 'bar',
            label: 'Volume',
            data: points.map((p, i) => ({ x: p.x, y: volumes[i] })),
            parsing: false, yAxisID: 'yVol',
            backgroundColor: volColors, borderWidth: 0,
            barThickness: Math.max(1, Math.floor(700 / points.length)), maxBarThickness: 4,
            categoryPercentage: 1, barPercentage: 1, order: 0
          },
          {
            type: 'line',
            label: 'Market Cap',
            data: points.map((p, i) => ({ x: p.x, y: caps[i] })),
            parsing: false, yAxisID: 'yMC', spanGaps: true,
            borderWidth: 2, pointRadius: 0, tension: 0.25,
            fill: true,
            borderColor: '#4aa8ff', backgroundColor: 'rgba(74,168,255,0.10)',
            order: 1
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        plugins: {
          legend: { display: true },
          decimation: { enabled: true, algorithm: 'lttb', samples: 1000 }
        },
        // chỉ giữ 2 trục: yMC & yVol
        scales: {
          x: {
            type: 'time',
            time: { unit: timeUnit, tooltipFormat: 'MMM dd HH:mm' },
            min: firstX,        // 👈 full lịch sử
            max: lastX,
            ticks: { color: TICK }, grid: { color: GRID }
          },
          yMC: {
            position: 'right',
            suggestedMin: minC + range * 0.00,
            ticks: {
              color: TICK,
              callback: v => '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
            },
            grid: { color: GRID }
          },
          yVol: {
            position: 'left',
            grid: { drawOnChartArea: false },
            suggestedMin: 0, suggestedMax: suggestedMaxVol,
            ticks: { display: false }
          }
        }
      }
    });
  }

  async function renderCandle() {
    try {
      // (NEW) gọi OHLC theo timeframe
      let resp = await axios.get(
        `${API_BASE}/ohlc?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&limit=all`
      );
      let data = resp.data;

      // Fallback nhẹ nếu backend chỉ có /ohlc/:symbol
      if (!Array.isArray(data) || data.length === 0) {
        const old = await axios.get(`${API_BASE}/ohlc/${encodeURIComponent(symbol)}?limit=all`);
        data = old.data;
      }

      if (!data || !data.length) { subtitleEl.textContent = 'No candle data returned from API.'; destroyChart(); return; }

      const candles = data.map(d => ({ x: new Date(d.t || d.time || d.timestamp), o: d.open, h: d.high, l: d.low, c: d.close }));
      const firstX = candles[0].x;
      const lastX  = candles.at(-1).x;

      const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;
      const initMin = firstX;
      const initMax = new Date(Math.min(+firstX + FOUR_DAYS, +lastX));

      // 👇 cửa sổ tối thiểu ≈ 20 nến (tăng nhẹ theo TF để zoom mượt)
      const minRangeMs = Math.max(
        estimateSpacingMs(candles) * 20,
        { '5m': 5, '10m': 10, '15m': 15, '30m': 30, '1h': 60 }[tf] * 60 * 1000 * 10
      );

      const ctx = document.getElementById('coinChart').getContext('2d');
      destroyChart();
      chart = new Chart(ctx, {
        type: 'candlestick',
        data: { datasets: [{
          label: `${symbol} OHLC Chart (${tf})`,
          data: candles,
          borderColor: '#1ecb73',
          color: { up: '#1ecb73', down: '#ff3b57', unchanged: '#7e8ca3' },
          barThickness: 6, borderWidth: 1.2
        }]},
        options: {
          responsive: true, maintainAspectRatio: false, aspectRatio: 2,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: 'index', intersect: false, backgroundColor: '#0f1620', borderColor: '#29374a', borderWidth: 1,
              titleColor: '#c9d4e5', bodyColor: '#e9f0ff',
              callbacks: { label: ctx => { const d = ctx.raw; return `O:${d.o}  H:${d.h}  L:${d.l}  C:${d.c}`; } }
            },
            zoom: {
              pan:   { enabled: true, mode: 'x' },
              zoom:  { wheel: { enabled: true, modifierKey: 'ctrl' }, pinch: { enabled: true }, mode: 'x' },
              limits:{ x: { min: firstX, max: lastX, minRange: minRangeMs } }
            }
          },
          layout: { padding: { left: 8, right: 8, bottom: 14 } },
          scales: {
            x: {
              type: 'timeseries',
              time: {
                unit: 'hour',
                stepSize: 1,
                tooltipFormat: 'MMM dd HH:mm',
                displayFormats: { hour: 'MMM dd HH:mm', day: 'MMM dd' }
              },
              ticks: { display: true, color: TICK, source: 'data', autoSkip: true, maxTicksLimit: 12, maxRotation: 0, minRotation: 0, padding: 6 },
              grid: { color: GRID },
              offset: false,
              bounds: 'ticks',
              min: initMin,
              max: initMax
            },

            // 👇 Giá sang bên phải
            y: {
              position: 'right',          // <-- quan trọng
              grid: { color: GRID },
              ticks: {
                color: TICK,
                callback: v => '$' + Number(v).toLocaleString()
              }
            },

            // (tuỳ chọn) tạo 1 trục trái tắt hiển thị để chắc chắn không còn trục trái
            yLeft: {
              position: 'left',
              display: false,
              grid: { drawOnChartArea: false }
            }
          }

        }
      });

      const change = ((candles.at(-1).c - candles[0].o) / candles[0].o) * 100;
      const avg = candles.reduce((s, d) => s + (d.c ?? 0), 0) / candles.length;
      subtitleEl.textContent = `TF: ${tf} • Candles: ${candles.length} • ${firstX.toLocaleString()} → ${lastX.toLocaleString()} • Δ ${change.toFixed(2)}% • Avg: $${avg.toFixed(2)}`;
    } catch (err) {
      console.error('Error loading candle data:', err?.response?.data || err.message || err);
      subtitleEl.textContent = 'Error loading candle data.';
      destroyChart();
    }
  }

  // ===== smart switch renderer =====
  function renderChart() {
    if (chartType === 'line') {
      renderLinePrice(rawHistory.points, rawHistory.volumes);
    } else if (chartType === 'marketCap') {
      renderMarketCapChart(rawHistory.points, rawHistory.volumes, rawHistory.marketCap);
    } else {
      renderCandle();
    }
  }

  // ===== buttons =====
  document.getElementById('btn-line').onclick = () => { chartType = 'line'; renderChart(); setActive('btn-line'); };
  document.getElementById('btn-candle').onclick = () => { chartType = 'candle'; renderChart(); setActive('btn-candle'); };
  document.getElementById('btn-line-market-cap').onclick = () => { chartType = 'marketCap'; renderChart(); setActive('btn-line-market-cap'); };

  // (tuỳ chọn) nếu bạn có các nút TF riêng:
  const b5  = document.getElementById('btn-tf-5m');
  const b10 = document.getElementById('btn-tf-10m');
  const b15 = document.getElementById('btn-tf-15m');
  const b30 = document.getElementById('btn-tf-30m');
  const b1h = document.getElementById('btn-tf-1h');
  function setTf(newTf){
    if (!validTF.includes(newTf)) return;
    tf = newTf;
    const url = new URL(location.href);
    url.searchParams.set('tf', tf);
    history.replaceState({}, '', url.toString());
    if (tfEl) tfEl.value = tf;
    if (chartType === 'candle') renderChart();
  }
  b5  && (b5.onclick  = () => setTf('5m'));
  b10 && (b10.onclick = () => setTf('10m'));
  b15 && (b15.onclick = () => setTf('15m'));
  b30 && (b30.onclick = () => setTf('30m'));
  b1h && (b1h.onclick = () => setTf('1h'));

  // ===================== Markets table =====================

  function fmtUsd(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    // số nhỏ < 1: hiển thị nhiều chữ số hơn
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  }

  function timeAgo(iso) {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    const d = Date.now() - t;
    if (d < 60e3) return 'just now';
    if (d < 3600e3) return Math.floor(d/60e3) + 'm ago';
    if (d < 24*3600e3) return Math.floor(d/3600e3) + 'h ago';
    return new Date(iso).toLocaleString();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadMarkets(symbol, name) {
    try {
      const url = `${API_BASE}/markets/${encodeURIComponent(symbol)}?name=${encodeURIComponent(name)}&limit=50`;
      const res = await fetch(url);
      const json = await res.json();
      const rows = (json && json.data) ? json.data : [];
      renderMarkets(rows);
    } catch (e) {
      console.error('loadMarkets error', e);
      document.getElementById('markets-loading').textContent = 'Failed to load markets.';
    }
  }

  function renderMarkets(rows) {
    const tbody = document.querySelector('#markets-table tbody');
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.style.borderTop = '1px solid #223';
      tr.innerHTML = `
        <td style="padding:10px;">${i + 1}</td>
        <td style="padding:10px;">${escapeHtml(r.exchange)}</td>
        <td style="padding:10px;">${escapeHtml(r.pair)}</td>
        <td style="padding:10px;">${fmtUsd(r.price)}</td>
        <td style="padding:10px;">${r.spread != null ? (r.spread.toFixed(2) + '%') : '—'}</td>
        <td style="padding:10px;">${fmtUsd(r.volume24h)}</td>
        <td style="padding:10px;">${r.updatedAt ? timeAgo(r.updatedAt) : '—'}</td>
        <td style="padding:10px;">${
          r.tradeUrl ? `<a href="${r.tradeUrl}" target="_blank" rel="noopener">Trade</a>` : ''
        }</td>
      `;
      tbody.appendChild(tr);
    });
    document.getElementById('markets-loading').style.display = 'none';
  }

  // Gọi khi load trang (sau khi bạn đã lấy được symbol & name từ URL)
  loadMarkets(symbol, name);
  setInterval(() => loadMarkets(symbol, name), 60 * 1000);

  // ===== fetch + initial render =====
  (async function loadAndRender() {
    try {
      // lấy full history; nếu BE chưa hỗ trợ all thì endpoint hiện tại của bạn cũng trả full
      const { data } = await axios.get(`${API_BASE}/history/${symbol}?count=all`);
      if (!Array.isArray(data) || data.length < 2) { subtitleEl.textContent = 'No/insufficient data returned from API.'; return; }

      data.sort((a,b)=>new Date(a.t)-new Date(b.t));
      rawHistory.points    = data.map(d => ({ x: new Date(d.t), y: Number(d.price) }));
      rawHistory.volumes   = data.map(d => { const v = Number(d.volume ?? 0); return Number.isFinite(v) ? v : 0; });
      rawHistory.marketCap = data.map(d => { const v = Number(d.marketCap ?? 0); return Number.isFinite(v) ? v : 0; });

      const first = rawHistory.points[0].x, last = rawHistory.points.at(-1).x;
      const change = ((rawHistory.points.at(-1).y - rawHistory.points[0].y) / rawHistory.points[0].y) * 100;
      const avg = rawHistory.points.reduce((s,p)=>s+p.y,0)/rawHistory.points.length;
      subtitleEl.textContent = `Points: ${data.length} • ${first.toLocaleString()} → ${last.toLocaleString()} • Δ ${change.toFixed(2)}% • Avg: $${avg.toFixed(2)}`;

      renderChart();
    } catch (err) {
      console.error('Chart load error:', err?.response?.status, err?.response?.data || err.message);
      subtitleEl.textContent = 'Error loading chart data.';
    }
  })();
})();
