(function () {
  const API ='http://localhost:5000/api/exchanges/cex';
  const tbody = document.getElementById('cexBody');
  const q = document.getElementById('q');
  const minTrustSel = document.getElementById('minTrust');
  const toast = document.getElementById('toast');
  const table = document.getElementById('cexTable');

  let rows = [];
  let sortState = { key: 'rank', dir: 'asc' }; // asc | desc

  function showToast(msg, ms=2200){ toast.textContent = msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), ms); }
  function fmt(n){ if(n==null||isNaN(n)) return '-'; return Number(n).toLocaleString(undefined,{maximumFractionDigits:2}); }
  function sanitize(url){ try{ return new URL(url).toString(); }catch{ return '#'; } }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function renderSkeleton(r=10, c=5){
    tbody.innerHTML = Array.from({length:r}).map(_=>
      `<tr class="skeleton">${Array.from({length:c}).map(_=>'<td></td>').join('')}</tr>`
    ).join('');
  }

  async function load() {
    renderSkeleton();
    try {
      const minTrust = Number(minTrustSel.value || 8);
      const { data } = await axios.get(API, { params: { minTrust } });
      rows = (data.rows || []).map(x => ({
        rank: x.rank ?? null,
        id: x.id ?? '',
        name: x.name ?? '',
        url: x.url ?? '',
        image: x.image ?? '',
        trust: Number(x.trust_score ?? 0),
        vol: Number(x.volume_24h_btc ?? 0),
        country: x.country || ''
      }));
      render();
    } catch (e) {
      tbody.innerHTML = '';
      showToast('Load CEX list failed');
      console.error(e);
    }
  }

  function sortRows(arr){
    const { key, dir } = sortState;
    const s = [...arr].sort((a,b)=>{
      const va = a[key], vb = b[key];
      if (typeof va === 'string' || typeof vb === 'string') {
        return dir==='asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      }
      return dir==='asc' ? (va - vb) : (vb - va);
    });
    return s;
  }

  function render() {
    const keyword = (q.value || '').trim().toLowerCase();
    const filtered = rows.filter(r =>
      !keyword ||
      r.name.toLowerCase().includes(keyword) ||
      r.id.toLowerCase().includes(keyword) ||
      r.country.toLowerCase().includes(keyword)
    );

    const sorted = sortRows(filtered);

    tbody.innerHTML = sorted.map(r => `
      <tr>
        <td>${r.rank ?? ''}</td>
        <td>
          <a class="ex-name" href="${sanitize(r.url)}" target="_blank" rel="noopener">
            <img src="${sanitize(r.image)}" alt="${escapeHtml(r.name)}" />
            <span>${escapeHtml(r.name)}</span>
          </a>
        </td>
        <td>${trustBadge(r.trust)}</td>
        <td class="right" title="${r.vol}">${fmt(r.vol)}</td>
        <td class="right"><a class="btn" href="${sanitize(r.url)}" target="_blank" rel="noopener">Open →</a></td>
      </tr>
    `).join('');
    updateSortHeaders();
  }

  function trustBadge(v){
    const cls = v >= 9 ? 'ok' : v >= 8 ? 'mid' : 'low';
    return `<span class="badge trust ${cls}">${v}/10</span>`;
  }

  function updateSortHeaders(){
    table.querySelectorAll('th[data-sort]').forEach(th=>{
      th.classList.remove('asc','desc');
      const key = th.getAttribute('data-sort');
      if (key === sortState.key) th.classList.add(sortState.dir);
    });
  }

  // events
  let t;
  q.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(render,150); });
  minTrustSel.addEventListener('change', load);
  table.querySelectorAll('th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.getAttribute('data-sort');
      if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.dir = key==='name' ? 'asc' : 'desc'; // mặc định số giảm dần, text tăng dần
      }
      render();
    });
  });

  // init
  load();
})();
