import axios from 'axios';
import Bottleneck from 'bottleneck';

const BASE = 'https://api.geckoterminal.com/api/v2';

type GTItem = { id: string; type: string; attributes?: Record<string, any> };
type GTResp = { data: GTItem[]; links?: { next?: string | null } };

const listCache: Record<string, { at: number; data: any }> = {};
const LIST_TTL = 5 * 60 * 1000;

const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 1500 });

function getCache<T>(store: Record<string, { at: number; data: any }>, ttl: number, key: string): T | null {
  const c = store[key];
  return c && Date.now() - c.at < ttl ? (c.data as T) : null;
}
function setCache(store: Record<string, { at: number; data: any }>, key: string, data: any) {
  store[key] = { at: Date.now(), data };
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
  const c = getCache<{ id: string; name: string }[]>(listCache, LIST_TTL, key);
  if (c) return c;

  const items = await pagedGet(`${BASE}/networks?page=1`);
  const mapped = items.map((n) => ({
    id: n.id,
    name: (n.attributes?.name as string) || n.id.toUpperCase(),
  }));

  setCache(listCache, key, mapped);
  return mapped;
}

export type DexRow = {
  dex_id: string;                 // giữ nguyên id của GeckoTerminal
  id: string;
  name: string;
  network: string;
  identifier: string | null;
  website_url: string | null;
  pools_count: number | null;
  gecko_terminal_url: string | null;
  updated_at: string | null;
};

function inferIdentifierFromId(rawId: string, network: string): string | null {
  if (!rawId || !network) return null;
  const suffix = `_${network}`;
  if (rawId.toLowerCase().endsWith(suffix.toLowerCase())) {
    return rawId.slice(0, -suffix.length);
  }
  return null;
}

export async function listDexesByNetwork(network: string): Promise<DexRow[]> {
  const key = `dex.list.${network}`;
  const c = getCache<DexRow[]>(listCache, LIST_TTL, key);
  if (c) return c;

  const items = await pagedGet(`${BASE}/networks/${network}/dexes?page=1`);

  const mapped: DexRow[] = items.map((d) => {
    const a = d.attributes || {};
    let identifier: string | null = (a as any).identifier ?? null;

    if (!identifier) {
      const inf = inferIdentifierFromId(d.id, network);
      if (inf) identifier = inf;
    }

    const geckoUrl =
      (a as any).url ??
      (identifier
        ? `https://www.geckoterminal.com/${network}/dexes/${identifier}`
        : `https://www.geckoterminal.com/${network}/dexes/${d.id}`);

    return {
      dex_id: d.id,
      id: d.id,
      name: (a.name as string) || d.id,
      network,
      identifier,
      website_url: (a as any).website_url ?? null,
      pools_count: (a as any).pools_count ?? (a as any).pairs_count ?? null,
      updated_at: (a as any).updated_at ?? null,
      gecko_terminal_url: geckoUrl,
    };
  });

  setCache(listCache, key, mapped);
  return mapped;
}
