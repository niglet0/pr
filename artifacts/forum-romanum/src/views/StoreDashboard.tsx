import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Icon, cn } from "../components/UI";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

// ─── tokens ───────────────────────────────────────────────────
const G = "#C5A059";
const BORDER = "#E5E3DB";
const MUTED = "#7A7A7A";
const BG = "#FAF9F6";
const DARK = "#202020";

// ─── section registry ─────────────────────────────────────────
type Section =
  | "overview" | "pos" | "inventory" | "customers"
  | "financials" | "reports" | "access"
  | "pipeline" | "reviews" | "studio" | "escrow" | "analytics" | "company";

const SECTIONS: { id: Section; label: string; icon: string; isNew?: boolean }[] = [
  { id: "overview",   icon: "LayoutDashboard", label: "Overview"  },
  { id: "pos",        icon: "Scan",            label: "POS"       },
  { id: "inventory",  icon: "Package",         label: "Inventory" },
  { id: "customers",  icon: "Users",           label: "Customers" },
  { id: "financials", icon: "CreditCard",      label: "Financials"},
  { id: "reports",    icon: "BarChart2",       label: "Reports"   },
  { id: "access",     icon: "ShieldCheck",     label: "Access"    },
  { id: "pipeline",   icon: "Kanban",          label: "Pipeline",  isNew: true },
  { id: "reviews",    icon: "Star",            label: "Reviews",   isNew: true },
  { id: "studio",     icon: "PenSquare",       label: "Studio",    isNew: true },
  { id: "escrow",     icon: "Vault",           label: "Escrow",    isNew: true },
  { id: "analytics",  icon: "TrendingUp",      label: "Analytics", isNew: true },
  { id: "company",    icon: "Building2",       label: "Company",   isNew: true },
];

// ─── helpers ──────────────────────────────────────────────────
const fmt = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function relDay(ts: string) {
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending:   "bg-amber-50  text-amber-700  border-amber-200",
    cancelled: "bg-red-50    text-red-600    border-red-200",
    disputed:  "bg-purple-50 text-purple-700 border-purple-200",
    active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft:     "bg-gray-50   text-gray-600   border-gray-200",
    delivered: "bg-sky-50    text-sky-700    border-sky-200",
    working:   "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", map[status] || "bg-gray-50 text-gray-600 border-gray-200")}>
      {status}
    </span>
  );
}

