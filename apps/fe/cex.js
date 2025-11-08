(async function () {
  const API = 'http://localhost:5000/api/exchanges/cex';
  const tbody = document.getElementById('ex-body');
  const q = document.getElementById('q');
  const minTrustSel = document.getElementById('minTrust');

  let rows = [];

  async function load() {
    const minTrust = Number(minTrustSel.value || 8);
    const { data } = await axios.get(API, { params: { minTrust } });
    rows = data.rows || [];
    render();
  }

  function render() {
    const keyword = (q.value || '').trim().toLowerCase();
    const filtered = rows.filter(r =>
      !keyword ||
      r.name.toLowerCase().includes(keyword) ||
      (r.id || '').toLowerCase().includes(keyword) ||
      (r.country || '').toLowerCase().includes(keyword)
    );

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${r.rank ?? ''}</td>
        <td>
          <a class="ext-link ex-name" href="${sanitize(r.url)}" target="_blank" rel="noopener">
            <img src="${sanitize(r.image)}" alt="${escapeHtml(r.name)}"/>
            <span>${escapeHtml(r.name)}</span>
          </a>
        </td>
        <td>${trustBadge(r.trust_score)}</td>
        <td class="num">${fmt(r.volume_24h_btc)}</td>
        <td><a class="ext-link" href="${sanitize(r.url)}" target="_blank" rel="noopener">Open →</a></td>
      </tr>
    `).join('');
  }

  function trustBadge(v) {
    const cls = v >= 9 ? 'ok' : v >= 8 ? 'mid' : 'low';
    return `<span class="badge ${cls}">${v}/10</span>`;
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
    // Nếu muốn đổi sang USD, bạn có thể nhân với giá BTC hiện tại từ BE/CMC rồi format.
  }

  function sanitize(url) {
    // chặn javascript:...
    try { const u = new URL(url); return u.toString(); } catch { return '#'; }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  q.addEventListener('input', render);
  minTrustSel.addEventListener('change', load);

  // init
  load();
})();
