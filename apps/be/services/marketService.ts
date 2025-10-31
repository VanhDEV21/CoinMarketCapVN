import axios from "axios";

export type MarketRow = {
  exchange: string;
  pair: string;
  price: number;
  volume24h: number;
  spread?: number | null;
  trust?: string | null;
  updatedAt?: string | null;
  tradeUrl?: string | null;
};

type GeckoTicker = {
  base: string;
  target: string;
  market: { name: string };
  last: number;
  volume: number;
  converted_last?: { usd?: number };
  converted_volume?: { usd?: number };
  bid_ask_spread_percentage?: number | null;
  trust_score?: string | null;
  last_traded_at?: string | null;
  trade_url?: string | null;
};

const cache = new Map<string, { expires: number; rows: MarketRow[] }>();
const TTL_MS = 60_000;

async function resolveGeckoId(symbol: string, name?: string): Promise<string | null> {
  const q = (symbol || name || "").trim();
  if (!q) return null;

  const resp = await axios.get("https://api.coingecko.com/api/v3/search", { params: { query: q } });
  const coins: Array<{ id: string; name: string; symbol: string }> = resp.data?.coins ?? [];

  // 1) Ưu tiên khớp symbol chính xác
  const s = symbol?.toLowerCase();
  const exact = coins.find(c => c.symbol?.toLowerCase() === s);
  if (exact) return exact.id;

  // 2) Thử khớp gần đúng theo name
  const n = name?.toLowerCase();
  const byName = coins.find(c => n && c.name?.toLowerCase().includes(n));
  if (byName) return byName.id;

  // 3) fallback: phần tử đầu tiên
  return coins[0]?.id ?? null;
}

async function fetchGeckoTickers(geckoId: string): Promise<GeckoTicker[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(geckoId)}/tickers`;
  const resp = await axios.get(url, {
    params: { include_exchange_logo: false, order: "volume_desc" },
  });
  return resp.data?.tickers ?? [];
}

export async function getMarketsForSymbol(
  symbol: string,
  name?: string,
  limit: number = 50
): Promise<MarketRow[]> {
  const key = `${symbol}|${name}|${limit}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.rows;

  const id = await resolveGeckoId(symbol, name);
  if (!id) return [];

  const tickers = await fetchGeckoTickers(id);
  const rows: MarketRow[] = tickers
    .filter(t => t.base && t.target && t.market?.name)
    .sort((a, b) => (b.converted_volume?.usd ?? 0) - (a.converted_volume?.usd ?? 0))
    .slice(0, limit)
    .map(t => ({
      exchange: t.market.name,
      pair: `${t.base}/${t.target}`,
      price: Number(t.converted_last?.usd ?? t.last ?? 0),
      volume24h: Number(t.converted_volume?.usd ?? t.volume ?? 0),
      spread: t.bid_ask_spread_percentage ?? null,
      trust: t.trust_score ?? null,
      updatedAt: t.last_traded_at ?? null,
      tradeUrl: t.trade_url ?? null,
    }));

  cache.set(key, { expires: Date.now() + TTL_MS, rows });
  return rows;
}
