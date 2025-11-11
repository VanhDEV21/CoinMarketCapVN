type VolKey = 'm5' | 'm15' | 'm30' | 'h1' | 'h6' | 'h24';
type VolumeUSD = Partial<Record<VolKey, string>>;

type PoolItem = {
  id: string;
  attributes: {
    name?: string;
    reserve_in_usd?: string;
    volume_usd?: VolumeUSD;
  };
};

export type PoolsResp = { data: PoolItem[] };

function toNum(x: unknown): number {
  const n = Number(x as any);
  return Number.isFinite(n) ? n : 0;
}
function vget(v: VolumeUSD | undefined, key: VolKey): number {
  return toNum(v?.[key] ?? 0);
}

export function summarizeDexFromPools(pools: PoolsResp) {
  const vol = { m5: 0, m15: 0, m30: 0, h1: 0, h6: 0, h24: 0 };
  let reserve_total = 0;

  const rows = pools.data.map((p) => {
    const v = p.attributes.volume_usd as VolumeUSD | undefined;
    const h24 = vget(v, 'h24');
    const reserve = toNum(p.attributes.reserve_in_usd);

    vol.m5 += vget(v, 'm5');
    vol.m15 += vget(v, 'm15');
    vol.m30 += vget(v, 'm30');
    vol.h1 += vget(v, 'h1');
    vol.h6 += vget(v, 'h6');
    vol.h24 += h24;

    reserve_total += reserve;

    return {
      id: p.id,
      name: p.attributes.name || p.id,
      volume_h24: h24,
      reserve_usd: reserve,
    };
  });

  const top_pools = rows.sort((a, b) => b.volume_h24 - a.volume_h24).slice(0, 10);

  return {
    volume_usd: vol,
    liquidity_usd: reserve_total,
    top_pools,
    pools_count: pools.data.length,
  };
}
