const API = 'http://localhost:5000/api/dex';
const netSelect   = document.getElementById('netSelect');
const dexTbody    = document.querySelector('#dexTable tbody');
const poolTbody   = document.querySelector('#poolTable tbody');
const dexSection  = document.getElementById('dexSection');
const poolSection = document.getElementById('poolSection');
const poolTitle   = document.getElementById('poolTitle');
const backBtn     = document.getElementById('backBtn');
const toast       = document.getElementById('toast');

function showToast(msg, ms=2200){ toast.textContent = msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), ms); }
function n(x){ const v = Number(x||0); return Number.isFinite(v) ? v : 0; }

async function getJSON(url, params = {}) {
  const { data } = await axios.get(url, { params });
  if (data?.ok === false) throw new Error(data?.error || 'API_ERROR');
  return data?.data ?? data;
}

function renderSkeleton(tbody, rows=8, cols=5){
  tbody.innerHTML = Array.from({length:rows}).map(()=>(
    `<tr class="skeleton">${Array.from({length:cols}).map(()=>'<td></td>').join('')}</tr>`
  )).join('');
}

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

async function loadDexes() {
  const network = netSelect.value;
  renderSkeleton(dexTbody, 8, 5);
  try{
    const dexes = await getJSON(`${API}/list`, { network, limit: 20 });
    dexTbody.innerHTML = dexes.map((d, i) => {
      const poolsCount = d.pools_count ?? '-';
      const slug = d.identifier || d.id;
      return `
        <tr data-slug="${slug}" data-name="${d.name}">
          <td>${i + 1}</td>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="badge">${d.network.toUpperCase()}</div>
              <span class="dex-name" style="cursor:pointer;text-decoration:underline">${d.name}</span>
            </div>
          </td>
          <td>${d.network}</td>
          <td>${poolsCount}</td>
          <td class="right">
            <button class="btn primary btn-view" data-slug="${slug}" data-name="${d.name}">View</button>
          </td>
        </tr>`;
    }).join('');

    // row click (except button) -> pools
    [...dexTbody.querySelectorAll('tr')].forEach(tr=>{
      tr.addEventListener('click', (e)=>{
        if (e.target.closest('.btn-view')) return;
        const slug = tr.getAttribute('data-slug');
        const name = tr.getAttribute('data-name');
        loadPools(network, slug, name);
      });
    });
    // button click -> pools
    [...dexTbody.querySelectorAll('.btn-view')].forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        loadPools(network, btn.getAttribute('data-slug'), btn.getAttribute('data-name'));
      });
    });
  }catch(e){
    dexTbody.innerHTML = '';
    showToast('Load DEX list failed');
  }
}

async function loadPools(network, slug, name) {
  renderSkeleton(poolTbody, 8, 5);
  try{
    const pools = await getJSON(`${API}/pools`, { network, dex: slug, limit: 20 });
    poolTitle.textContent = `${name} · ${network} · Top 20 pools`;

    poolTbody.innerHTML = pools.map((p, i) => {
      const a = p.attributes || {};
      const vol24 = n(a.volume_usd?.h24);
      const reserve = n(a.reserve_in_usd);
      const addr = a.address || (p.id.split('_')[1] || '');
      const poolName = a.name || p.id;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${poolName}</td>
          <td><code title="${addr}">${addr.slice(0,8)}…${addr.slice(-6)}</code></td>
          <td class="right">${vol24.toLocaleString()}</td>
          <td class="right">${reserve.toLocaleString()}</td>
        </tr>`;
    }).join('');

    dexSection.style.display = 'none';
    poolSection.style.display = '';
    backBtn.style.display = '';
  }catch(e){
    poolTbody.innerHTML = '';
    showToast('Load pools failed');
  }
}

backBtn.addEventListener('click', ()=>{
  poolSection.style.display = 'none';
  dexSection.style.display = '';
  backBtn.style.display = 'none';
});

netSelect.addEventListener('change', ()=>{
  poolSection.style.display = 'none';
  backBtn.style.display = 'none';
  dexSection.style.display = '';
  loadDexes();
});

(async function init(){
  await loadNetworks();
  await loadDexes();
})();
