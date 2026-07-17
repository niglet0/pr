// Telegram-style per-member name colours (deterministic from id).
// 7 colours, used for sender name + reply-quote sidebar in groups.
export const MEMBER_COLORS = [
  "#E5484D", // red
  "#F76808", // orange
  "#FFB224", // amber
  "#46A758", // green
  "#3E9EFF", // blue
  "#8B5CF6", // violet
  "#E93D82", // pink
];

export function colorForUser(id?: string | null): string {
  if (!id) return MEMBER_COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}