import axios from 'axios';
const BASE = 'https://api.geckoterminal.com/api/v2';

async function pagedGet(url: string) {
  const all:any[] = [];
  let next: string | null | undefined = url;
  while (next) {
    const { data } = await axios.get(next);
    all.push(...(data?.data || []));
    next = data?.links?.next ?? null;
  }
  return { data: all };
}

// dexSlug: có thể là identifier (uniswap_v3) hoặc dex_id đầy đủ (sushiswap_arbitrum)
export async function getDexPools(network: string, dexSlug: string) {
  return pagedGet(`${BASE}/networks/${network}/dexes/${dexSlug}/pools?page=1`);
}
