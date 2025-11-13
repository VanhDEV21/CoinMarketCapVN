const API = 'http://localhost:5000/api/dex';

// Elements
const netSelect   = document.getElementById('netSelect');
const dexTbody    = document.querySelector('#dexTable tbody');
const poolTbody   = document.querySelector('#poolTable tbody');
const toast       = document.getElementById('toast');
const searchInput = document.getElementById('dexSearch');

const drawer      = document.getElementById('drawer');
const drawerMask  = document.getElementById('drawerMask');
const drawerTitle = document.getElementById('drawerTitle');
const drawerClose = document.getElementById('drawerClose');

let currentDexList = []; // cache dex cho filter
let statsQueue = [];     // để load stats tuần tự

// Utils
function showToast(msg, ms=2200){ toast.textContent = msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), ms); }
function n(x){ const v = Number(x||0); return Number.isFinite(v) ? v : 0; }
function fmtUSD(x){ const v = n(x); return v >= 1e9 ? (v/1e9).toFixed(2)+'B' : v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v.toLocaleString(); }
function renderSkeleton(tbody, rows=10, cols=7){
  tbody.innerHTML = Array.from({length:rows}).map(()=>(
    `<tr class="skeleton">${Array.from({length:cols}).map(()=>'<td></td>').join('')}</tr>`
  )).join('');
}
async function getJSON(url, params = {}) {
  const { data } = await axios.get(url, { params });
  if (data?.ok === false) throw new Error(data?.error || 'API_ERROR');
  return data?.data ?? data;
}

// Drawer helpers
function openDrawer(){ drawer.classList.add('open'); drawerMask.classList.add('show'); }
function closeDrawer(){ drawer.classList.remove('open'); drawerMask.classList.remove('show'); }
drawerMask.addEventListener('click', closeDrawer);
drawerClose.addEventListener('click', closeDrawer);

// Load networks
async function loadNetworks() {
  try{
    const nets = await getJSON(`${API}/networks`);
    netSelect.innerHTML = nets.map(n => `<option value="${n.id}">${n.name || n.id}</option>`).join('');
    const btc = nets.find(n => n.id.toLowerCase().includes('bitcoin'))
             || nets.find(n => n.id.toLowerCase()==='btc')
             || nets.find(n => n.id==='eth');
    if (btc) netSelect.value = btc.id;
  }catch(e){ showToast('Load networks failed'); }
}

// Load dex list (without stats first)
async function loadDexes() {
  renderSkeleton(dexTbody, 10, 7);
  try{
    const network = netSelect.value;
    const dexes = await getJSON(`${API}/list`, { network, limit: 30 });
    currentDexList = dexes.map((d, i) => ({
      idx: i+1,
      name: d.name,
      network: d.network,
      pools_count: d.pools_count ?? '-',
      slug: d.identifier || d.id,
      vol24: null, liq: null, mkt: null
    }));
    renderDexRows(currentDexList);
    // lazy load stats với throttle
    statsQueue = [...currentDexList];
    loadStatsQueue(network);
  }catch(e){ dexTbody.innerHTML = ''; showToast('Load DEX list failed'); }
}

// Render dex rows with current data
function renderDexRows(rows){
  const q = searchInput.value?.trim().toLowerCase() || '';
  const filtered = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;

  dexTbody.innerHTML = filtered.map(r => {
    return `
      <tr data-slug="${r.slug}" data-name="${r.name}">
        <td>${r.idx}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="badge">${r.network.toUpperCase()}</div>
            <span class="dex-name" style="cursor:pointer;text-decoration:underline">${r.name}</span>
          </div>
        </td>
        <td>${r.network}</td>
        <td class="right" title="${r.vol24 ?? ''}">${r.vol24==null? '…' : fmtUSD(r.vol24)}</td>
        <td class="right" title="${r.liq ?? ''}">${r.liq==null? '…' : fmtUSD(r.liq)}</td>
        <td class="right">${r.mkt==null? '…' : (n(r.mkt)*100).toFixed(2)+'%'}</td>
        <td class="right">
          <button class="btn primary btn-view" data-slug="${r.slug}" data-name="${r.name}">View</button>
        </td>
      </tr>`;
  }).join('');

  // events
  [...dexTbody.querySelectorAll('tr')].forEach(tr=>{
    tr.addEventListener('click', (e)=>{
      if (e.target.closest('.btn-view')) return;
      const slug = tr.getAttribute('data-slug');
      const name = tr.getAttribute('data-name');
      loadPools(netSelect.value, slug, name);
    });
  });
  [...dexTbody.querySelectorAll('.btn-view')].forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      loadPools(netSelect.value, btn.getAttribute('data-slug'), btn.getAttribute('data-name'));
    });
  });
  [...dexTbody.querySelectorAll('.dex-name')].forEach(td=>{
    td.addEventListener('click', (e)=>{
      e.stopPropagation();
      const tr = td.closest('tr');
      loadPools(netSelect.value, tr.getAttribute('data-slug'), tr.getAttribute('data-name'));
    });
  });
}

// Throttle load stats: 1 request mỗi 700ms
async function loadStatsQueue(network){
  for (const r of statsQueue) {
    try{
      const s = await getJSON(`${API}/stats`, { network, dex: r.slug });
      r.vol24 = s?.volume24h_usd ?? null;
      r.liq   = s?.liquidity_usd ?? null;
      r.mkt   = s?.market_share_24h ?? null;
      renderDexRows(currentDexList);
    }catch(e){
      // keep row with null stats
    }
    await new Promise(res=>setTimeout(res, 700));
  }
}

// Pools in drawer
async function loadPools(network, slug, name) {
  poolTbody.innerHTML = ''; renderSkeleton(poolTbody, 10, 5);
  drawerTitle.textContent = `${name} · ${network} · Top 20 pools`;
  openDrawer();
  try{
    const pools = await getJSON(`${API}/pools`, { network, dex: slug, limit: 30 });
    poolTbody.innerHTML = pools.map((p, i) => {
      const a = p.attributes || {};
      const vol24 = n(a.volume_usd?.h24);
      const reserve = n(a.reserve_in_usd);
      const addr = a.address || (p.id.split('_')[1] || '');
      const poolName = a.name || p.id;
      const addrShort = addr ? `${addr.slice(0,8)}…${addr.slice(-6)}` : '-';
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${poolName}</td>
          <td><code title="${addr}">${addrShort}</code></td>
          <td class="right" title="${vol24}">${fmtUSD(vol24)}</td>
          <td class="right" title="${reserve}">${fmtUSD(reserve)}</td>
        </tr>`;
    }).join('');
  }catch(e){
    poolTbody.innerHTML = '';
    showToast('Load pools failed');
  }
}

// Events
netSelect.addEventListener('change', ()=>{
  closeDrawer();
  loadDexes();
});
let tmr; searchInput.addEventListener('input', ()=>{
  clearTimeout(tmr); tmr = setTimeout(()=>renderDexRows(currentDexList), 180);
});

// Init
(async function init(){
  await loadNetworks();
  await loadDexes();
})();