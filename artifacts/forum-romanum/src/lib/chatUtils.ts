// Chat formatting + helper utilities
export const EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🙏", "👏", "🎉", "💯"];

export const QUICK_EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳",
  "🤔","😏","😴","😭","😡","👍","👎","👏","🙏","🔥",
  "❤️","💯","🎉","✨","⚡","🚀","💪","👀","🏛️","⚔️",
];

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function clockTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

// Group messages by day for date separators
export function withDaySeparators<T extends { created_at: string }>(items: T[]) {
  const out: ({ _sep: string } | T)[] = [];
  let last = "";
  for (const it of items) {
    const label = dayLabel(it.created_at);
    if (label !== last) {
      out.push({ _sep: label });
      last = label;
    }
    out.push(it);
  }
  return out;
}

export function previewOf(m: { type?: string; content?: string } | undefined): string {
  if (!m) return "No messages yet";
  if (m.type === "image") return "🖼 Photo";
  if (m.type === "voice") return "🎤 Voice message";
  if (m.type === "file") return "📎 File";
  return m.content || "";
}

// Telegram-style chat-list preview (with leading icon)
export function previewIcon(type?: string): string {
  switch (type) {
    case "image":  return "🖼";
    case "video":  return "🎬";
    case "voice":  return "🎤";
    case "file":   return "📎";
    case "poll":   return "📊";
    case "location": return "📍";
    case "sticker":  return "🎟";
    case "system":   return "⓲";
    default: return "";
  }
}

// Compact "1.2K" / "3.4M" number formatter (used for views, subscribers)
export function compactNum(n: number | undefined | null): string {
  if (!n || n < 1000) return String(n ?? 0);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
}

// "last seen 5 minutes ago"
export function lastSeenLabel(iso?: string | null): string {
  if (!iso) return "offline";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "online";
  if (m < 60) return `last seen ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `last seen ${h}h ago`;
  const d = Math.floor(h / 24);
  return `last seen ${d}d ago`;
}

// Voice duration mm:ss
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