function KpiCard({ label, value, sub, icon, color = G }: { label: string; value: string; sub?: string; icon: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E5E3DB] flex flex-col gap-2 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#7A7A7A]">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + "18", color }}>
          <Icon name={icon as any} size={15} />
        </div>
      </div>
      <p className="text-2xl font-black text-[#202020] tracking-tight">{value}</p>
      {sub && <p className="text-[10px] text-[#7A7A7A]">{sub}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 rounded-full border-2 border-[#C5A059]/20 border-t-[#C5A059] animate-spin" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════
function OverviewSection({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("listing_orders").select("id,amount_cents,status,created_at").eq("seller_id", userId).order("created_at", { ascending: false }),
      supabase.from("marketplace_listings").select("id,title,status,views_count,purchases_count,revenue_cents").eq("seller_id", userId),
    ]).then(([o, l]) => { setOrders(o.data || []); setListings(l.data || []); setLoading(false); });
  }, [userId]);

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const chartData = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      buckets[d.toLocaleDateString("en-US", { month: "short", day: "numeric" })] = 0;
    }
    orders.filter(o => o.status === "completed").forEach(o => {
      const key = new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (key in buckets) buckets[key] = (buckets[key] || 0) + o.amount_cents / 100;
    });
    return Object.entries(buckets).map(([date, revenue]) => ({ date, revenue }));
  }, [orders, days]);

  const totalRev = orders.filter(o => o.status === "completed").reduce((s, o) => s + o.amount_cents, 0);
  const pending  = orders.filter(o => o.status === "pending").length;

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Revenue" value={fmt(totalRev)} icon="DollarSign" />
        <KpiCard label="Orders"  value={orders.length.toString()} sub={`${pending} pending`} icon="ShoppingBag" color="#3B82F6" />
        <KpiCard label="Products" value={listings.filter(l => l.status === "active").length.toString()} sub="active" icon="Package" color="#8B5CF6" />
        <KpiCard label="Reviews"  value={listings.reduce((s, l) => s + (l.reviews_count || 0), 0).toString()} icon="Star" color="#F59E0B" />
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-black uppercase tracking-widest">Revenue Trend</p>
          <div className="flex gap-1">
            {(["7d","30d","90d"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase", period === p ? "bg-[#C5A059] text-white" : "text-[#7A7A7A]")}>{p}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={G} stopOpacity={0.3} />
                <stop offset="95%" stopColor={G} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 5)} />
            <YAxis tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} tickFormatter={v => v > 0 ? `$${v}` : ""} />
            <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 10 }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Revenue"]} />
            <Area type="monotone" dataKey="revenue" stroke={G} strokeWidth={2} fill="url(#rg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3">Recent Orders</p>
        {orders.slice(0, 6).map(o => (
          <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-[#F3F1EC] last:border-0">
            <div>
              <p className="text-[11px] font-bold">#{o.id.slice(-6).toUpperCase()}</p>
              <p className="text-[9px] text-[#7A7A7A]">{relDay(o.created_at)}</p>
            </div>
            <div className="text-right flex items-center gap-2">
              <p className="text-[12px] font-black">{fmt(o.amount_cents)}</p>
              <StatusPill status={o.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POS
// ═══════════════════════════════════════════════════════════════
function POSSection({ userId }: { userId: string }) {
  const [listings, setListings] = useState<any[]>([]);
  const [cart, setCart] = useState<{ item: any; qty: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [payMode, setPayMode] = useState<"cash" | "card" | "transfer">("cash");
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("marketplace_listings").select("id,title,price_cents,cover_url,kind").eq("seller_id", userId).eq("status", "active")
      .then(({ data }) => { setListings(data || []); setLoading(false); });
  }, [userId]);

  const filtered = listings.filter(l => l.title.toLowerCase().includes(search.toLowerCase()));
  const cartTotal = cart.reduce((s, c) => s + c.item.price_cents * c.qty, 0);

  function add(item: any) { setCart(p => { const ex = p.find(c => c.item.id === item.id); return ex ? p.map(c => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...p, { item, qty: 1 }]; }); }
  function remove(id: string) { setCart(p => p.map(c => c.item.id === id ? { ...c, qty: c.qty - 1 } : c).filter(c => c.qty > 0)); }

  async function checkout() {
    if (!cart.length) return;
    setProcessing(true);
    await supabase.from("listing_orders").insert(cart.map(c => ({
      listing_id: c.item.id, buyer_id: userId, seller_id: userId,
      amount_cents: c.item.price_cents * c.qty, order_type: "sale",
      status: "completed", notes: `POS:${payMode}:qty${c.qty}`,
      completed_at: new Date().toISOString(),
    })));
    setReceipt({ items: cart, total: cartTotal, mode: payMode, at: new Date() });
    setCart([]);
    setProcessing(false);
  }

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      {receipt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-3">
          <Icon name="CheckCircle2" size={16} className="text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] font-black text-emerald-800">Sale recorded — {fmt(receipt.total)}</p>
            <p className="text-[10px] text-emerald-600">{receipt.mode} · {receipt.at.toLocaleTimeString()}</p>
          </div>
          <button onClick={() => setReceipt(null)} className="text-emerald-500"><Icon name="X" size={14} /></button>
        </div>
      )}
      <div className="relative">
        <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A7A]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E5E3DB] text-[12px] outline-none focus:border-[#C5A059]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.map(item => (
          <button key={item.id} onClick={() => add(item)}
            className="bg-white rounded-xl border border-[#E5E3DB] p-3 text-left hover:border-[#C5A059]/50 active:scale-95 transition-all">
            <div className="w-full aspect-video rounded-lg bg-[#F3F1EC] flex items-center justify-center mb-2 overflow-hidden">
              {item.cover_url ? <img src={item.cover_url} className="w-full h-full object-cover" /> : <Icon name="Package" size={20} className="text-[#C5A059]/40" />}
            </div>
            <p className="text-[11px] font-bold truncate">{item.title}</p>
            <p className="text-[13px] font-black text-[#C5A059]">{fmt(item.price_cents)}</p>
          </button>
        ))}
      </div>
      {cart.length > 0 && (
        <div className="sticky bottom-2 bg-white rounded-2xl border border-[#C5A059]/30 shadow-lg p-4 space-y-3">
          <p className="text-[11px] font-black uppercase tracking-widest">Cart · {cart.reduce((s, c) => s + c.qty, 0)} items</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {cart.map(c => (
              <div key={c.item.id} className="flex items-center justify-between gap-2">
                <p className="text-[11px] flex-1 truncate">{c.item.title}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => remove(c.item.id)} className="w-5 h-5 rounded-full border border-[#E5E3DB] text-xs flex items-center justify-center">−</button>
                  <span className="text-[11px] font-bold w-4 text-center">{c.qty}</span>
                  <button onClick={() => add(c.item)} className="w-5 h-5 rounded-full border border-[#E5E3DB] text-xs flex items-center justify-center">+</button>
                  <span className="text-[11px] font-black w-14 text-right">{fmt(c.item.price_cents * c.qty)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(["cash","card","transfer"] as const).map(m => (
              <button key={m} onClick={() => setPayMode(m)}
                className={cn("flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all",
                  payMode === m ? "bg-[#202020] text-white border-[#202020]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>{m}</button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-[#E5E3DB] pt-2">
            <p className="text-xl font-black">{fmt(cartTotal)}</p>
            <button onClick={checkout} disabled={processing}
              className="px-6 py-2.5 bg-[#C5A059] text-white text-[12px] font-black rounded-xl hover:bg-[#B8954E] disabled:opacity-50 transition-colors">
              {processing ? "…" : "Charge"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════
function InventorySection({ userId }: { userId: string }) {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "draft">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("marketplace_listings")
      .select("id,title,kind,price_cents,status,views_count,purchases_count,revenue_cents,rating,reviews_count,cover_url,updated_at")
      .eq("seller_id", userId).order("updated_at", { ascending: false })
      .then(({ data }) => { setListings(data || []); setLoading(false); });
  }, [userId]);

  const filtered = listings.filter(l => (filter === "all" || l.status === filter) && l.title.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total", value: listings.length, color: DARK },
          { label: "Active", value: listings.filter(l => l.status === "active").length, color: "#10B981" },
          { label: "Revenue", value: fmt(listings.reduce((s, l) => s + (l.revenue_cents || 0), 0)), color: G },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-[#E5E3DB] p-3 text-center shadow-sm">
            <p className="text-lg font-black" style={{ color: m.color }}>{m.value}</p>
            <p className="text-[9px] text-[#7A7A7A] uppercase tracking-wide">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A7A]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E5E3DB] text-[12px] outline-none focus:border-[#C5A059]" />
        </div>
        {(["all","active","draft"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-2.5 py-2 rounded-xl text-[10px] font-bold uppercase border transition-all",
              filter === f ? "bg-[#C5A059] text-white border-[#C5A059]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>{f}</button>
        ))}
      </div>
      {filtered.map(l => (
        <div key={l.id} className="bg-white rounded-xl border border-[#E5E3DB] p-3 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-[#F3F1EC] overflow-hidden shrink-0 flex items-center justify-center">
            {l.cover_url ? <img src={l.cover_url} className="w-full h-full object-cover" /> : <Icon name="Package" size={18} className="text-[#C5A059]/50" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold truncate">{l.title}</p>
            <p className="text-[9px] text-[#7A7A7A]">{l.kind} · {l.views_count || 0} views · {l.purchases_count || 0} sold</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[12px] font-black">{fmt(l.price_cents)}</p>
            <StatusPill status={l.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════
function CustomersSection({ userId }: { userId: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("listing_orders").select("buyer_id,amount_cents,status,created_at").eq("seller_id", userId)
      .then(async ({ data: orders }) => {
        const ids = [...new Set((orders || []).map((o: any) => o.buyer_id))];
        const { data: users } = ids.length > 0
          ? await supabase.from("users").select("id,display_name,username,avatar_url").in("id", ids)
          : { data: [] };
        const result = (users || []).map(u => {
          const uOrders = (orders || []).filter((o: any) => o.buyer_id === u.id);
          return {
            ...u,
            orderCount: uOrders.length,
            totalSpent: uOrders.filter((o: any) => o.status === "completed").reduce((s: number, o: any) => s + o.amount_cents, 0),
            pending: uOrders.filter((o: any) => o.status === "pending").reduce((s: number, o: any) => s + o.amount_cents, 0),
            lastOrder: uOrders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at,
          };
        }).sort((a, b) => b.totalSpent - a.totalSpent);
        setData(result);
        setLoading(false);
      });
  }, [userId]);

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Customers" value={data.length.toString()} icon="Users" />
        <KpiCard label="Outstanding" value={fmt(data.reduce((s, c) => s + c.pending, 0))} icon="Clock" color="#EF4444" />
      </div>
      {data.length === 0 ? (
        <div className="text-center py-12 text-[#7A7A7A]"><Icon name="Users" size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No customers yet</p></div>
      ) : data.map(c => (
        <div key={c.id} className="bg-white rounded-xl border border-[#E5E3DB] p-3 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#C5A059]/15 flex items-center justify-center shrink-0 overflow-hidden">
            {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover rounded-full" /> : <span className="text-[#C5A059] font-black">{(c.display_name||"?")[0]}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold truncate">{c.display_name || c.username}</p>
            <p className="text-[10px] text-[#7A7A7A]">@{c.username} · {c.orderCount} orders · last {c.lastOrder ? relDay(c.lastOrder) : "—"}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[12px] font-black">{fmt(c.totalSpent)}</p>
            {c.pending > 0 && <p className="text-[9px] text-red-500 font-bold">owes {fmt(c.pending)}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FINANCIALS
// ═══════════════════════════════════════════════════════════════
function FinancialsSection({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all"|"completed"|"pending"|"disputed">("all");

  useEffect(() => {
    supabase.from("listing_orders").select("id,amount_cents,status,notes,created_at").eq("seller_id", userId).order("created_at", { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, [userId]);

  const paid     = orders.filter(o => o.status === "completed").reduce((s, o) => s + o.amount_cents, 0);
  const pending  = orders.filter(o => o.status === "pending").reduce((s, o) => s + o.amount_cents, 0);
  const disputed = orders.filter(o => o.status === "disputed").reduce((s, o) => s + o.amount_cents, 0);
  const filtered = orders.filter(o => filter === "all" || o.status === filter);

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[{ label: "Collected", value: fmt(paid), cls: "border-emerald-200 text-emerald-700" },
          { label: "Pending",   value: fmt(pending), cls: "border-amber-200 text-amber-700" },
          { label: "Disputed",  value: fmt(disputed), cls: "border-red-200 text-red-600" }
        ].map(m => (
          <div key={m.label} className={cn("bg-white rounded-xl border p-3 text-center shadow-sm", m.cls.split(" ")[0])}>
            <p className={cn("text-sm font-black", m.cls.split(" ")[1])}>{m.value}</p>
            <p className="text-[9px] text-[#7A7A7A] uppercase tracking-wide mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {(["all","completed","pending","disputed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all",
              filter === f ? "bg-[#C5A059] text-white border-[#C5A059]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>{f}</button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map(o => (
          <div key={o.id} className="bg-white rounded-xl border border-[#E5E3DB] px-3 py-2.5 flex items-center gap-3 shadow-sm">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold">#{o.id.slice(-6).toUpperCase()}</p>
              <p className="text-[9px] text-[#7A7A7A]">{relDay(o.created_at)}</p>
            </div>
            <p className="text-[12px] font-black">{fmt(o.amount_cents)}</p>
            <StatusPill status={o.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════
function ReportsSection({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("listing_orders").select("amount_cents,status,created_at").eq("seller_id", userId).eq("status", "completed"),
      supabase.from("marketplace_listings").select("id,title,category,purchases_count,revenue_cents").eq("seller_id", userId),
    ]).then(([o, l]) => { setOrders(o.data || []); setListings(l.data || []); setLoading(false); });
  }, [userId]);

  const weeklyData = useMemo(() => {
    const b: Record<string, number> = {};
    for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7); b[`W${i}`] = 0; }
    orders.forEach(o => { const wk = Math.floor((Date.now() - new Date(o.created_at).getTime()) / (7 * 86400000)); if (wk <= 7) b[`W${7 - wk}`] = (b[`W${7 - wk}`] || 0) + o.amount_cents / 100; });
    return Object.entries(b).map(([week, revenue]) => ({ week, revenue }));
  }, [orders]);

  const top = [...listings].sort((a, b) => (b.revenue_cents || 0) - (a.revenue_cents || 0)).slice(0, 5);

  if (loading) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3">Weekly Revenue</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} tickFormatter={v => v > 0 ? `$${v}` : ""} />
            <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 10 }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Revenue"]} />
            <Bar dataKey="revenue" fill={G} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3">Top Products</p>
        {top.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 mb-2.5 last:mb-0">
            <span className="text-[10px] font-black text-[#7A7A7A] w-4">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold truncate">{p.title}</p>
              <div className="mt-1 bg-[#F3F1EC] rounded-full h-1.5">
                <div className="h-full rounded-full bg-[#C5A059]" style={{ width: `${Math.min(100, ((p.revenue_cents || 0) / (top[0]?.revenue_cents || 1)) * 100)}%` }} />
              </div>
            </div>
            <p className="text-[11px] font-black shrink-0">{fmt(p.revenue_cents || 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ACCESS
// ═══════════════════════════════════════════════════════════════
function AccessSection({ userId }: { userId: string }) {
  const [company, setCompany] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("company_profiles").select("id,name,is_verified").eq("owner_id", userId).single()
      .then(async ({ data: co }) => {
        setCompany(co);
        if (co) {
          const { data } = await supabase.from("company_members")
            .select("id,role,title,joined_at,users(display_name,username,avatar_url)").eq("company_id", co.id);
          setMembers(data || []);
        }
        setLoading(false);
      });
  }, [userId]);

  const ROLES = [
    { key: "owner",   label: "Owner",   desc: "Full access",                color: G,        icon: "Crown"       },
    { key: "admin",   label: "Admin",   desc: "Manage all + settings",      color: "#8B5CF6", icon: "ShieldCheck" },
    { key: "manager", label: "Manager", desc: "Sales, inventory, reports",  color: "#3B82F6", icon: "Briefcase"   },
    { key: "cashier", label: "Cashier", desc: "POS only",                   color: "#10B981", icon: "Scan"        },
    { key: "viewer",  label: "Viewer",  desc: "Read-only",                  color: MUTED,    icon: "Eye"         },
  ];

  if (loading) return <Spinner />;
  if (!company) return (
    <div className="text-center py-12 text-[#7A7A7A]">
      <Icon name="Building2" size={32} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm font-bold">No Company Profile</p>
      <p className="text-xs mt-1">Create one in the Marketplace first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#C5A059]/20 p-4 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/15 flex items-center justify-center"><Icon name="Building2" size={18} className="text-[#C5A059]" /></div>
        <div><p className="text-sm font-black">{company.name}</p><p className="text-[10px] text-[#7A7A7A]">{members.length} members{company.is_verified ? " · ✓ Verified" : ""}</p></div>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm space-y-2">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3">Permission Levels</p>
        {ROLES.map(r => (
          <div key={r.key} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: r.color + "18", color: r.color }}>
              <Icon name={r.icon as any} size={13} />
            </div>
            <div className="flex-1"><p className="text-[11px] font-bold">{r.label}</p><p className="text-[9px] text-[#7A7A7A]">{r.desc}</p></div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E3DB] shadow-sm overflow-hidden">
        <p className="px-4 py-3 border-b border-[#E5E3DB] text-[11px] font-black uppercase tracking-widest">Team ({members.length})</p>
        {members.map(m => {
          const u = (m.users as any) || {};
          const role = ROLES.find(r => r.key === m.role) || ROLES[4];
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#E5E3DB]/60 last:border-0">
              <div className="w-8 h-8 rounded-full bg-[#C5A059]/15 flex items-center justify-center shrink-0">
                {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full rounded-full object-cover" /> : <span className="text-[#C5A059] font-black text-sm">{(u.display_name||"?")[0]}</span>}
              </div>
              <div className="flex-1 min-w-0"><p className="text-[12px] font-bold truncate">{u.display_name || u.username}</p><p className="text-[10px] text-[#7A7A7A]">{m.title || `@${u.username}`}</p></div>
              <span className="text-[9px] font-bold px-2 py-1 rounded-full" style={{ color: role.color, background: role.color + "15" }}>{m.role}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ① PIPELINE — Order Kanban (NEW — doesn't exist anywhere)
// ═══════════════════════════════════════════════════════════════
const PIPELINE_STAGES = [
  { id: "pending",   label: "New",       color: "#F59E0B", icon: "Inbox"       },
  { id: "working",   label: "Working",   color: "#8B5CF6", icon: "Hammer"      },
  { id: "delivered", label: "Delivered", color: "#3B82F6", icon: "Send"        },
  { id: "disputed",  label: "Disputed",  color: "#EF4444", icon: "AlertCircle" },
  { id: "completed", label: "Done",      color: "#10B981", icon: "CheckCircle2"},
];

function PipelineSection({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [listings, setListings] = useState<Record<string, any>>({});
  const [buyers, setBuyers]   = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [moving, setMoving]   = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ords } = await supabase.from("listing_orders")
      .select("id,listing_id,buyer_id,amount_cents,status,notes,created_at,completed_at")
      .eq("seller_id", userId).neq("status", "cancelled").order("created_at", { ascending: false });
    const o = ords || [];
    setOrders(o);
    const listingIds = [...new Set(o.map((x: any) => x.listing_id))];
    const buyerIds   = [...new Set(o.map((x: any) => x.buyer_id))];
    const [{ data: ls }, { data: us }] = await Promise.all([
      listingIds.length > 0 ? supabase.from("marketplace_listings").select("id,title,kind,cover_url").in("id", listingIds) : { data: [] },
      buyerIds.length > 0   ? supabase.from("users").select("id,display_name,username,avatar_url").in("id", buyerIds) : { data: [] },
    ]);
    setListings(Object.fromEntries((ls || []).map((l: any) => [l.id, l])));
    setBuyers(Object.fromEntries((us || []).map((u: any) => [u.id, u])));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function moveTo(orderId: string, newStatus: string) {
    setMoving(orderId);
    const patch: any = { status: newStatus };
    if (newStatus === "completed") patch.completed_at = new Date().toISOString();
    await supabase.from("listing_orders").update(patch).eq("id", orderId);
    setOrders(p => p.map(o => o.id === orderId ? { ...o, ...patch } : o));
    setMoving(null);
  }

  async function saveNote(orderId: string) {
    if (!note.trim()) return;
    await supabase.from("listing_orders").update({ notes: note }).eq("id", orderId);
    setOrders(p => p.map(o => o.id === orderId ? { ...o, notes: note } : o));
    setNote("");
    setSelected(null);
  }

  const [stage, setStage] = useState("pending");
  const stageOrders = orders.filter(o => o.status === stage);
  const stageMeta = PIPELINE_STAGES.find(s => s.id === stage)!;
  const transitions: Record<string, string[]> = {
    pending:   ["working", "completed", "disputed"],
    working:   ["delivered", "disputed"],
    delivered: ["completed", "disputed"],
    disputed:  ["completed"],
    completed: [],
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-2.5 px-2.5 pb-1">
        {PIPELINE_STAGES.map(s => {
          const cnt = orders.filter(o => o.status === s.id).length;
          return (
            <button key={s.id} onClick={() => setStage(s.id)}
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black whitespace-nowrap border transition-all shrink-0",
                stage === s.id ? "text-white border-transparent shadow-md" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}
              style={stage === s.id ? { background: s.color } : {}}>
              <Icon name={s.icon as any} size={11} />
              {s.label}
              {cnt > 0 && <span className="text-[9px] font-black">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {stageOrders.length === 0 ? (
        <div className="text-center py-12 text-[#7A7A7A]">
          <Icon name={stageMeta.icon as any} size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No orders in {stageMeta.label}</p>
        </div>
      ) : stageOrders.map(o => {
        const listing = listings[o.listing_id] || {};
        const buyer   = buyers[o.buyer_id] || {};
        const nextMoves = transitions[o.status] || [];
        const isOpen = selected === o.id;

        return (
          <div key={o.id} className="bg-white rounded-2xl border border-[#E5E3DB] overflow-hidden shadow-sm">
            <button onClick={() => setSelected(isOpen ? null : o.id)} className="w-full text-left p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F3F1EC] overflow-hidden shrink-0 flex items-center justify-center">
                  {listing.cover_url ? <img src={listing.cover_url} className="w-full h-full object-cover" /> : <Icon name="Package" size={16} className="text-[#C5A059]/50" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold truncate">{listing.title || "Unknown listing"}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {buyer.avatar_url && <img src={buyer.avatar_url} className="w-4 h-4 rounded-full" />}
                    <p className="text-[10px] text-[#7A7A7A]">{buyer.display_name || buyer.username || "—"} · {relDay(o.created_at)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-black">{fmt(o.amount_cents)}</p>
                  <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={12} className="text-[#7A7A7A] ml-auto mt-0.5" />
                </div>
              </div>
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3 border-t border-[#F3F1EC] pt-3">
                    {o.notes && <p className="text-[11px] text-[#7A7A7A] bg-[#F3F1EC] rounded-xl px-3 py-2">{o.notes}</p>}

                    {nextMoves.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Move to</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {nextMoves.map(nx => {
                            const meta = PIPELINE_STAGES.find(s => s.id === nx)!;
                            return (
                              <button key={nx} onClick={() => moveTo(o.id, nx)} disabled={moving === o.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all disabled:opacity-50"
                                style={{ color: meta.color, borderColor: meta.color + "40", background: meta.color + "10" }}>
                                <Icon name={meta.icon as any} size={11} />
                                {meta.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1.5">Order Note</p>
                      <div className="flex gap-2">
                        <input value={selected === o.id ? note : (o.notes || "")}
                          onChange={e => setNote(e.target.value)}
                          placeholder="Add note for this order…"
                          className="flex-1 border border-[#E5E3DB] rounded-xl px-3 py-2 text-[11px] outline-none focus:border-[#C5A059]" />
                        <button onClick={() => saveNote(o.id)}
                          className="px-3 py-2 bg-[#C5A059] text-white text-[10px] font-black rounded-xl hover:bg-[#B8954E] transition-colors">Save</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ② REVIEWS — Review Manager (NEW — doesn't exist anywhere)
// ═══════════════════════════════════════════════════════════════
function ReviewsSection({ userId }: { userId: string }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [listings, setListings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all"|"1"|"2"|"3"|"4"|"5">("all");
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ls } = await supabase.from("marketplace_listings").select("id,title").eq("seller_id", userId);
    const listingMap = Object.fromEntries((ls || []).map((l: any) => [l.id, l.title]));
    setListings(listingMap);
    const ids = Object.keys(listingMap);
    if (ids.length === 0) { setLoading(false); return; }
    const { data: revs } = await supabase.from("listing_reviews")
      .select("id,listing_id,reviewer_id,rating,title,body,created_at,seller_reply,seller_reply_at,helpful_count,is_verified_purchase,users(display_name,username,avatar_url)")
      .in("listing_id", ids).order("created_at", { ascending: false });
    setReviews(revs || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function submitReply(id: string) {
    if (!replyText.trim()) return;
    setSaving(true);
    await supabase.from("listing_reviews").update({ seller_reply: replyText, seller_reply_at: new Date().toISOString() }).eq("id", id);
    setReviews(p => p.map(r => r.id === id ? { ...r, seller_reply: replyText, seller_reply_at: new Date().toISOString() } : r));
    setReplyId(null);
    setReplyText("");
    setSaving(false);
  }

  const filtered = reviews.filter(r => filter === "all" || r.rating.toString() === filter);
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5,4,3,2,1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length }));
  const unreplied = reviews.filter(r => !r.seller_reply).length;

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <div className="flex items-center gap-4 mb-3">
          <div className="text-center">
            <p className="text-4xl font-black text-[#202020]">{avgRating.toFixed(1)}</p>
            <div className="flex gap-0.5 mt-1">
              {[1,2,3,4,5].map(n => <span key={n} className={cn("text-xs", n <= Math.round(avgRating) ? "text-[#C5A059]" : "text-[#E5E3DB]")}>★</span>)}
            </div>
            <p className="text-[9px] text-[#7A7A7A] mt-1">{reviews.length} reviews</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {dist.map(d => (
              <div key={d.n} className="flex items-center gap-2">
                <span className="text-[9px] text-[#7A7A7A] w-4">{d.n}★</span>
                <div className="flex-1 bg-[#F3F1EC] rounded-full h-1.5">
                  <div className="h-full rounded-full bg-[#C5A059]" style={{ width: reviews.length > 0 ? `${(d.count / reviews.length) * 100}%` : "0%" }} />
                </div>
                <span className="text-[9px] text-[#7A7A7A] w-3 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
        {unreplied > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <Icon name="MessageCircle" size={13} className="text-amber-600 shrink-0" />
            <p className="text-[11px] font-bold text-amber-700">{unreplied} review{unreplied !== 1 ? "s" : ""} awaiting your reply</p>
          </div>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {(["all","5","4","3","2","1"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all shrink-0",
              filter === f ? "bg-[#C5A059] text-white border-[#C5A059]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>
            {f === "all" ? "All" : `${f}★`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[#7A7A7A]"><Icon name="Star" size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No reviews yet</p></div>
      ) : filtered.map(r => {
        const u = (r.users as any) || {};
        return (
          <div key={r.id} className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-9 h-9 rounded-full bg-[#C5A059]/15 flex items-center justify-center shrink-0 overflow-hidden">
                {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover rounded-full" /> : <span className="text-[#C5A059] font-black text-sm">{(u.display_name||"?")[0]}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold truncate">{u.display_name || u.username}</p>
                  <div className="flex gap-0.5 shrink-0">
                    {[1,2,3,4,5].map(n => <span key={n} className={cn("text-[10px]", n <= r.rating ? "text-[#C5A059]" : "text-[#E5E3DB]")}>★</span>)}
                  </div>
                </div>
                <p className="text-[9px] text-[#7A7A7A]">{listings[r.listing_id] || "—"} · {relDay(r.created_at)}{r.is_verified_purchase ? " · ✓ Verified" : ""}</p>
              </div>
            </div>
            {r.title && <p className="text-[12px] font-bold mb-1">{r.title}</p>}
            {r.body  && <p className="text-[11px] text-[#7A7A7A] mb-3">{r.body}</p>}

            {r.seller_reply ? (
              <div className="bg-[#F3F1EC] rounded-xl px-3 py-2 ml-3 border-l-2 border-[#C5A059]">
                <p className="text-[9px] font-black text-[#C5A059] uppercase tracking-widest mb-1">Your Reply</p>
                <p className="text-[11px] text-[#202020]">{r.seller_reply}</p>
                <p className="text-[9px] text-[#7A7A7A] mt-1">{r.seller_reply_at ? relDay(r.seller_reply_at) : ""}</p>
              </div>
            ) : (
              <div>
                {replyId === r.id ? (
                  <div className="space-y-2">
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={2} placeholder="Write a professional reply…"
                      className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[11px] outline-none focus:border-[#C5A059] resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => setReplyId(null)} className="flex-1 py-1.5 rounded-xl border border-[#E5E3DB] text-[#7A7A7A] text-[10px] font-bold">Cancel</button>
                      <button onClick={() => submitReply(r.id)} disabled={saving} className="flex-1 py-1.5 rounded-xl bg-[#C5A059] text-white text-[10px] font-black disabled:opacity-50">
                        {saving ? "Saving…" : "Reply"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setReplyId(r.id); setReplyText(""); }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-[#C5A059] hover:underline">
                    <Icon name="MessageCircle" size={12} /> Reply to review
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ③ STUDIO — Listing Editor (NEW — doesn't exist anywhere)
// ═══════════════════════════════════════════════════════════════
type ListingKind = "product" | "project" | "code_review" | "job" | "service";
const KIND_LABELS: Record<ListingKind, string> = { product: "Product/App", project: "Acquisition", code_review: "Code Review", job: "Job", service: "Service" };

function StudioSection({ userId }: { userId: string }) {
  const [listings, setListings] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"listings" | "questions">("listings");
  const blank = { title: "", summary: "", description: "", kind: "product" as ListingKind, pricing_model: "sale", price_cents: 0, tags: "", tech_stack: "", demo_url: "", github_url: "", status: "draft" };
  const [form, setForm] = useState({ ...blank });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ls } = await supabase.from("marketplace_listings")
      .select("id,title,summary,kind,pricing_model,price_cents,status,tags,tech_stack,demo_url,github_url,description,views_count,purchases_count,reviews_count,rating,cover_url,updated_at")
      .eq("seller_id", userId).order("updated_at", { ascending: false });
    setListings(ls || []);
    if (ls && ls.length > 0) {
      const ids = ls.map((l: any) => l.id);
      const { data: qs } = await supabase.from("listing_questions")
        .select("id,listing_id,question,answer,answered_at,created_at,upvotes,asker_id,users(display_name,username,avatar_url)")
        .in("listing_id", ids).is("answer", null).order("upvotes", { ascending: false });
      setQuestions(qs || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function startEdit(l: any) {
    setForm({
      title: l.title || "", summary: l.summary || "", description: l.description || "",
      kind: l.kind || "product", pricing_model: l.pricing_model || "sale",
      price_cents: l.price_cents || 0, tags: (l.tags || []).join(", "),
      tech_stack: (l.tech_stack || []).join(", "), demo_url: l.demo_url || "",
      github_url: l.github_url || "", status: l.status || "draft",
    });
    setEditing(l);
    setCreating(false);
  }

  function startCreate() { setForm({ ...blank }); setEditing(null); setCreating(true); }

  async function save() {
    if (!form.title) return;
    setSaving(true);
    const payload: any = {
      title: form.title, summary: form.summary, description: form.description,
      kind: form.kind, pricing_model: form.pricing_model, price_cents: Number(form.price_cents),
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      tech_stack: form.tech_stack.split(",").map(t => t.trim()).filter(Boolean),
      demo_url: form.demo_url || null, github_url: form.github_url || null,
      status: form.status, seller_id: userId, updated_at: new Date().toISOString(),
    };
    if (creating) { await supabase.from("marketplace_listings").insert(payload); }
    else { await supabase.from("marketplace_listings").update(payload).eq("id", editing.id); }
    setSaving(false); setEditing(null); setCreating(false); load();
  }

  async function answerQuestion(id: string, answer: string) {
    if (!answer.trim()) return;
    await supabase.from("listing_questions").update({ answer, answered_at: new Date().toISOString() }).eq("id", id);
    setQuestions(p => p.filter(q => q.id !== id));
  }

  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});

  if (loading) return <Spinner />;
  if (editing || creating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-black">{creating ? "New Listing" : "Edit Listing"}</p>
          <button onClick={() => { setEditing(null); setCreating(false); }} className="text-[#7A7A7A]"><Icon name="X" size={16} /></button>
        </div>
        {[
          { key: "title",       label: "Title *",       placeholder: "Your product name" },
          { key: "summary",     label: "Tagline",       placeholder: "One-line pitch" },
          { key: "demo_url",    label: "Demo URL",      placeholder: "https://…" },
          { key: "github_url",  label: "GitHub URL",    placeholder: "https://github.com/…" },
          { key: "tags",        label: "Tags (comma-separated)", placeholder: "react, typescript, saas" },
          { key: "tech_stack",  label: "Stack (comma-separated)", placeholder: "Next.js, Supabase, Tailwind" },
        ].map(f => (
          <div key={f.key}>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">{f.label}</p>
            <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]" />
          </div>
        ))}
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Description</p>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4}
            placeholder="Full description of your listing…"
            className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059] resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Kind</p>
            <select value={form.kind} onChange={e => setForm(p => ({ ...p, kind: e.target.value as ListingKind }))}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]">
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Pricing</p>
            <select value={form.pricing_model} onChange={e => setForm(p => ({ ...p, pricing_model: e.target.value }))}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]">
              {["sale","rent","subscription","free","open_source"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Price (cents)</p>
            <input type="number" value={form.price_cents} onChange={e => setForm(p => ({ ...p, price_cents: Number(e.target.value) }))}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Status</p>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]">
              {["draft","active","archived"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => { setEditing(null); setCreating(false); }}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E3DB] text-[#7A7A7A] text-[11px] font-bold">Cancel</button>
          <button onClick={save} disabled={saving || !form.title}
            className="flex-1 py-2.5 rounded-xl bg-[#C5A059] text-white text-[11px] font-black disabled:opacity-50">
            {saving ? "Saving…" : creating ? "Publish" : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(["listings", "questions"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all",
              tab === t ? "bg-[#202020] text-white border-[#202020]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>
            {t === "questions" ? `Questions${questions.length > 0 ? ` (${questions.length})` : ""}` : t}
          </button>
        ))}
      </div>

      {tab === "listings" && (
        <>
          <button onClick={startCreate}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#C5A059]/40 text-[#C5A059] text-[11px] font-bold hover:bg-[#C5A059]/5 transition-colors">
            <Icon name="Plus" size={14} /> New Listing
          </button>
          {listings.map(l => (
            <div key={l.id} className="bg-white rounded-xl border border-[#E5E3DB] p-3 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#F3F1EC] overflow-hidden shrink-0 flex items-center justify-center">
                {l.cover_url ? <img src={l.cover_url} className="w-full h-full object-cover" /> : <Icon name="Package" size={16} className="text-[#C5A059]/50" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold truncate">{l.title}</p>
                <p className="text-[10px] text-[#7A7A7A]">{KIND_LABELS[l.kind as ListingKind] || l.kind} · {fmt(l.price_cents)} · <StatusPill status={l.status} /></p>
                <p className="text-[9px] text-[#7A7A7A] mt-0.5">{l.views_count || 0} views · {l.purchases_count || 0} sold · ★{Number(l.rating || 0).toFixed(1)}</p>
              </div>
              <button onClick={() => startEdit(l)} className="w-8 h-8 rounded-lg border border-[#E5E3DB] flex items-center justify-center text-[#7A7A7A] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0">
                <Icon name="Pencil" size={13} />
              </button>
            </div>
          ))}
        </>
      )}

      {tab === "questions" && (
        questions.length === 0 ? (
          <div className="text-center py-10 text-[#7A7A7A]"><Icon name="MessageSquare" size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No unanswered questions</p></div>
        ) : questions.map(q => {
          const u = (q.users as any) || {};
          const listingName = listings.find(l => l.id === q.listing_id)?.title || "—";
          return (
            <div key={q.id} className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
              <div className="flex items-start gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#C5A059]/15 flex items-center justify-center shrink-0 text-[#C5A059] font-black text-sm overflow-hidden">
                  {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full rounded-full object-cover" /> : (u.display_name||"?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[#7A7A7A]">{u.display_name || u.username} asked about <span className="font-bold text-[#202020]">{listingName}</span></p>
                  <p className="text-[12px] font-bold mt-0.5">{q.question}</p>
                  {q.upvotes > 0 && <p className="text-[9px] text-[#C5A059] font-bold mt-0.5">{q.upvotes} people want to know</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <input value={answerMap[q.id] || ""} onChange={e => setAnswerMap(p => ({ ...p, [q.id]: e.target.value }))}
                  placeholder="Answer publicly…"
                  className="flex-1 border border-[#E5E3DB] rounded-xl px-3 py-2 text-[11px] outline-none focus:border-[#C5A059]" />
                <button onClick={() => answerQuestion(q.id, answerMap[q.id] || "")}
                  className="px-3 py-2 bg-[#C5A059] text-white text-[10px] font-black rounded-xl hover:bg-[#B8954E] transition-colors">Answer</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ④ ESCROW — Credit & Escrow Management (NEW — doesn't exist)
// ═══════════════════════════════════════════════════════════════
function EscrowSection({ userId }: { userId: string }) {
  const [ledger, setLedger] = useState<any[]>([]);
  const [bounties, setBounties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("credit_ledger").select("id,delta,reason,bounty_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("dev_bounties").select("id,title,amount,status,difficulty,created_at,claimant_id").eq("poster_id", userId).neq("status", "closed").order("created_at", { ascending: false }),
    ]).then(([l, b]) => { setLedger(l.data || []); setBounties(b.data || []); setLoading(false); });
  }, [userId]);

  const balance    = ledger.reduce((s, l) => s + l.delta, 0);
  const inEscrow   = bounties.filter(b => ["open","claimed"].includes(b.status)).reduce((s, b) => s + b.amount, 0);
  const available  = balance - inEscrow;
  const earned     = ledger.filter(l => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const spent      = ledger.filter(l => l.delta < 0).reduce((s, l) => s + l.delta, 0);

  const chartData = useMemo(() => {
    const running: { date: string; balance: number }[] = [];
    let cum = 0;
    const sorted = [...ledger].reverse();
    sorted.forEach(l => {
      cum += l.delta;
      running.push({ date: new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), balance: cum });
    });
    return running.slice(-30);
  }, [ledger]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-[#202020] to-[#3A2E1A] rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #C5A059 0%, transparent 60%)" }} />
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#C5A059] mb-1">Total Balance</p>
          <p className="text-4xl font-black text-white tracking-tight">{balance}⚡</p>
          <div className="flex gap-4 mt-3">
            <div><p className="text-xs font-black text-white">{available}⚡</p><p className="text-[9px] text-white/50">Available</p></div>
            <div><p className="text-xs font-black text-amber-400">{inEscrow}⚡</p><p className="text-[9px] text-white/50">In Escrow</p></div>
            <div><p className="text-xs font-black text-emerald-400">+{earned}⚡</p><p className="text-[9px] text-white/50">Earned</p></div>
            <div><p className="text-xs font-black text-red-400">{spent}⚡</p><p className="text-[9px] text-white/50">Spent</p></div>
          </div>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest mb-3">Balance History</p>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 4)} />
              <YAxis tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 10 }} formatter={(v: any) => [`${v}⚡`, "Balance"]} />
              <Line type="monotone" dataKey="balance" stroke={G} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {bounties.filter(b => ["open","claimed"].includes(b.status)).length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 mb-3">Locked in Escrow</p>
          {bounties.filter(b => ["open","claimed"].includes(b.status)).map(b => (
            <div key={b.id} className="flex items-center justify-between py-2 border-b border-[#F3F1EC] last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold truncate">{b.title}</p>
                <p className="text-[10px] text-[#7A7A7A]">{b.difficulty} · {b.claimant_id ? "Claimed" : "Open"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-black text-amber-600">{b.amount}⚡</p>
                <StatusPill status={b.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3">Ledger History</p>
        {ledger.length === 0 ? (
          <p className="text-sm text-center text-[#7A7A7A] py-4">No credit activity</p>
        ) : ledger.map(l => (
          <div key={l.id} className="flex items-center gap-3 py-2 border-b border-[#F3F1EC] last:border-0">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", l.delta > 0 ? "bg-emerald-50" : "bg-red-50")}>
              <Icon name={l.delta > 0 ? "Plus" : "Minus"} size={12} className={l.delta > 0 ? "text-emerald-600" : "text-red-500"} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold truncate">{l.reason}</p>
              <p className="text-[9px] text-[#7A7A7A]">{relDay(l.created_at)}</p>
            </div>
            <p className={cn("text-[13px] font-black shrink-0", l.delta > 0 ? "text-emerald-600" : "text-red-500")}>
              {l.delta > 0 ? "+" : ""}{l.delta}⚡
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ⑤ ANALYTICS — Conversion & Performance (NEW — doesn't exist)
// ═══════════════════════════════════════════════════════════════
function AnalyticsSection({ userId }: { userId: string }) {
  const [listings, setListings] = useState<any[]>([]);
  const [orders,   setOrders]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sortBy,  setSortBy]    = useState<"conversion"|"revenue"|"views">("conversion");

  useEffect(() => {
    Promise.all([
      supabase.from("marketplace_listings").select("id,title,kind,views_count,purchases_count,revenue_cents,rating,reviews_count,downloads_count,favorites_count,pricing_model,price_cents,status,cover_url").eq("seller_id", userId),
      supabase.from("listing_orders").select("listing_id,amount_cents,status,created_at").eq("seller_id", userId).eq("status", "completed"),
    ]).then(([l, o]) => { setListings(l.data || []); setOrders(o.data || []); setLoading(false); });
  }, [userId]);

  const computed = useMemo(() => listings.map(l => {
    const views  = l.views_count || 0;
    const bought = l.purchases_count || 0;
    const rev    = l.revenue_cents || 0;
    const convRate = views > 0 ? (bought / views) * 100 : 0;
    const favRate  = views > 0 ? ((l.favorites_count || 0) / views) * 100 : 0;
    const lOrders  = orders.filter(o => o.listing_id === l.id);
    const avgOrder = lOrders.length > 0 ? lOrders.reduce((s, o) => s + o.amount_cents, 0) / lOrders.length : 0;
    return { ...l, convRate, favRate, avgOrder };
  }), [listings, orders]);

  const sorted = useMemo(() => [...computed].sort((a, b) =>
    sortBy === "conversion" ? b.convRate - a.convRate :
    sortBy === "revenue"    ? b.revenue_cents - a.revenue_cents :
                              b.views_count - a.views_count
  ), [computed, sortBy]);

  const totals = useMemo(() => ({
    views:    listings.reduce((s, l) => s + (l.views_count || 0), 0),
    revenue:  listings.reduce((s, l) => s + (l.revenue_cents || 0), 0),
    avg_conv: computed.length > 0 ? computed.reduce((s, l) => s + l.convRate, 0) / computed.length : 0,
    favs:     listings.reduce((s, l) => s + (l.favorites_count || 0), 0),
  }), [listings, computed]);

  const convChartData = useMemo(() =>
    sorted.slice(0, 8).map(l => ({ name: l.title.slice(0, 14), conv: +l.convRate.toFixed(1), views: l.views_count })),
    [sorted]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total Views"  value={totals.views.toLocaleString()} icon="Eye"     color="#3B82F6" />
        <KpiCard label="Avg Conv."    value={`${totals.avg_conv.toFixed(2)}%`} icon="TrendingUp" />
        <KpiCard label="Revenue"      value={fmt(totals.revenue)} icon="DollarSign" />
        <KpiCard label="Favorites"    value={totals.favs.toString()} icon="Heart"    color="#EF4444" />
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3">Conversion Rate by Product</p>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={convChartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} width={60} />
            <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 10 }} formatter={(v: any) => [`${v}%`, "Conversion"]} />
            <Bar dataKey="conv" fill={G} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-1.5">
        {(["conversion","revenue","views"] as const).map(s => (
          <button key={s} onClick={() => setSortBy(s)}
            className={cn("flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all",
              sortBy === s ? "bg-[#C5A059] text-white border-[#C5A059]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>
            {s === "conversion" ? "Conv%" : s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((l, i) => (
          <div key={l.id} className="bg-white rounded-xl border border-[#E5E3DB] p-3 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-black text-[#7A7A7A] w-4 shrink-0">{i + 1}</span>
              <div className="w-8 h-8 rounded-lg bg-[#F3F1EC] overflow-hidden shrink-0 flex items-center justify-center">
                {l.cover_url ? <img src={l.cover_url} className="w-full h-full object-cover" /> : <Icon name="Package" size={13} className="text-[#C5A059]/50" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate">{l.title}</p>
                <p className="text-[9px] text-[#7A7A7A]">{KIND_LABELS[l.kind as ListingKind] || l.kind}</p>
              </div>
              <StatusPill status={l.status} />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "Views",     value: (l.views_count || 0).toLocaleString(), highlight: sortBy === "views" },
                { label: "Conv%",     value: `${l.convRate.toFixed(1)}%`,           highlight: sortBy === "conversion" },
                { label: "Revenue",   value: fmt(l.revenue_cents || 0),             highlight: sortBy === "revenue" },
                { label: "★ Avg",    value: Number(l.rating || 0).toFixed(1),       highlight: false },
              ].map(m => (
                <div key={m.label} className={cn("rounded-lg p-2 text-center", m.highlight ? "bg-[#C5A059]/10" : "bg-[#F3F1EC]")}>
                  <p className={cn("text-[11px] font-black", m.highlight ? "text-[#C5A059]" : "text-[#202020]")}>{m.value}</p>
                  <p className="text-[8px] text-[#7A7A7A]">{m.label}</p>
                </div>
              ))}
            </div>
            {l.views_count > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-[9px] text-[#7A7A7A] mb-1">
                  <span>Conversion funnel</span>
                  <span>{l.convRate.toFixed(1)}%</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-[#F3F1EC] gap-px">
                  <div className="bg-[#3B82F6] h-full" style={{ width: "100%" }} title={`${l.views_count} views`} />
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-[#F3F1EC] gap-px mt-0.5">
                  <div className="bg-[#C5A059] h-full" style={{ width: `${Math.min(100, l.convRate)}%` }} title={`${l.purchases_count || 0} purchases`} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ⑥ COMPANY — Company Control Panel (NEW — doesn't exist)
// ═══════════════════════════════════════════════════════════════
function CompanySection({ userId }: { userId: string }) {
  const [company, setCompany]   = useState<any | null>(null);
  const [members, setMembers]   = useState<any[]>([]);
  const [opsLog,  setOpsLog]    = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [tab, setTab]           = useState<"overview" | "members" | "log">("overview");
  const [form, setForm]         = useState<any>({});
  const [newMemberRole, setNewMemberRole] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: co } = await supabase.from("company_profiles").select("*").eq("owner_id", userId).single();
    setCompany(co);
    if (co) {
      const [{ data: ms }, { data: logs }] = await Promise.all([
        supabase.from("company_members").select("id,role,title,joined_at,users(id,display_name,username,avatar_url)").eq("company_id", co.id).order("joined_at"),
        supabase.from("company_ops_log").select("id,kind,payload,created_at").eq("company_id", co.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setMembers(ms || []);
      setOpsLog(logs || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() { setForm({ ...company, tags: (company?.tags || []).join(", ") }); setEditing(true); }

  async function saveCompany() {
    setSaving(true);
    const payload = { ...form, tags: form.tags.split(",").map((t: string) => t.trim()).filter(Boolean), updated_at: new Date().toISOString() };
    delete payload.id; delete payload.owner_id; delete payload.created_at;
    await supabase.from("company_profiles").update(payload).eq("id", company.id);
    setSaving(false); setEditing(false); load();
  }

  async function changeMemberRole(memberId: string, role: string) {
    await supabase.from("company_members").update({ role }).eq("id", memberId);
    setMembers(p => p.map(m => m.id === memberId ? { ...m, role } : m));
  }

  async function removeMember(memberId: string) {
    await supabase.from("company_members").delete().eq("id", memberId);
    setMembers(p => p.filter(m => m.id !== memberId));
  }

  const ROLES = ["owner", "admin", "manager", "cashier", "viewer"];
  const roleColor: Record<string, string> = { owner: G, admin: "#8B5CF6", manager: "#3B82F6", cashier: "#10B981", viewer: MUTED };

  if (loading) return <Spinner />;

  if (!company) {
    return (
      <div className="text-center py-12 text-[#7A7A7A] space-y-3">
        <Icon name="Building2" size={32} className="mx-auto opacity-30" />
        <p className="text-sm font-bold">No Company Profile</p>
        <p className="text-xs max-w-[200px] mx-auto">Create your company in the Marketplace to manage it here.</p>
      </div>
    );
  }

  if (editing) {
    const fields = [
      { key: "name",         label: "Company Name *",  type: "input" },
      { key: "tagline",      label: "Tagline",          type: "input" },
      { key: "bio",          label: "Bio",              type: "textarea" },
      { key: "website",      label: "Website",          type: "input" },
      { key: "location",     label: "Location",         type: "input" },
      { key: "industry",     label: "Industry",         type: "input" },
      { key: "founded_year", label: "Founded Year",     type: "input" },
      { key: "twitter_url",  label: "Twitter",          type: "input" },
      { key: "linkedin_url", label: "LinkedIn",         type: "input" },
      { key: "github_url",   label: "GitHub",           type: "input" },
      { key: "tags",         label: "Tags (comma-separated)", type: "input" },
    ];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-black">Edit Company</p>
          <button onClick={() => setEditing(false)} className="text-[#7A7A7A]"><Icon name="X" size={16} /></button>
        </div>
        {fields.map(f => (
          <div key={f.key}>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">{f.label}</p>
            {f.type === "textarea" ? (
              <textarea value={form[f.key] || ""} onChange={e => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))} rows={3}
                className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059] resize-none" />
            ) : (
              <input value={form[f.key] || ""} onChange={e => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]" />
            )}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Stage</p>
            <select value={form.stage || "startup"} onChange={e => setForm((p: any) => ({ ...p, stage: e.target.value }))}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]">
              {["idea","startup","growth","scale","enterprise"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1">Team Size</p>
            <select value={form.team_size || "1-5"} onChange={e => setForm((p: any) => ({ ...p, team_size: e.target.value }))}
              className="w-full border border-[#E5E3DB] rounded-xl px-3 py-2 text-[12px] outline-none focus:border-[#C5A059]">
              {["1","1-5","6-10","11-50","51-200","200+"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="is_hiring" checked={!!form.is_hiring} onChange={e => setForm((p: any) => ({ ...p, is_hiring: e.target.checked }))}
            className="w-4 h-4 accent-[#C5A059]" />
          <label htmlFor="is_hiring" className="text-[11px] font-bold">Currently Hiring</label>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border border-[#E5E3DB] text-[#7A7A7A] text-[11px] font-bold">Cancel</button>
          <button onClick={saveCompany} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#C5A059] text-white text-[11px] font-black disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#C5A059]/15 overflow-hidden flex items-center justify-center shrink-0">
            {company.logo_url ? <img src={company.logo_url} className="w-full h-full object-cover" /> : <Icon name="Building2" size={22} className="text-[#C5A059]" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[14px] font-black truncate">{company.name}</p>
              {company.is_verified && <Icon name="BadgeCheck" size={14} className="text-[#C5A059] shrink-0" />}
              {company.is_hiring && <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">Hiring</span>}
            </div>
            <p className="text-[10px] text-[#7A7A7A]">{company.tagline || "—"}</p>
            <p className="text-[10px] text-[#7A7A7A] mt-0.5">{company.industry || ""}{company.location ? ` · ${company.location}` : ""}{company.founded_year ? ` · est. ${company.founded_year}` : ""}</p>
          </div>
          <button onClick={startEdit} className="w-8 h-8 rounded-xl border border-[#E5E3DB] flex items-center justify-center text-[#7A7A7A] hover:border-[#C5A059] hover:text-[#C5A059] shrink-0 transition-colors">
            <Icon name="Pencil" size={13} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Members",  value: members.length },
            { label: "Revenue",  value: fmt(company.total_revenue_cents || 0) },
            { label: "Sales",    value: (company.total_sales || 0).toString() },
          ].map(m => (
            <div key={m.label} className="bg-[#F3F1EC] rounded-xl p-2.5 text-center">
              <p className="text-sm font-black text-[#202020]">{m.value}</p>
              <p className="text-[9px] text-[#7A7A7A]">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        {(["overview","members","log"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all",
              tab === t ? "bg-[#202020] text-white border-[#202020]" : "bg-white border-[#E5E3DB] text-[#7A7A7A]")}>
            {t === "log" ? "Activity" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 shadow-sm space-y-3">
          {company.bio && <p className="text-[12px] text-[#7A7A7A]">{company.bio}</p>}
          {[
            { label: "Website",  value: company.website,     icon: "Globe",    href: company.website },
            { label: "GitHub",   value: company.github_url,  icon: "Github",   href: company.github_url },
            { label: "Twitter",  value: company.twitter_url, icon: "Twitter",  href: company.twitter_url },
            { label: "LinkedIn", value: company.linkedin_url,icon: "Linkedin", href: company.linkedin_url },
          ].filter(l => l.value).map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-[11px] font-bold text-[#3B82F6] hover:underline">
              <Icon name={l.icon as any} size={13} className="text-[#7A7A7A]" /> {l.value}
            </a>
          ))}
          {(company.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {company.tags.map((t: string) => <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#F3F1EC] text-[#7A7A7A]">{t}</span>)}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#C5A059] bg-[#C5A059]/10 px-2 py-1 rounded-lg">{company.stage}</span>
            <span className="text-[9px] text-[#7A7A7A]">{company.team_size} people</span>
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="bg-white rounded-2xl border border-[#E5E3DB] shadow-sm overflow-hidden">
          {members.length === 0 ? (
            <p className="text-sm text-center text-[#7A7A7A] py-8">No team members</p>
          ) : members.map(m => {
            const u = (m.users as any) || {};
            const isOwner = m.role === "owner";
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#E5E3DB]/60 last:border-0">
                <div className="w-9 h-9 rounded-full bg-[#C5A059]/15 flex items-center justify-center shrink-0 overflow-hidden">
                  {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full rounded-full object-cover" /> : <span className="text-[#C5A059] font-black text-sm">{(u.display_name||"?")[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold truncate">{u.display_name || u.username}</p>
                  <p className="text-[10px] text-[#7A7A7A]">{m.title || `@${u.username}`}</p>
                </div>
                {isOwner ? (
                  <span className="text-[9px] font-black px-2 py-1 rounded-full" style={{ color: G, background: G + "15" }}>Owner</span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select value={newMemberRole[m.id] !== undefined ? newMemberRole[m.id] : m.role}
                      onChange={e => { setNewMemberRole(p => ({ ...p, [m.id]: e.target.value })); changeMemberRole(m.id, e.target.value); }}
                      className="text-[9px] font-bold border border-[#E5E3DB] rounded-lg px-1.5 py-1 outline-none"
                      style={{ color: roleColor[m.role] || MUTED }}>
                      {ROLES.filter(r => r !== "owner").map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={() => removeMember(m.id)} className="w-6 h-6 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors">
                      <Icon name="UserMinus" size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "log" && (
        <div className="space-y-2">
          {opsLog.length === 0 ? (
            <div className="text-center py-8 text-[#7A7A7A] text-sm">No activity logged yet</div>
          ) : opsLog.map(l => (
            <div key={l.id} className="bg-white rounded-xl border border-[#E5E3DB] px-3 py-2.5 flex items-center gap-3 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-[#C5A059]/10 flex items-center justify-center shrink-0">
                <Icon name="Activity" size={13} className="text-[#C5A059]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold capitalize truncate">{(l.kind || "").replace(/_/g, " ")}</p>
                <p className="text-[9px] text-[#7A7A7A]">{relDay(l.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT EXPORT
// ═══════════════════════════════════════════════════════════════
export function StoreDashboardView({ currentUser }: { currentUser: any }) {
  const [section, setSection] = useState<Section>("overview");
  const navRef = useRef<HTMLDivElement>(null);
  const userId = currentUser?.id;

  useEffect(() => {
    const el = navRef.current?.querySelector("[data-active='true']") as HTMLElement;
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [section]);

  if (!userId) return null;

  const renderSection = () => {
    const props = { userId };
    switch (section) {
      case "overview":   return <OverviewSection   {...props} />;
      case "pos":        return <POSSection        {...props} />;
      case "inventory":  return <InventorySection  {...props} />;
      case "customers":  return <CustomersSection  {...props} />;
      case "financials": return <FinancialsSection {...props} />;
      case "reports":    return <ReportsSection    {...props} />;
      case "access":     return <AccessSection     {...props} />;
      case "pipeline":   return <PipelineSection   {...props} />;
      case "reviews":    return <ReviewsSection    {...props} />;
      case "studio":     return <StudioSection     {...props} />;
      case "escrow":     return <EscrowSection     {...props} />;
      case "analytics":  return <AnalyticsSection  {...props} />;
      case "company":    return <CompanySection    {...props} />;
    }
  };

  return (
    <div className="flex flex-col pb-32">
      <div className="bg-gradient-to-br from-[#202020] to-[#3A2E1A] rounded-2xl p-4 mb-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #C5A059 0%, transparent 60%)" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-0.5">
            <Icon name="LayoutDashboard" size={13} className="text-[#C5A059]" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#C5A059]">Store Control</p>
          </div>
          <h1 className="text-xl font-black text-white">Business Hub</h1>
        </div>
      </div>

      <div ref={navRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-4 -mx-2.5 px-2.5">
        {SECTIONS.map(s => (
          <button key={s.id} data-active={section === s.id} onClick={() => setSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap text-[11px] font-bold transition-all border shrink-0",
              section === s.id ? "bg-[#202020] text-white border-[#202020] shadow-md" : "bg-white text-[#7A7A7A] border-[#E5E3DB] hover:border-[#C5A059]/40"
            )}>
            <Icon name={s.icon as any} size={12} className={section === s.id ? "text-[#C5A059]" : ""} />
            {s.label}
            {s.isNew && section !== s.id && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] shrink-0" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
          {renderSection()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
