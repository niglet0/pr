import React, { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, Skeleton, cn } from "../UI";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Order = {
  id: string;
  listing_id: string;
  seller_id: string;
  amount_cents: number;
  currency: string;
  order_type: string;
  status: string;
  created_at: string;
  listing?: {
    title: string;
    cover_url?: string | null;
    kind: string;
    seller?: { display_name?: string; handle?: string; avatar_url?: string } | null;
  } | null;
};

type Application = {
  id: string;
  listing_id: string;
  stage: string;
  status: string;
  cover_letter?: string | null;
  created_at: string;
  updated_at?: string | null;
  listing?: {
    title: string;
    cover_url?: string | null;
    seller?: { display_name?: string; handle?: string; avatar_url?: string } | null;
  } | null;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const fmtCents = (c: number) => {
  if (c === 0) return "Free";
  const v = c / 100;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  completed: { label: "Completed", color: "#16a34a", bg: "#dcfce7", icon: "CheckCircle2" },
  pending:   { label: "Pending",   color: "#d97706", bg: "#fef3c7", icon: "Clock" },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2", icon: "XCircle" },
  refunded:  { label: "Refunded",  color: "#6b7280", bg: "#f3f4f6", icon: "RotateCcw" },
};

const STAGE_META: Record<string, { label: string; color: string }> = {
  applied:     { label: "Applied",     color: "#86868B" },
  shortlisted: { label: "Shortlisted", color: "#FF9F0A" },
  interview:   { label: "Interview",   color: "#0A84FF" },
  offer:       { label: "Offer",       color: "#8B5CF6" },
  hired:       { label: "Hired",       color: "#34C759" },
  rejected:    { label: "Rejected",    color: "#FF3B30" },
};

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

type Tab = "purchases" | "sales" | "applications";

type Props = {
  currentUser: any;
  onClose: () => void;
};

export function MyOrdersSheet({ currentUser, onClose }: Props) {
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [salesOrders,  setSalesOrders]  = useState<Order[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<Tab>("purchases");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [pRes, sRes, aRes] = await Promise.all([
      supabase
        .from("listing_orders")
        .select(`
          *,
          listing:listing_id(
            title, cover_url, kind,
            seller:seller_id(display_name, handle, avatar_url)
          )
        `)
        .eq("buyer_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("listing_orders")
        .select(`
          *,
          listing:listing_id(
            title, cover_url, kind,
            seller:seller_id(display_name, handle, avatar_url)
          )
        `)
        .eq("seller_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("job_applications")
        .select(`
          *,
          listing:listing_id(
            title, cover_url,
            seller:seller_id(display_name, handle, avatar_url)
          )
        `)
        .eq("applicant_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setOrders(pRes.data || []);
    setSalesOrders(sRes.data || []);
    setApplications(aRes.data || []);
    setLoading(false);
  }, [currentUser.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from("listing_orders")
      .update({ status: newStatus })
      .eq("id", orderId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Order marked as ${newStatus}`);
      fetchAll();
    }
  };

  const totalRevenue = salesOrders
    .filter((o) => o.status === "completed")
    .reduce((s, o) => s + o.amount_cents, 0);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "purchases",    label: "Purchases",    count: orders.length },
    { id: "sales",        label: "My Sales",     count: salesOrders.length },
    { id: "applications", label: "Applications", count: applications.length },
  ];

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-[130] bg-[#F5F5F7] flex flex-col"
    >
      <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
        <button onClick={onClose} className="text-[#0A84FF] tap-scale flex items-center text-[15px] tracking-tight">
          <Icon name="ChevronLeft" size={22} />
          <span className="-ml-1">Back</span>
        </button>
        <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">Activity</span>
        <div className="w-14" />
      </header>

      {/* Tabs */}
      <div className="flex border-b border-black/[0.06] px-2 bg-[#F5F5F7]/80 backdrop-blur-xl shrink-0 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative shrink-0 px-3 py-2.5 text-[13px] font-medium tracking-tight",
              tab === t.id ? "text-[#1D1D1F] font-semibold" : "text-[#86868B]",
            )}
          >
            {t.label}
            {!loading && t.count! > 0 && (
              <span className={cn(
                "ml-1 text-[10px] font-bold",
                tab === t.id ? "text-[#1D1D1F]" : "text-[#86868B]",
              )}>
                {t.count}
              </span>
            )}
            {tab === t.id && (
              <span className="absolute left-1 right-1 -bottom-px h-[2px] bg-[#1D1D1F] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Sales summary */}
      {tab === "sales" && !loading && (
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <SummaryCard value={String(salesOrders.length)} label="Orders" />
            <SummaryCard value={fmtCents(totalRevenue)} label="Revenue" accent="text-emerald-700" />
            <SummaryCard
              value={String(salesOrders.filter((o) => o.status === "pending").length)}
              label="Pending"
              accent="text-amber-600"
            />
          </div>
        </div>
      )}

      {/* Applications summary */}
      {tab === "applications" && !loading && applications.length > 0 && (
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <SummaryCard value={String(applications.length)} label="Applied" />
            <SummaryCard
              value={String(applications.filter((a) => a.stage === "hired").length)}
              label="Hired"
              accent="text-emerald-700"
            />
            <SummaryCard
              value={String(applications.filter((a) => ["interview", "offer"].includes(a.stage)).length)}
              label="Active"
              accent="text-[#0A84FF]"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={80} rounded={16} />
            ))}
          </div>
        ) : (
          <>
            {/* ----------- PURCHASES / SALES ----------- */}
            {(tab === "purchases" || tab === "sales") && (() => {
              const list = tab === "purchases" ? orders : salesOrders;
              if (list.length === 0) {
                return (
                  <EmptyPane
                    icon={tab === "purchases" ? "ShoppingBag" : "TrendingUp"}
                    title={tab === "purchases" ? "No purchases yet" : "No sales yet"}
                    subtitle={tab === "purchases"
                      ? "Browse the marketplace to find something you like."
                      : "List something in the marketplace to start selling."}
                  />
                );
              }
              return (
                <div className="p-4 space-y-3">
                  {list.map((order) => {
                    const sm = STATUS_META[order.status] || STATUS_META.pending;
                    return (
                      <div key={order.id} className="p-3.5 rounded-2xl bg-white border border-black/[0.05] space-y-3">
                        <div className="flex gap-3">
                          <div className="w-12 h-12 rounded-xl bg-[#F5F5F7] overflow-hidden shrink-0">
                            {order.listing?.cover_url ? (
                              <img src={order.listing.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Icon name="Package" size={18} color="#86868B" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-semibold tracking-tight text-[#1D1D1F] truncate">
                              {order.listing?.title || "Deleted listing"}
                            </p>
                            <p className="text-[12px] text-[#86868B] tracking-tight mt-0.5">
                              {new Date(order.created_at).toLocaleDateString("en-US", {
                                year: "numeric", month: "short", day: "numeric",
                              })}
                              {" · "}
                              <span className="capitalize">{order.order_type}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[15px] font-bold tracking-tight text-[#1D1D1F]">
                              {fmtCents(order.amount_cents)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold tracking-tight"
                            style={{ color: sm.color, background: sm.bg }}
                          >
                            <Icon name={sm.icon as any} size={11} color={sm.color} />
                            {sm.label}
                          </span>
                          {tab === "sales" && order.status === "pending" && (
                            <div className="flex gap-3">
                              <button
                                onClick={() => updateStatus(order.id, "completed")}
                                className="text-[12px] font-semibold text-emerald-700 tracking-tight"
                              >
                                Mark complete
                              </button>
                              <button
                                onClick={() => updateStatus(order.id, "cancelled")}
                                className="text-[12px] font-medium text-[#FF3B30] tracking-tight"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                          {tab === "purchases" && order.status === "completed" && (
                            <button className="flex items-center gap-1 text-[12px] font-semibold text-[#0A84FF] tracking-tight">
                              <Icon name="FolderOpen" size={12} color="#0A84FF" />
                              Access files
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ----------- APPLICATIONS ----------- */}
            {tab === "applications" && (() => {
              if (applications.length === 0) {
                return (
                  <EmptyPane
                    icon="Briefcase"
                    title="No applications yet"
                    subtitle="Apply to job listings in the marketplace to track them here."
                  />
                );
              }
              return (
                <div className="p-4 space-y-3">
                  {applications.map((app) => {
                    const sm = STAGE_META[app.stage || "applied"] || STAGE_META.applied;
                    return (
                      <div key={app.id} className="p-3.5 rounded-2xl bg-white border border-black/[0.05]">
                        <div className="flex gap-3">
                          <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/10 overflow-hidden shrink-0 flex items-center justify-center">
                            {app.listing?.cover_url ? (
                              <img src={app.listing.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Icon name="Briefcase" size={18} color="#8B5CF6" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-semibold tracking-tight text-[#1D1D1F] truncate">
                              {app.listing?.title || "Deleted listing"}
                            </p>
                            <p className="text-[12px] text-[#86868B] tracking-tight mt-0.5">
                              at {app.listing?.seller?.display_name || app.listing?.seller?.handle || "Unknown"}
                            </p>
                            <p className="text-[11px] text-[#86868B] tracking-tight mt-0.5">
                              Applied {new Date(app.created_at).toLocaleDateString("en-US", {
                                month: "short", day: "numeric",
                              })}
                              {app.updated_at && app.updated_at !== app.created_at && (
                                <> · Updated {new Date(app.updated_at).toLocaleDateString("en-US", {
                                  month: "short", day: "numeric",
                                })}</>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold tracking-tight"
                            style={{ color: sm.color, background: `${sm.color}18` }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: sm.color }}
                            />
                            {sm.label}
                          </span>
                          {app.cover_letter && (
                            <p className="text-[11.5px] text-[#86868B] truncate max-w-[140px] tracking-tight">
                              "{app.cover_letter.slice(0, 50)}{app.cover_letter.length > 50 ? "…" : ""}"
                            </p>
                          )}
                        </div>

                        {/* Progress bar for stage */}
                        <div className="mt-2.5 flex gap-0.5">
                          {["applied", "shortlisted", "interview", "offer", "hired"].map((s, i) => {
                            const stages = ["applied", "shortlisted", "interview", "offer", "hired"];
                            const currentIdx = stages.indexOf(app.stage || "applied");
                            const thisIdx = stages.indexOf(s);
                            const isActive = thisIdx <= currentIdx && app.stage !== "rejected";
                            const isRejected = app.stage === "rejected";
                            return (
                              <div
                                key={s}
                                className="flex-1 h-1 rounded-full transition-colors"
                                style={{
                                  background: isRejected
                                    ? "#FF3B30"
                                    : isActive
                                    ? STAGE_META[s]?.color || "#86868B"
                                    : "#E5E5EA",
                                  opacity: isRejected ? (i === 0 ? 1 : 0.3) : 1,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function SummaryCard({
  value, label, accent = "text-[#1D1D1F]",
}: {
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-black/[0.04] text-center">
      <div className={cn("text-[18px] font-semibold tracking-tight", accent)}>{value}</div>
      <div className="text-[10px] font-medium text-[#86868B] tracking-tight mt-0.5">{label}</div>
    </div>
  );
}

function EmptyPane({
  icon, title, subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#E8E8ED] flex items-center justify-center mb-4">
        <Icon name={icon as any} size={24} color="#86868B" />
      </div>
      <p className="text-[15px] font-semibold tracking-tight text-[#1D1D1F] mb-1">{title}</p>
      <p className="text-[13px] text-[#86868B] tracking-tight">{subtitle}</p>
    </div>
  );
}
