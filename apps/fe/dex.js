const API = 'http://localhost:5000/api/dex';

const $net = document.getElementById('networkSelect');
const $tbody = document.getElementById('dexTbody');

function fmtUSD(v) {
  if (v == null) return '-';
  const n = Number(v);
  if (!isFinite(n)) return '-';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtPct(v) {
  if (v == null) return '-';
  const n = Number(v);
  if (!isFinite(n)) return '-';
  return `${n.toFixed(1)}%`;
}

async function loadNetworks() {
  const { data } = await axios.get(`${API}/networks`);
  const nets = (data?.data || []).sort((a, b) => a.id.localeCompare(b.id));

  $net.innerHTML = '';
  for (const n of nets) {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = `${n.name} (${n.id})`;
    $net.appendChild(opt);
  }

  // mặc định Bitcoin: ưu tiên id 'bitcoin' hoặc 'btc', không có thì lấy phần tử đầu
  const preferred = ['bitcoin', 'btc'];
  const def = nets.find(n => preferred.includes(n.id.toLowerCase()))?.id || (nets[0]?.id || '');
  if (def) $net.value = def;
}

function renderDexTable(rows) {
  $tbody.innerHTML = '';
  rows.forEach((d, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${d.name || d.id}</td>
      <td>${(d.network || '').toUpperCase()}</td>
      <td>${d.pools_count ?? '-'}</td>
      <td>${fmtUSD(d.volume24h_usd)}</td>
      <td>${fmtPct(d.market_share_24h)}</td>
      <td>${
        d.gecko_terminal_url
          ? `<a href="${d.gecko_terminal_url}" target="_blank" rel="noopener">Open</a>`
          : d.website_url
          ? `<a href="${d.website_url}" target="_blank" rel="noopener">Website</a>`
          : '-'
      }</td>
    `;
    $tbody.appendChild(tr);
  });
}

async function loadDexes(network) {
  if (!network) return; // tránh gọi rỗng
  const { data } = await axios.get(`${API}/list`, { params: { network } });
  renderDexTable(data?.data || []);
}

(async function init() {
  await loadNetworks();
  if ($net.value) await loadDexes($net.value);
  $net.addEventListener('change', () => loadDexes($net.value));
})();
