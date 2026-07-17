// Static mathematical hierarchy — Roman ranks based on paid bounty count.
export type RankTier = {
  key: "plebeian" | "tribune" | "senator" | "consul";
  label: string;
  min: number;
  max: number; // inclusive upper bound, Infinity for top
  tint: string; // pill background tint
  fg: string; // pill foreground
  ring: string; // border
};

export const BOUNTY_RANKS: RankTier[] = [
  { key: "plebeian", label: "Plebeian", min: 0,  max: 2,        tint: "rgba(176,120,72,0.10)",  fg: "#8C5A2B", ring: "rgba(176,120,72,0.30)" }, // bronze
  { key: "tribune",  label: "Tribune",  min: 3,  max: 10,       tint: "rgba(160,168,176,0.14)", fg: "#5B6470", ring: "rgba(160,168,176,0.35)" }, // silver
  { key: "senator",  label: "Senator",  min: 11, max: 30,       tint: "rgba(197,160,89,0.16)",  fg: "#A07A2E", ring: "rgba(197,160,89,0.40)" }, // gold
  { key: "consul",   label: "Consul",   min: 31, max: Infinity, tint: "rgba(120,72,176,0.14)",  fg: "#6B3FB0", ring: "rgba(120,72,176,0.35)" }, // imperial purple
];

export function getBountyRank(paidCount: number): RankTier {
  const n = Math.max(0, paidCount | 0);
  return BOUNTY_RANKS.find((r) => n >= r.min && n <= r.max) || BOUNTY_RANKS[0];
}

export function nextRankProgress(paidCount: number): { current: RankTier; next: RankTier | null; remaining: number } {
  const current = getBountyRank(paidCount);
  const idx = BOUNTY_RANKS.findIndex((r) => r.key === current.key);
  const next = idx < BOUNTY_RANKS.length - 1 ? BOUNTY_RANKS[idx + 1] : null;
  const remaining = next ? Math.max(0, next.min - paidCount) : 0;
  return { current, next, remaining };
}
