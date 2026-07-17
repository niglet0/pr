const MEM = new Map<string, { d: unknown; t: number }>();
const LS = "hatch_c_";
const IX = "hatch_ix_";

export function get<T>(key: string, ttl = 30_000): T | null {
  const m = MEM.get(key);
  if (m && Date.now() - m.t < ttl) return m.d as T;
  try {
    const raw = localStorage.getItem(LS + key);
    if (raw) {
      const { d, t } = JSON.parse(raw) as { d: T; t: number };
      if (Date.now() - t < ttl * 5) {
        MEM.set(key, { d, t });
        return d;
      }
    }
  } catch {}
  return null;
}

export function set<T>(key: string, data: T): void {
  const t = Date.now();
  MEM.set(key, { d: data, t });
  try { localStorage.setItem(LS + key, JSON.stringify({ d: data, t })); } catch {}
}

export function invalidate(prefix: string): void {
  for (const k of Array.from(MEM.keys())) if (k.startsWith(prefix)) MEM.delete(k);
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS + prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export function ixGet(key: string): boolean | null {
  try { return JSON.parse(localStorage.getItem(IX + key) ?? "null") as boolean | null; } catch { return null; }
}

export function ixSet(key: string, val: boolean): void {
  try { localStorage.setItem(IX + key, JSON.stringify(val)); } catch {}
}
