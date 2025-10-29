// ===== chart.js (Line + Avg + Volume + Candle + MarketCap) =====
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
  let rawHistory = { points: [], volumes: [], marketCap: [] };
  let chartType = 'line';              // 'line' | 'candle' | 'marketCap'
  let rangeKey = '7d';                 // future: '1d' | '7d' | '30d'

  // ===== helpers =====
  function setActive(id) {
    document.querySelectorAll('.chart-type-switch button').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
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
      layout: { padding: { left: 10, right: 10 } },
      elements: { line: { capBezierPoints: true }, point: { hitRadius: 8 } },
      scales: {
        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' }, grid: { color: GRID }, ticks: { color: TICK } },
        y: { position: 'right', grid: { color: GRID }, suggestedMin: ySuggestedMin, ticks: { color: TICK, callback: v => '$' + Number(v) } },
        yVol: { position: 'left', grid: { drawOnChartArea: false }, suggestedMin: 0, suggestedMax: suggestedMaxVol, ticks: { display: false } }
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
    const prices = points.map(p => p.y);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = Math.max(1e-12, maxP - minP);
    const avg = prices.reduce((s,v)=>s+v,0)/prices.length;
    const lastX = points.at(-1).x;
    const sevenDaysAgo = new Date(+lastX - 7*24*60*60*1000);

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
          x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd HH:mm' },
               grid: { color: GRID }, ticks: { color: TICK }, min: sevenDaysAgo, max: lastX }
        }
      }
    });
  }

  function renderMarketCapChart(points, volumes, marketCap) {
    const caps = marketCap;
    if (!caps?.length) return;

    // --- cửa sổ 7 ngày mặc định
    const lastX = points.at(-1)?.x;
    const firstX = points[0]?.x;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const minX = new Date(+lastX - 7 * ONE_DAY);
    const rangeDays = (+lastX - +firstX) / ONE_DAY;
    const timeUnit = rangeDays <= 2 ? 'hour' : 'day';

    const minC = Math.min(...caps), maxC = Math.max(...caps);
    const range = Math.max(1e-12, maxC - minC);

    // giữ volume ~12% chiều cao
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
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        plugins: { legend: { display: true } },
        // chỉ giữ 2 trục: yMC & yVol, KHÔNG khai báo 'y' để tránh trục $0–$1
        scales: {
          x: {
            type: 'time',
            time: { unit: timeUnit, tooltipFormat: 'MMM dd HH:mm' },
            min: minX, max: lastX,
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

  // --- render candle
  async function renderCandle() {
    try {
      const { data } = await axios.get(`${API_BASE}/ohlc/${symbol}`);
      if (!data || !data.length) { subtitleEl.textContent = 'No candle data returned from API.'; return; }

      const candleData = data.map(d => ({ x: new Date(d.t), o: d.open, h: d.high, l: d.low, c: d.close }));
      const lastDate = new Date(candleData.at(-1).x);
      const firstDate = new Date(candleData[0].x);
      const sevenDaysAgo = new Date(lastDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const filtered = candleData.filter(d => d.x >= sevenDaysAgo);
      const rangeDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

      const ctx = document.getElementById('coinChart').getContext('2d');
      destroyChart();
      chart = new Chart(ctx, {
        type: 'candlestick',
        data: { datasets: [{ label: `${symbol} OHLC Chart`, data: filtered,
          borderColor: '#1ecb73',
          color: { up: '#1ecb73', down: '#ff3b57', unchanged: '#7e8ca3' },
          barThickness: 6, borderWidth: 1.2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, aspectRatio: 2,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false },
            tooltip: { mode: 'index', intersect: false, backgroundColor: '#0f1620', borderColor: '#29374a', borderWidth: 1,
              titleColor: '#c9d4e5', bodyColor: '#e9f0ff',
              callbacks: { label: ctx => { const d = ctx.raw; return `O:${d.o}  H:${d.h}  L:${d.l}  C:${d.c}`; }}} },
          layout: { padding: { left: 8, right: 8, bottom: 14 } },
          scales: {
            x: {
              type: 'timeseries',
              time: { unit: rangeDays < 1 ? 'hour' : 'day', stepSize: rangeDays < 1 ? 2 : 1,
                tooltipFormat: 'MMM dd HH:mm', displayFormats: { hour: 'HH:mm', day: 'MMM dd' } },
              ticks: { display: true, color: TICK, source: 'data', autoSkip: false, maxRotation: 0, minRotation: 0, padding: 6, maxTicksLimit: 12 },
              grid: { color: GRID }, offset: false, bounds: 'ticks'
            },
            y: { position: 'right', grid: { color: GRID }, ticks: { color: TICK, callback: v => '$' + Number(v).toLocaleString() } }
          }
        }
      });

      const first = filtered[0].x;
      const avg = filtered.reduce((s, d) => s + (d.c ?? 0), 0) / filtered.length;
      const change = ((filtered.at(-1).c - filtered[0].o) / filtered[0].o) * 100;
      subtitleEl.textContent = `Candles: ${filtered.length} • ${first.toLocaleString()} → ${lastDate.toLocaleString()} • Δ ${change.toFixed(2)}% • Avg: $${avg.toFixed(2)}`;
    } catch (err) {
      console.error('Error loading candle data:', err);
      subtitleEl.textContent = 'Error loading candle data.';
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

  // ===== fetch + initial render =====
  (async function loadAndRender() {
    try {
      const { data } = await axios.get(`${API_BASE}/history/${symbol}`);
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
