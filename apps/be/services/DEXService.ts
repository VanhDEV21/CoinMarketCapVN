import axios from 'axios';

const BASE = 'https://api.geckoterminal.com/api/v2';

type GTItem = { id: string; type: string; attributes?: Record<string, any> };
type GTResp = { data: GTItem[]; links?: { next?: string | null } };

// cache đơn giản 5 phút
const cache: Record<string, { at: number; data: any }> = {};
const TTL = 5 * 60 * 1000;

function getCache<T>(k: string): T | null {
  const c = cache[k];
  return c && Date.now() - c.at < TTL ? (c.data as T) : null;
}
function setCache(k: string, data: any) {
  cache[k] = { at: Date.now(), data };
}

async function pagedGet(url: string): Promise<GTItem[]> {
  const out: GTItem[] = [];
  let next: string | null | undefined = url;

  while (next) {
    const { data } = await axios.get<GTResp>(next);
    out.push(...data.data);
    next = data.links?.next ?? null;
  }
  return out;
}

export async function listNetworks(): Promise<{ id: string; name: string }[]> {
  const key = 'dex.networks';
  const c = getCache<{ id: string; name: string }[]>(key);
  if (c) return c;

  const items = await pagedGet(`${BASE}/networks?page=1`);
  const mapped = items.map((n) => ({
    id: n.id,
    name: (n.attributes?.name as string) || n.id.toUpperCase(),
  }));

  setCache(key, mapped);
  return mapped;
}

// Tìm id network mặc định cho “Bitcoin” theo danh sách networks (an toàn hơn 'btc')
export async function getDefaultBitcoinNetworkId(): Promise<string> {
  const nets = await listNetworks();
  const byExact =
    nets.find((n) => n.id.toLowerCase() === 'bitcoin') ||
    nets.find((n) => n.id.toLowerCase() === 'btc');
  if (byExact) return byExact.id;

  const byContains =
    nets.find((n) => n.id.toLowerCase().includes('btc')) ||
    nets.find((n) => n.id.toLowerCase().includes('bitcoin'));
  if (byContains) return byContains.id;

  return nets[0]?.id || 'eth';
}

export async function listDexesByNetwork(network: string) {
  const key = `dex.list.${network}`;
  const c = getCache<any[]>(key);
  if (c) return c;

  const items = await pagedGet(`${BASE}/networks/${network}/dexes?page=1`);

  const mapped = items.map((d) => {
    const a = d.attributes || {};
    // chuẩn hoá các field thường dùng ở FE
    const identifier = (a as any).identifier ?? null;
    const urlFromId =
      identifier ? `https://www.geckoterminal.com/${network}/dexes/${identifier}` : null;

    return {
      id: d.id,
      name: (a.name as string) || d.id,
      network,
      identifier,
      website_url: (a as any).website_url ?? null,
      pools_count: (a as any).pools_count ?? (a as any).pairs_count ?? null,
      volume24h_usd: (a as any).volume_24h_usd ?? (a as any).trade_volume_24h_usd ?? null,
      market_share_24h: (a as any).market_share_24h ?? null,
      updated_at: (a as any).updated_at ?? null,
      gecko_terminal_url: (a as any).url ?? urlFromId,
    };
  });

  setCache(key, mapped);
  return mapped;
}
// Trong DEXService.ts
export async function listDexesByNetworkWithStats(network: string) {
  const dexes = await listDexesByNetwork(network);

  const results = await Promise.allSettled(
    dexes.map(async (d) => {
      const statsUrl = `${BASE}/networks/${network}/dexes/${d.identifier}/stats`;
      const { data } = await axios.get(statsUrl);
      const s = data?.data?.attributes || {};
      return {
        ...d,
        volume24h_usd: s?.volume_usd_24h ?? null,
        liquidity_usd: s?.liquidity_usd ?? null,
        market_share_24h: s?.market_share_24h ?? null,
      };
    })
  );

  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter(Boolean);
}

