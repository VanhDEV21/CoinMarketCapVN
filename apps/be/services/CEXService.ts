import axios from "axios";

export type CexRow = {
  rank: number;
  id: string;
  name: string;
  url: string;
  image: string;
  trust_score: number;
  trust_score_rank: number;
  volume_24h_btc: number;
  country?: string | null;
};

export async function fetchCexFromGecko(minTrust = 8): Promise<CexRow[]> {
  // CoinGecko /exchanges = CEX; DEX có endpoint khác
  const { data } = await axios.get("https://api.coingecko.com/api/v3/exchanges", {
    params: { per_page: 100, page: 1 },
    timeout: 15000,
  });

  const rows: CexRow[] = (data || [])
    .filter((x: any) => (x.trust_score ?? 0) >= Number(minTrust))
    .sort((a: any, b: any) => (a.trust_score_rank || 9999) - (b.trust_score_rank || 9999))
    .map((x: any, i: number) => ({
      rank: x.trust_score_rank ?? i + 1,
      id: x.id,
      name: x.name,
      url: x.url, // CoinGecko trả 'url' cho website sàn
      image: x.image,
      trust_score: x.trust_score,
      trust_score_rank: x.trust_score_rank,
      volume_24h_btc: Number(x.trade_volume_24h_btc || 0),
      country: x.country ?? null,
    }));

  return rows;
}
