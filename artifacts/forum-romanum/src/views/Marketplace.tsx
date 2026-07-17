import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
const SandboxIDE = lazy(() => import("../components/sandbox/SandboxIDE"));
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Avatar, Button, Card, Chip, Icon, Skeleton, cn } from "../components/UI";
import { toast } from "sonner";
import { ReviewsTab } from "../components/marketplace/ReviewsTab";
import { QATab } from "../components/marketplace/QATab";
import { VersionHistoryTab } from "../components/marketplace/VersionHistoryTab";
import { ProductFilesTab } from "../components/marketplace/ProductFilesTab";
import { InstallGuideTab } from "../components/marketplace/InstallGuideTab";
import { ServicePackages } from "../components/marketplace/ServicePackages";
import { VideoPlayer, VideoUploader } from "../components/marketplace/VideoUploader";
import { ImageUploader } from "../components/marketplace/ImageUploader";
import { SellerProfileSheet } from "../components/marketplace/SellerProfileSheet";
import { CompanyProfileSheet } from "../components/marketplace/CompanyProfileSheet";
import { JobPipelineSheet, ApplyForm } from "../components/marketplace/JobPipelineSheet";
import { EditListingSheet } from "../components/marketplace/EditListingSheet";
import { PaymentModal } from "../components/marketplace/PaymentModal";
import { MyOrdersSheet } from "../components/marketplace/MyOrdersSheet";
import SandboxZipUploader from "../components/marketplace/SandboxZipUploader";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type MarketKind = "product" | "project" | "code_review" | "job" | "service";

type Listing = {
  id: string;
  seller_id: string;
  kind: MarketKind;
  category?: string | null;
  title: string;
  summary?: string | null;
  description?: string | null;
  cover_url?: string | null;
  gallery?: string[] | null;
  demo_video_url?: string | null;
  video_storage_path?: string | null;
  demo_url?: string | null;
  github_url?: string | null;
  documentation_url?: string | null;
  tech_stack?: string[] | null;
  tags?: string[] | null;
  features?: string[] | null;
  license?: string | null;
  pricing_model: string;
  price_cents: number;
  rent_price_cents?: number | null;
  rent_period?: string | null;
  subscription_price_cents?: number | null;
  subscription_period?: string | null;
  currency?: string | null;
  status: string;
  is_featured?: boolean;
  is_staff_pick?: boolean;
  is_verified?: boolean;
  views_count?: number;
  favorites_count?: number;
  downloads_count?: number;
  purchases_count?: number;
  revenue_cents?: number;
  rating?: number;
  reviews_count?: number;
  installation_guide?: string | null;
  requirements?: string[] | null;
  similar_tech?: string[] | null;
  metadata?: any;
  created_at?: string;
};

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const KIND_META: Record<
  MarketKind,
  { label: string; icon: any; tagline: string; accent: string }
> = {
  product: {
    label: "Forum",
    icon: "Store",
    tagline: "Buy, sell & rent apps, code, templates, APIs and assets.",
    accent: "#C5A059",
  },
  project: {
    label: "Acquisitions",
    icon: "Building2",
    tagline: "Acquire complete SaaS businesses and software projects.",
    accent: "#3B82F6",
  },
  code_review: {
    label: "Curia",
    icon: "GitPullRequest",
    tagline: "Request and provide professional code reviews.",
    accent: "#10B981",
  },
  job: {
    label: "Legion",
    icon: "Briefcase",
    tagline: "Recruit developers, co-founders and contributors.",
    accent: "#8B5CF6",
  },
  service: {
    label: "Atrium",
    icon: "Wrench",
    tagline: "Hire developers for consulting, audits and mentoring.",
    accent: "#EF4444",
  },
};

const KIND_TABS: MarketKind[] = ["product", "project", "code_review", "job", "service"];

const PRODUCT_CATEGORIES = [
  "application", "website", "saas", "mobile_app", "api", "bot",
  "script", "template", "component", "library", "source_code",
  "domain", "asset", "service",
];

const PRICING_MODELS = ["sale", "rent", "subscription", "free", "open_source", "hourly", "fixed"];

const PAGE_SIZE = 20;

const fmtCents = (c?: number | null, ccy = "USD") => {
  if (c == null) return "—";
  const v = c / 100;
  if (v === 0) return "Free";
  if (v >= 1000) return `${ccy === "USD" ? "$" : ""}${(v / 1000).toFixed(1)}k`;
  return `${ccy === "USD" ? "$" : ""}${v.toFixed(0)}`;
};

/* -------------------------------------------------------------------------- */
/*  Main view                                                                  */
/* -------------------------------------------------------------------------- */

export function MarketplaceView({ currentUser, initialListingId, onOpenProfile }: { currentUser?: any; initialListingId?: string | null; onOpenProfile?: (userId: string) => void }) {
  const [kind, setKind] = useState<MarketKind>("product");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [pricingFilter, setPricingFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<Listing | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const [missingSchema, setMissingSchema] = useState(false);

  const fetchListings = async (pageNum = 0, append = false) => {
    if (pageNum === 0) setLoading(true); else setLoadingMore(true);
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("kind", kind)
      .eq("status", "active")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      setMissingSchema(true);
      if (!append) setListings([]);
    } else {
      setMissingSchema(false);
      const items = data || [];
      setHasMore(items.length === PAGE_SIZE);
      if (append) setListings((prev) => [...prev, ...items]);
      else setListings(items);
    }
    if (pageNum === 0) setLoading(false); else setLoadingMore(false);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchListings(nextPage, true);
  };

  const fetchFavs = async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from("listing_favorites")
      .select("listing_id")
      .eq("user_id", currentUser.id);
    if (data) {
      const m: Record<string, boolean> = {};
      data.forEach((r: any) => (m[r.listing_id] = true));
      setFavs(m);
    }
  };

  useEffect(() => {
    setPage(0);
    setListings([]);
    fetchListings(0, false);
  }, [kind]);

  useEffect(() => { fetchFavs(); }, [currentUser?.id]);

  // Open a specific listing when navigated from another view
  useEffect(() => {
    if (!initialListingId) return;
    supabase
      .from("marketplace_listings")
      .select("*")
      .eq("id", initialListingId)
      .single()
      .then(({ data }) => {
        if (data) setDetail(data as Listing);
      });
  }, [initialListingId]);

  const filtered = useMemo(
    () =>
      listings.filter(
        (l) =>
          (!pricingFilter || l.pricing_model === pricingFilter) &&
          (!categoryFilter || l.category === categoryFilter) &&
          (!query ||
            (l.title + " " + (l.summary || "") + " " + (l.tags || []).join(" "))
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [listings, pricingFilter, categoryFilter, query],
  );

  const featured = useMemo(() => filtered.filter((l) => l.is_featured).slice(0, 5), [filtered]);
  const staffPicks = useMemo(() => filtered.filter((l) => l.is_staff_pick).slice(0, 3), [filtered]);
  const trending = useMemo(
    () => [...filtered].sort((a, b) => (b.views_count || 0) - (a.views_count || 0)).slice(0, 6),
    [filtered],
  );

  const toggleFav = async (id: string) => {
    if (!currentUser?.id) return void toast.error("Sign in to save listings");
    const isFav = !!favs[id];
    setFavs((f) => ({ ...f, [id]: !isFav }));
    if (isFav) {
      await supabase.from("listing_favorites").delete().eq("user_id", currentUser.id).eq("listing_id", id);
    } else {
      await supabase.from("listing_favorites").insert({ user_id: currentUser.id, listing_id: id });
    }
  };

  const meta = KIND_META[kind];

  return (
    <div
      className="flex-1 overflow-y-auto pb-32 bg-[#FAF9F6] -mx-2.5 -mt-3 relative"
      style={{
        backgroundImage: `
          radial-gradient(900px 380px at -10% -10%, ${meta.accent}14, transparent 60%),
          radial-gradient(700px 340px at 110% 0%, #C5A05912, transparent 55%),
          linear-gradient(180deg, #FAF9F6 0%, #F5F1E6 100%)
        `,
      }}
    >
      {/* Animated ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          aria-hidden
          className="absolute -top-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-40"
          style={{ background: `radial-gradient(circle, ${meta.accent}55 0%, transparent 70%)` }}
          animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-40 -right-20 w-80 h-80 rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #D4AF3766 0%, transparent 70%)" }}
          animate={{ x: [0, -30, 0], y: [0, 25, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #8C6A32 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
      </div>

      {/* Hero */}
      <div className="relative px-6 pt-9 pb-7">
        <div className="flex items-start justify-between">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] font-black tracking-[0.28em] uppercase"
              style={{ color: meta.accent }}
            >
              Mercatum · {meta.label}
            </motion.p>
            <motion.h1
              key={kind}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-1 text-[34px] leading-[1.05] font-black tracking-[-0.025em] serif italic text-[#202020]"
            >
              The Forum.
            </motion.h1>
            <motion.p
              key={`tag-${kind}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="mt-2 text-[13.5px] text-[#7A7A7A] max-w-sm leading-snug"
            >
              {meta.tagline}
            </motion.p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <motion.button
              whileTap={{ scale: 0.92, rotate: 90 }}
              onClick={() => fetchListings(0)}
              className="w-10 h-10 rounded-full bg-white/70 backdrop-blur border border-[#C5A059]/25 flex items-center justify-center text-[#8C6A32] shadow-sm"
            >
              <Icon name="RefreshCw" size={15} className={loading ? "animate-spin" : ""} />
            </motion.button>
            {currentUser?.id && (
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => setMyOrdersOpen(true)}
                className="w-10 h-10 rounded-full bg-white/70 backdrop-blur border border-[#C5A059]/25 flex items-center justify-center text-[#8C6A32] shadow-sm"
                title="My Orders"
              >
                <Icon name="ShoppingBag" size={15} />
              </motion.button>
            )}
          </div>
        </div>

        <LayoutGroup id="mk-kind">
          <div className="mt-6 flex gap-1 p-1 rounded-2xl bg-white/60 backdrop-blur border border-[#C5A059]/15 shadow-[0_1px_0_rgba(197,160,89,0.08)] overflow-x-auto no-scrollbar">
            {KIND_TABS.map((k) => {
              const active = kind === k;
              const m = KIND_META[k];
              return (
                <button
                  key={k}
                  onClick={() => { setKind(k); setCategoryFilter(null); setPricingFilter(null); }}
                  className={cn(
                    "relative shrink-0 flex-1 min-w-fit px-3 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors",
                    active ? "text-white" : "text-[#7A7A7A]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="mk-kind-pill"
                      className="absolute inset-0 rounded-xl shadow-[0_6px_18px_-6px_rgba(140,106,50,0.45)]"
                      style={{
                        background: `linear-gradient(135deg, ${m.accent} 0%, ${m.accent}cc 100%)`,
                      }}
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon name={m.icon} size={12} />
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {missingSchema && <SchemaWarning />}

      {/* Search + filters */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/85 backdrop-blur-xl border-b border-[#C5A059]/15 relative">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-white/80 border border-[#C5A059]/20 rounded-full px-3.5 py-2 focus-within:border-[#C5A059] focus-within:shadow-[0_0_0_4px_rgba(197,160,89,0.12)] transition-all">
            <Icon name="Search" size={15} className="text-[#C5A059]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${meta.label}`}
              className="flex-1 bg-transparent outline-none text-[13.5px] font-medium tracking-tight placeholder:text-[#7A7A7A]/80"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-[#7A7A7A]">
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
        </div>
        {kind === "product" && (
          <div className="flex px-3 pb-2 gap-1.5 overflow-x-auto no-scrollbar">
            <Chip label="All" active={!categoryFilter} onClick={() => setCategoryFilter(null)} />
            {PRODUCT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c.replace("_", " ")}
                active={categoryFilter === c}
                onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
              />
            ))}
          </div>
        )}
        <div className="flex px-3 pb-2 gap-1.5 overflow-x-auto no-scrollbar">
          <Chip label="Any price" active={!pricingFilter} onClick={() => setPricingFilter(null)} />
          {PRICING_MODELS.map((p) => (
            <Chip
              key={p}
              label={p.replace("_", " ")}
              active={pricingFilter === p}
              onClick={() => setPricingFilter(pricingFilter === p ? null : p)}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-5 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={kind}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28 }}
            className="space-y-5"
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={120} rounded={18} />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState kind={kind} onCreate={() => setCreateOpen(true)} />
            ) : (
              <>
                {featured.length > 0 && (
                  <Section title="Featured" icon="Star" accent={meta.accent}>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                      {featured.map((l) => (
                        <FeaturedCard key={l.id} l={l} onOpen={() => setDetail(l)} isFav={!!favs[l.id]} onFav={() => toggleFav(l.id)} />
                      ))}
                    </div>
                  </Section>
                )}
                {staffPicks.length > 0 && (
                  <Section title="Staff Picks" icon="ShieldCheck" accent={meta.accent}>
                    <div className="space-y-2.5">
                      {staffPicks.map((l) => (
                        <ListingRow key={l.id} l={l} onOpen={() => setDetail(l)} isFav={!!favs[l.id]} onFav={() => toggleFav(l.id)} />
                      ))}
                    </div>
                  </Section>
                )}
                <Section title="All Listings" icon="Layers" count={filtered.length} accent={meta.accent}>
                  <div className="space-y-2.5">
                    {filtered.map((l, i) => (
                      <motion.div
                        key={l.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 8) * 0.025 }}
                      >
                        <ListingRow l={l} onOpen={() => setDetail(l)} isFav={!!favs[l.id]} onFav={() => toggleFav(l.id)} />
                      </motion.div>
                    ))}
                  </div>
                  {/* Load More */}
                  {hasMore && !query && !pricingFilter && !categoryFilter && (
                    <div className="pt-3 flex justify-center">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-[#C5A059]/25 text-[13px] font-semibold tracking-tight text-[#8C6A32] shadow-sm"
                      >
                        {loadingMore ? (
                          <Icon name="Loader2" size={14} className="animate-spin" />
                        ) : (
                          <Icon name="ChevronDown" size={14} />
                        )}
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </Section>
                {trending.length > 0 && (
                  <Section title="Trending" icon="Flame" accent={meta.accent}>
                    <div className="space-y-2.5">
                      {trending.map((l) => (
                        <ListingRow key={l.id} l={l} onOpen={() => setDetail(l)} isFav={!!favs[l.id]} onFav={() => toggleFav(l.id)} />
                      ))}
                    </div>
                  </Section>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* FAB */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 22, delay: 0.2 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => {
          if (!currentUser?.id) return void toast.error("Sign in to list");
          setCreateOpen(true);
        }}
        className="fixed bottom-28 right-5 z-40 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-[0_12px_30px_-8px_rgba(140,106,50,0.55)]"
        style={{
          background: `linear-gradient(135deg, ${meta.accent} 0%, #8C6A32 100%)`,
        }}
        aria-label="Create listing"
      >
        <Icon name="Plus" size={24} />
      </motion.button>

      <AnimatePresence>
        {detail && (
          <ListingDetailSheet
            listing={detail}
            onClose={() => setDetail(null)}
            currentUser={currentUser}
            isFav={!!favs[detail.id]}
            onFav={() => toggleFav(detail.id)}
            onListingUpdated={() => fetchListings(0)}
            onOpenProfile={onOpenProfile}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {createOpen && (
          <CreateListingSheet
            kind={kind}
            currentUser={currentUser}
            onClose={() => setCreateOpen(false)}
            onCreated={() => { setCreateOpen(false); fetchListings(0); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {myOrdersOpen && currentUser?.id && (
          <MyOrdersSheet currentUser={currentUser} onClose={() => setMyOrdersOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function SchemaWarning() {
  return (
    <div className="mx-4 mt-3 p-3 rounded-2xl border border-amber-500/20 bg-amber-50 text-[12.5px] text-amber-900 flex gap-2 items-start tracking-tight">
      <Icon name="AlertTriangle" size={14} className="text-amber-600 shrink-0 mt-0.5" />
      <span>
        Marketplace schema not detected. Paste <code className="font-mono text-[11px]">public/marketplace_migration.sql</code> into your Supabase SQL Editor.
      </span>
    </div>
  );
}

function Section({ title, icon, count, accent = "#C5A059", children }: { title: string; icon: any; count?: number; accent?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}1A`, color: accent }}
          >
            <Icon name={icon} size={13} />
          </span>
          <h3 className="text-[16px] font-black tracking-tight serif italic text-[#202020]">{title}</h3>
        </div>
        {count != null && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function PriceTag({ l, overrideCents }: { l: Listing; overrideCents?: number }) {
  if (overrideCents != null) {
    const v = overrideCents / 100;
    if (v === 0) return <span className="text-[12px] font-bold tracking-tight text-emerald-700">Free</span>;
    return <span className="text-[15px] font-black tracking-tight text-[#8C6A32]">{fmtCents(overrideCents, l.currency || "USD")}</span>;
  }
  if (l.pricing_model === "free" || l.pricing_model === "open_source")
    return <span className="text-[12px] font-bold tracking-tight text-emerald-700">{l.pricing_model === "free" ? "Free" : "Open Source"}</span>;
  if (l.pricing_model === "rent" && l.rent_price_cents != null)
    return <span className="text-[15px] font-black tracking-tight text-[#8C6A32]">{fmtCents(l.rent_price_cents, l.currency || "USD")}<span className="text-[10px] text-[#7A7A7A] font-bold ml-0.5">/{l.rent_period || "mo"}</span></span>;
  if (l.pricing_model === "subscription" && l.subscription_price_cents != null)
    return <span className="text-[15px] font-black tracking-tight text-[#8C6A32]">{fmtCents(l.subscription_price_cents, l.currency || "USD")}<span className="text-[10px] text-[#7A7A7A] font-bold ml-0.5">/{l.subscription_period || "mo"}</span></span>;
  return <span className="text-[15px] font-black tracking-tight text-[#8C6A32]">{fmtCents(l.price_cents, l.currency || "USD")}</span>;
}

function FeaturedCard({ l, onOpen, isFav, onFav }: { l: Listing; onOpen: () => void; isFav: boolean; onFav: () => void }) {
  const accent = KIND_META[l.kind as MarketKind].accent;
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="w-[260px] shrink-0 overflow-hidden rounded-2xl bg-white/90 backdrop-blur border border-[#C5A059]/20 shadow-[0_2px_6px_rgba(140,106,50,0.06)] hover:shadow-[0_14px_36px_-14px_rgba(140,106,50,0.35)] transition-shadow cursor-pointer"
    >
      <div
        className="relative h-32"
        style={{ background: `linear-gradient(135deg, ${accent}22 0%, #F3F1EC 100%)` }}
      >
        {l.cover_url ? (
          <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: accent }}>
            <Icon name={KIND_META[l.kind as MarketKind].icon} size={30} />
          </div>
        )}
        <div
          className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow"
          style={{ background: `linear-gradient(135deg, ${accent}, #8C6A32)` }}
        >
          Featured
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onFav(); }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-[#8C6A32]"
        >
          <Icon name="Heart" size={14} color={isFav ? "#EF4444" : "#8C6A32"} />
        </button>
      </div>
      <div className="p-3.5">
        <h4 className="text-[14px] font-bold tracking-tight text-[#202020] truncate">{l.title}</h4>
        <p className="text-[12px] text-[#7A7A7A] line-clamp-2 mt-0.5 leading-snug">{l.summary}</p>
        <div className="flex items-center justify-between mt-3">
          <PriceTag l={l} />
          <div className="flex items-center gap-1 text-[11px] text-[#7A7A7A] font-bold">
            <Icon name="Eye" size={11} />{l.views_count || 0}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ListingRow({ l, onOpen, isFav, onFav }: { l: Listing; onOpen: () => void; isFav: boolean; onFav: () => void }) {
  const accent = KIND_META[l.kind as MarketKind].accent;
  return (
    <motion.div
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="p-3 flex gap-3 rounded-2xl bg-white/85 backdrop-blur border border-[#C5A059]/15 hover:border-[#C5A059]/40 transition-colors cursor-pointer shadow-[0_1px_2px_rgba(140,106,50,0.04)]"
    >
      <div
        className="w-[60px] h-[60px] rounded-xl overflow-hidden shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}1F 0%, #F3F1EC 100%)` }}
      >
        {l.cover_url ? (
          <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: accent }}>
            <Icon name={KIND_META[l.kind as MarketKind].icon} size={20} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-[14.5px] font-bold tracking-tight text-[#202020] truncate">{l.title}</h4>
              {l.is_verified && <Icon name="BadgeCheck" size={13} color={accent} />}
            </div>
            {l.category && <p className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mt-0.5 capitalize">{l.category.replace("_", " ")}</p>}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onFav(); }} className="text-[#7A7A7A] -mr-1">
            <Icon name="Heart" size={15} color={isFav ? "#EF4444" : undefined} />
          </button>
        </div>
        <p className="text-[12.5px] text-[#7A7A7A] line-clamp-1 mt-0.5 leading-snug">{l.summary}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2.5 text-[11px] text-[#7A7A7A] font-bold">
            {(l.rating || 0) > 0 && (
              <span className="flex items-center gap-0.5"><Icon name="Star" size={11} color="#D4AF37" />{l.rating?.toFixed(1)}</span>
            )}
            <span className="flex items-center gap-0.5"><Icon name="Eye" size={11} />{l.views_count || 0}</span>
            <span className="flex items-center gap-0.5"><Icon name="ShoppingBag" size={11} />{l.purchases_count || 0}</span>
          </div>
          <PriceTag l={l} />
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ kind, onCreate }: { kind: MarketKind; onCreate: () => void }) {
  const m = KIND_META[kind];
  return (
    <div className="text-center py-16 px-6">
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 border border-[#C5A059]/25"
        style={{ background: `linear-gradient(135deg, ${m.accent}1F 0%, #F3F1EC 100%)`, color: m.accent }}
      >
        <Icon name={m.icon} size={26} />
      </motion.div>
      <h3 className="text-[18px] font-black tracking-tight serif italic text-[#202020]">Nothing here yet</h3>
      <p className="text-[13px] text-[#7A7A7A] mt-1 mb-5">Be the first to publish in {m.label}.</p>
      <Button onClick={onCreate}><Icon name="Plus" size={14} />Create listing</Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Similar Listings (internal component)                                      */
/* -------------------------------------------------------------------------- */

function SimilarListings({
  listingId,
  kind,
  category,
  onOpen,
}: {
  listingId: string;
  kind: MarketKind;
  category?: string | null;
  onOpen: (l: Listing) => void;
}) {
  const [similar, setSimilar] = useState<Listing[]>([]);
  const accent = KIND_META[kind].accent;

  useEffect(() => {
    let q = supabase
      .from("marketplace_listings")
      .select("*")
      .eq("kind", kind)
      .eq("status", "active")
      .neq("id", listingId)
      .limit(6);
    if (category) q = q.eq("category", category);
    q.then(({ data }) => setSimilar(data || []));
  }, [listingId, kind, category]);

  if (similar.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] mb-3">Similar listings</h4>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
        {similar.map((l) => (
          <motion.button
            key={l.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => onOpen(l)}
            className="shrink-0 w-[160px] p-3 rounded-2xl bg-white border border-black/[0.05] text-left"
          >
            <div
              className="w-full h-[80px] rounded-xl overflow-hidden mb-2"
              style={{ background: `linear-gradient(135deg, ${accent}1F 0%, #F3F1EC 100%)` }}
            >
              {l.cover_url ? (
                <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ color: accent }}>
                  <Icon name={KIND_META[l.kind].icon} size={20} />
                </div>
              )}
            </div>
            <p className="text-[12.5px] font-semibold tracking-tight text-[#1D1D1F] line-clamp-2 leading-snug">{l.title}</p>
            <p className="text-[11px] font-bold tracking-tight text-[#8C6A32] mt-1">{fmtCents(l.price_cents, l.currency || "USD")}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gallery Strip (internal component)                                         */
/* -------------------------------------------------------------------------- */

function GalleryStrip({ images }: { images: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!images || images.length === 0) return null;
  return (
    <>
      <div>
        <h4 className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] mb-2">Gallery</h4>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          {images.map((url, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.97 }}
              onClick={() => setLightbox(url)}
              className="shrink-0 w-[130px] h-[90px] rounded-xl overflow-hidden bg-[#F2F2F4]"
            >
              <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
            </motion.button>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-4"
          >
            <motion.img
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              src={lightbox}
              alt="Gallery"
              className="max-w-full max-h-full rounded-2xl object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Listing Detail Sheet                                                       */
/* -------------------------------------------------------------------------- */

type DetailTab = "overview" | "reviews" | "qa" | "versions" | "files" | "install" | "sandbox";

function ListingDetailSheet({
  listing: initialListing,
  onClose,
  currentUser,
  isFav,
  onFav,
  onListingUpdated,
  onOpenProfile,
}: {
  listing: Listing;
  onClose: () => void;
  currentUser?: any;
  isFav: boolean;
  onFav: () => void;
  onListingUpdated: () => void;
  onOpenProfile?: (userId: string) => void;
}) {
  const [listing, setListing] = useState(initialListing);
  const [seller, setSeller] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [purchasing, setPurchasing] = useState(false);
  const [sellerProfileOpen, setSellerProfileOpen] = useState(false);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [appliedAlready, setAppliedAlready] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [similarDetailOpen, setSimilarDetailOpen] = useState<Listing | null>(null);

  const isSeller = currentUser?.id === listing.seller_id;

  const fetchReviews = async () => {
    const { data } = await supabase
      .from("listing_reviews")
      .select("*, reviewer:reviewer_id(display_name, handle, avatar_url)")
      .eq("listing_id", listing.id)
      .order("helpful_count", { ascending: false })
      .order("created_at", { ascending: false });
    setReviews(data || []);
  };

  const fetchQuestions = async () => {
    const { data } = await supabase
      .from("listing_questions")
      .select("*, asker:asker_id(display_name, handle, avatar_url), answerer:answerer_id(display_name, handle, avatar_url)")
      .eq("listing_id", listing.id)
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: false });
    setQuestions(data || []);
  };

  useEffect(() => {
    supabase.from("users").select("*").eq("id", listing.seller_id).single().then(({ data }: any) => setSeller(data));
    fetchReviews();
    fetchQuestions();
    supabase.rpc("increment_listing_view", { _listing_id: listing.id }).then(() => {});

    if (listing.kind === "job" && currentUser?.id) {
      supabase
        .from("job_applications")
        .select("id")
        .eq("listing_id", listing.id)
        .eq("applicant_id", currentUser.id)
        .limit(1)
        .then(({ data }) => setAppliedAlready((data || []).length > 0));
    }
  }, [listing.id]);

  const isFree =
    listing.pricing_model === "free" ||
    listing.pricing_model === "open_source" ||
    listing.price_cents === 0;

  const handleBuyClick = () => {
    if (!currentUser?.id) return void toast.error("Sign in to continue");
    if (currentUser.id === listing.seller_id) return void toast.error("You own this listing");
    if (listing.kind === "job") return setShowApplyForm(true);
    setPaymentConfirmOpen(true);
  };

  // Available tabs
  const availableTabs: DetailTab[] = ["overview", "reviews", "qa"];
  if (listing.kind === "product" || listing.kind === "project") {
    availableTabs.push("versions");
  }
  if (listing.kind === "product") {
    availableTabs.push("files");
  }
  if (listing.installation_guide || isSeller) {
    availableTabs.push("install");
  }
  if ((listing as any).sandbox_zip_url || (listing as any).sandbox_config) {
    availableTabs.push("sandbox");
  }

  const TAB_LABELS: Record<DetailTab, string> = {
    overview: "Overview",
    reviews: `Reviews${reviews.length > 0 ? ` (${reviews.length})` : ""}`,
    qa: "Q&A",
    versions: "Versions",
    files: "Files",
    install: "Install",
    sandbox: "⚡ Forge",
  };

  const action = (() => {
    switch (listing.kind) {
      case "job":
        return { label: appliedAlready ? "Applied ✓" : "Apply for role", icon: "Send" };
      case "code_review":
        return { label: "Request Review", icon: "GitPullRequest" };
      case "service":
        return { label: "Hire", icon: "Briefcase" };
      case "project":
        return { label: "Make offer", icon: "Handshake" };
      default:
        if (listing.pricing_model === "free" || listing.pricing_model === "open_source")
          return { label: "Get it free", icon: "Download" };
        if (listing.pricing_model === "rent") return { label: "Rent now", icon: "Clock" };
        if (listing.pricing_model === "subscription") return { label: "Subscribe", icon: "Repeat" };
        return { label: "Buy now", icon: "ShoppingCart" };
    }
  })();

  const shareListing = async () => {
    const text = `${listing.title} — ${listing.summary || ""}`;
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: listing.title, text, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.success("Link copied!");
    }
  };

  const ctaAmountCents = selectedPackage?.price_cents ?? undefined;

  return (
    <>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="absolute inset-0 z-[100] bg-[#F5F5F7] flex flex-col"
      >
        <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
          <button onClick={onClose} className="text-[#0A84FF] tap-scale flex items-center text-[15px] tracking-tight">
            <Icon name="ChevronLeft" size={22} />
            <span className="-ml-1">Back</span>
          </button>
          <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">{KIND_META[listing.kind].label}</span>
          <div className="flex items-center gap-1">
            <button onClick={shareListing} className="text-[#1D1D1F] tap-scale w-9 h-9 flex items-center justify-center">
              <Icon name="Share2" size={18} />
            </button>
            <button onClick={onFav} className="text-[#1D1D1F] tap-scale w-9 h-9 flex items-center justify-center">
              <Icon name="Heart" size={20} color={isFav ? "#FF3B30" : undefined} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Cover */}
          <div className="h-52 bg-gradient-to-br from-[#F2F2F4] to-[#E8E8ED] relative">
            {listing.cover_url ? (
              <img src={listing.cover_url} alt={listing.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#C7C7CC]">
                <Icon name={KIND_META[listing.kind].icon} size={56} />
              </div>
            )}
          </div>

          <div className="px-5 pt-5 pb-32">
            {listing.category && (
              <p className="text-[12px] font-medium tracking-tight text-[#86868B] capitalize">
                {listing.category.replace("_", " ")}
              </p>
            )}
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] mt-1 leading-tight text-[#1D1D1F]">{listing.title}</h1>
            {listing.summary && (
              <p className="text-[15px] text-[#6E6E73] mt-2 leading-relaxed tracking-tight">{listing.summary}</p>
            )}

            {/* Stats */}
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[
                { k: "Views", v: listing.views_count || 0, icon: "Eye" },
                { k: "Saves", v: listing.favorites_count || 0, icon: "Heart" },
                { k: "Sold", v: listing.purchases_count || 0, icon: "ShoppingBag" },
                { k: "Rating", v: (listing.rating || 0) > 0 ? (listing.rating || 0).toFixed(1) : "—", icon: "Star" },
              ].map((s) => (
                <div key={s.k} className="bg-white rounded-2xl p-2.5 border border-black/[0.04]">
                  <div className="text-[17px] font-semibold tracking-tight text-[#1D1D1F]">{s.v}</div>
                  <div className="text-[10.5px] font-medium tracking-tight text-[#86868B] mt-0.5">{s.k}</div>
                </div>
              ))}
            </div>

            {/* Seller card */}
            {seller && (
              <div className="mt-4 p-3 flex items-center gap-3 rounded-2xl bg-white border border-black/[0.05]">
                <Avatar src={seller.avatar_url} seed={seller.id} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[14.5px] font-semibold tracking-tight text-[#1D1D1F] truncate">
                      {seller.display_name || seller.handle || "Seller"}
                    </p>
                    {listing.is_verified && <Icon name="BadgeCheck" size={14} color="#0A84FF" />}
                  </div>
                  <p className="text-[12px] font-medium text-[#86868B] tracking-tight">
                    @{seller.handle || seller.username || "anon"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setSellerProfileOpen(true)}>
                    Profile
                  </Button>
                  {isSeller && listing.kind === "job" && (
                    <Button variant="outline" size="sm" onClick={() => setPipelineOpen(true)}>
                      <Icon name="Users" size={12} />
                    </Button>
                  )}
                  {isSeller && (
                    <Button variant="outline" size="sm" onClick={() => setCompanyProfileOpen(true)}>
                      <Icon name="Building2" size={12} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Service packages for service kind */}
            {listing.kind === "service" && (
              <div className="mt-5">
                <h4 className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] mb-3">Packages</h4>
                <ServicePackages
                  listingId={listing.id}
                  sellerId={listing.seller_id}
                  currentUser={currentUser}
                  onSelect={(pkg: any) => setSelectedPackage(pkg)}
                />
              </div>
            )}

            {/* Tabs */}
            <LayoutGroup id="mk-detail">
              <div className="mt-6 flex gap-0 border-b border-black/[0.06] overflow-x-auto no-scrollbar">
                {availableTabs.map((t) => {
                  const active = tab === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className="relative px-3.5 py-2.5 text-[13px] font-medium tracking-tight shrink-0"
                    >
                      <span className={active ? "text-[#1D1D1F] font-semibold" : "text-[#86868B]"}>
                        {TAB_LABELS[t]}
                      </span>
                      {active && (
                        <motion.span
                          layoutId="mk-detail-line"
                          className="absolute left-2 right-2 -bottom-px h-[2px] bg-[#1D1D1F] rounded-full"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>

            {/* Overview tab */}
            {tab === "overview" && (
              <div className="mt-5 space-y-5">
                {/* Video player */}
                {(listing.demo_video_url || listing.video_storage_path) && (
                  <VideoPlayer
                    url={listing.demo_video_url}
                    storagePath={listing.video_storage_path}
                  />
                )}

                {/* Gallery */}
                {listing.gallery && listing.gallery.length > 0 && (
                  <GalleryStrip images={listing.gallery} />
                )}

                {listing.description && (
                  <p className="text-[15px] text-[#1D1D1F] leading-relaxed whitespace-pre-line tracking-tight">
                    {listing.description}
                  </p>
                )}

                {listing.features && listing.features.length > 0 && (
                  <div>
                    <h4 className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] mb-2">Features</h4>
                    <ul className="space-y-2">
                      {listing.features.map((f, i) => (
                        <li key={i} className="flex gap-2.5 text-[14px] text-[#1D1D1F] tracking-tight">
                          <Icon name="Check" size={15} color="#34C759" className="mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {listing.tech_stack && listing.tech_stack.length > 0 && (
                  <div>
                    <h4 className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] mb-2">Tech Stack</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {listing.tech_stack.map((t) => (
                        <span key={t} className="px-2.5 py-1 rounded-full bg-white border border-black/[0.06] text-[12px] font-medium tracking-tight text-[#1D1D1F]">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {listing.demo_url && (
                    <a href={listing.demo_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-white border border-black/[0.06] text-[13.5px] font-medium tracking-tight text-[#1D1D1F] hover:bg-[#F2F2F4]">
                      <Icon name="ExternalLink" size={13} /> Live demo
                    </a>
                  )}
                  {listing.github_url && (
                    <a href={listing.github_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-white border border-black/[0.06] text-[13.5px] font-medium tracking-tight text-[#1D1D1F] hover:bg-[#F2F2F4]">
                      <Icon name="Github" size={13} /> Repository
                    </a>
                  )}
                  {listing.documentation_url && (
                    <a href={listing.documentation_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-white border border-black/[0.06] text-[13.5px] font-medium tracking-tight text-[#1D1D1F] hover:bg-[#F2F2F4]">
                      <Icon name="BookOpen" size={13} /> Docs
                    </a>
                  )}
                </div>

                {listing.license && (
                  <div className="text-[12.5px] text-[#86868B] font-medium tracking-tight">
                    License · <span className="text-[#1D1D1F]">{listing.license}</span>
                  </div>
                )}

                {listing.tags && listing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {listing.tags.map((t) => (
                      <span key={t} className="text-[12px] font-medium text-[#86868B] tracking-tight">#{t}</span>
                    ))}
                  </div>
                )}

                {/* Job apply form */}
                {listing.kind === "job" && showApplyForm && currentUser?.id && !appliedAlready && (
                  <div className="p-4 rounded-2xl bg-white border border-black/[0.05]">
                    <h4 className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight mb-3">Apply for this role</h4>
                    <ApplyForm
                      listingId={listing.id}
                      currentUser={currentUser}
                      onApplied={() => { setAppliedAlready(true); setShowApplyForm(false); }}
                    />
                  </div>
                )}

                {/* Similar listings */}
                <SimilarListings
                  listingId={listing.id}
                  kind={listing.kind}
                  category={listing.category}
                  onOpen={(l) => setSimilarDetailOpen(l)}
                />
              </div>
            )}

            {/* Reviews tab */}
            {tab === "reviews" && (
              <ReviewsTab
                listingId={listing.id}
                sellerId={listing.seller_id}
                reviews={reviews}
                currentUser={currentUser}
                onRefresh={fetchReviews}
              />
            )}

            {/* Q&A tab */}
            {tab === "qa" && (
              <QATab
                listingId={listing.id}
                sellerId={listing.seller_id}
                questions={questions}
                currentUser={currentUser}
                onRefresh={fetchQuestions}
              />
            )}

            {/* Versions tab */}
            {tab === "versions" && (
              <VersionHistoryTab
                listingId={listing.id}
                sellerId={listing.seller_id}
                currentUser={currentUser}
              />
            )}

            {/* Files tab */}
            {tab === "files" && (
              <ProductFilesTab
                listingId={listing.id}
                sellerId={listing.seller_id}
                currentUser={currentUser}
              />
            )}

            {/* Install tab */}
            {tab === "install" && (
              <InstallGuideTab
                listingId={listing.id}
                sellerId={listing.seller_id}
                installationGuide={listing.installation_guide}
                requirements={listing.requirements}
                similarTech={listing.similar_tech}
                currentUser={currentUser}
                onUpdated={onListingUpdated}
              />
            )}

            {/* Sandbox tab */}
            {tab === "sandbox" && (
              <ListingSandboxTab listing={listing} />
            )}
          </div>
        </div>

        {/* CTA bar */}
        <div className="border-t border-black/[0.06] bg-white/95 backdrop-blur-xl p-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col">
            <PriceTag l={listing} overrideCents={selectedPackage?.price_cents} />
            {selectedPackage && (
              <span className="text-[10.5px] text-[#86868B] font-medium tracking-tight">{selectedPackage.name}</span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {isSeller && (
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F2F2F4] text-[13px] font-semibold tracking-tight text-[#1D1D1F]"
              >
                <Icon name="Pencil" size={13} />
                Edit
              </button>
            )}
            {!isSeller && (
              <Button
                onClick={handleBuyClick}
                className="flex-1 max-w-[200px]"
                disabled={purchasing || (listing.kind === "job" && appliedAlready)}
              >
                <Icon name={action.icon as any} size={14} />
                {purchasing ? "Processing…" : action.label}
              </Button>
            )}
          </div>
        </div>

        {/* Nested sheets */}
        <AnimatePresence>
          {sellerProfileOpen && (
            <SellerProfileSheet
              sellerId={listing.seller_id}
              onClose={() => setSellerProfileOpen(false)}
              currentUser={currentUser}
              onOpenProfile={onOpenProfile}
              onOpenListing={(id) => { setSellerProfileOpen(false); }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {companyProfileOpen && (
            <CompanyProfileSheet
              ownerId={listing.seller_id}
              onClose={() => setCompanyProfileOpen(false)}
              currentUser={currentUser}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {pipelineOpen && (
            <JobPipelineSheet
              listingId={listing.id}
              listingTitle={listing.title}
              sellerId={listing.seller_id}
              currentUser={currentUser}
              onClose={() => setPipelineOpen(false)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {editOpen && (
            <EditListingSheet
              listing={listing}
              currentUser={currentUser}
              onClose={() => setEditOpen(false)}
              onUpdated={() => {
                onListingUpdated();
                setEditOpen(false);
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {paymentConfirmOpen && (
            <PaymentModal
              listing={listing}
              seller={seller}
              overrideAmountCents={selectedPackage?.price_cents}
              overrideLabel={selectedPackage?.name}
              currentUser={currentUser}
              onClose={() => setPaymentConfirmOpen(false)}
              onSuccess={() => {
                setPaymentConfirmOpen(false);
                toast.success(isFree ? "Acquired!" : "Order placed successfully");
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {similarDetailOpen && (
            <ListingDetailSheet
              listing={similarDetailOpen}
              onClose={() => setSimilarDetailOpen(null)}
              currentUser={currentUser}
              isFav={false}
              onFav={() => {}}
              onListingUpdated={onListingUpdated}
              onOpenProfile={onOpenProfile}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Create Listing Sheet                                                       */
/* -------------------------------------------------------------------------- */

function CreateListingSheet({
  kind,
  currentUser,
  onClose,
  onCreated,
}: {
  kind: MarketKind;
  currentUser?: any;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [demoUrl, setDemoUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [category, setCategory] = useState<string>(kind === "product" ? "application" : "");
  const [pricingModel, setPricingModel] = useState<string>(
    kind === "service" ? "hourly" : kind === "job" ? "free" : "sale",
  );
  const [price, setPrice] = useState("");
  const [techStack, setTechStack] = useState("");
  const [tags, setTags] = useState("");
  const [features, setFeatures] = useState("");
  const [license, setLicense] = useState("MIT");
  const [installGuide, setInstallGuide] = useState("");
  const [requirements, setRequirements] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoStoragePath, setVideoStoragePath] = useState("");
  const [sandboxZipUrl, setSandboxZipUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!currentUser?.id) return void toast.error("Sign in first");
    if (!title.trim()) return void toast.error("Title required");
    setSubmitting(true);
    const payload: any = {
      seller_id: currentUser.id,
      kind,
      category: category || null,
      title: title.trim(),
      summary: summary.trim() || null,
      description: description.trim() || null,
      cover_url: coverUrl.trim() || null,
      gallery: galleryUrls.filter(Boolean),
      demo_url: demoUrl.trim() || null,
      github_url: githubUrl.trim() || null,
      documentation_url: docUrl.trim() || null,
      demo_video_url: videoUrl.trim() || null,
      video_storage_path: videoStoragePath.trim() || null,
      sandbox_zip_url: sandboxZipUrl.trim() || null,
      pricing_model: pricingModel,
      price_cents: Math.round((parseFloat(price) || 0) * 100),
      tech_stack: techStack ? techStack.split(",").map((s) => s.trim()).filter(Boolean) : [],
      tags: tags ? tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
      features: features ? features.split("\n").map((s) => s.trim()).filter(Boolean) : [],
      installation_guide: installGuide.trim() || null,
      requirements: requirements ? requirements.split("\n").map((s) => s.trim()).filter(Boolean) : [],
      license,
      status: "active",
    };
    const { error } = await supabase.from("marketplace_listings").insert(payload);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success("Listing published"); onCreated(); }
  };

  const m = KIND_META[kind];

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-[110] bg-[#F5F5F7] flex flex-col"
    >
      <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
        <button onClick={onClose} className="text-[#0A84FF] tap-scale w-10 h-10 flex items-center justify-center">
          <Icon name="X" size={22} />
        </button>
        <span className="text-[15px] font-semibold tracking-tight text-[#1D1D1F]">New {m.label}</span>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <style>{`.input { width:100%; background:#ffffff; border:1px solid rgba(0,0,0,0.06); padding:12px 14px; border-radius:14px; font-size:14px; font-weight:400; letter-spacing:-0.01em; color:#1D1D1F; outline:none; transition:box-shadow .15s, border-color .15s; }
        .input::placeholder { color:#86868B; }
        .input:focus { border-color: rgba(0,0,0,0.18); box-shadow: 0 0 0 4px rgba(0,0,0,0.04); }`}</style>

        <Field label="Title" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Notion-style SaaS starter" className="input" />
        </Field>
        <Field label="Short summary">
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line pitch" className="input" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="What it does, who it's for, what's included…" className="input min-h-[110px]" />
        </Field>
        {kind === "product" && (
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </Field>
        )}
        <Field label="Pricing model">
          <select value={pricingModel} onChange={(e) => setPricingModel(e.target.value)} className="input">
            {PRICING_MODELS.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
          </select>
        </Field>
        {pricingModel !== "free" && pricingModel !== "open_source" && (
          <Field label="Price (USD)">
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="99" className="input" />
          </Field>
        )}
        <Field label="Cover image">
          <ImageUploader
            bucket="forum-media"
            pathPrefix={`listings/new-${currentUser?.id}`}
            existingUrl={coverUrl || null}
            aspect="wide"
            label="Upload cover image"
            onUploaded={(url) => setCoverUrl(url)}
            onClear={() => setCoverUrl("")}
          />
        </Field>
        <Field label="Gallery images (up to 4)">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <ImageUploader
                key={i}
                bucket="forum-media"
                pathPrefix={`listings/gallery-${currentUser?.id}`}
                existingUrl={galleryUrls[i] || null}
                aspect="wide"
                label={`Image ${i + 1}`}
                onUploaded={(url) => {
                  setGalleryUrls((prev) => {
                    const next = [...prev];
                    next[i] = url;
                    return next;
                  });
                }}
                onClear={() => {
                  setGalleryUrls((prev) => {
                    const next = [...prev];
                    next[i] = "";
                    return next.filter(Boolean);
                  });
                }}
              />
            ))}
          </div>
        </Field>

        {/* Video upload */}
        <Field label="Demo video">
          {currentUser?.id ? (
            <VideoUploader
              currentUserId={currentUser.id}
              existingUrl={videoUrl}
              existingStoragePath={videoStoragePath}
              onUploaded={(url, path) => { setVideoUrl(url); setVideoStoragePath(path); }}
            />
          ) : (
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Video URL (YouTube, Loom, direct link)" className="input" />
          )}
        </Field>

        <Field label="Live demo URL">
          <input value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://demo.example.com" className="input" />
        </Field>
        <Field label="GitHub URL">
          <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/…" className="input" />
        </Field>
        <Field label="Documentation URL">
          <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://docs.example.com" className="input" />
        </Field>
        <Field label="⚡ Forge Sandbox (optional)">
          <SandboxZipUploader
            value={sandboxZipUrl}
            onChange={setSandboxZipUrl}
            userId={currentUser?.id}
            pathPrefix="marketplace"
            hint="Buyers can run your project live in the browser before purchasing"
          />
        </Field>
        <Field label="Tech stack (comma-separated)">
          <input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, TypeScript, Postgres" className="input" />
        </Field>
        <Field label="Features (one per line)">
          <textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={3} placeholder={"Auth included\nStripe billing\nDocs"} className="input min-h-[80px]" />
        </Field>
        <Field label="Tags (comma-separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ai, productivity, b2b" className="input" />
        </Field>
        {(kind === "product" || kind === "project") && (
          <>
            <Field label="Requirements (one per line)">
              <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} placeholder={"Node.js 18+\nPostgreSQL 14+"} className="input min-h-[80px]" />
            </Field>
            <Field label="Installation guide (Markdown)">
              <textarea value={installGuide} onChange={(e) => setInstallGuide(e.target.value)} rows={5} placeholder={"## Quick Start\n\n```bash\nnpm install\nnpm run dev\n```"} className="input min-h-[110px] font-mono text-[13px]" />
            </Field>
          </>
        )}
        <Field label="License">
          <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="MIT, Commercial, etc." className="input" />
        </Field>
      </div>

      <div className="border-t border-black/[0.06] bg-white/95 backdrop-blur-xl p-4 shrink-0">
        <Button onClick={submit} disabled={submitting} className="w-full">
          <Icon name="Sparkles" size={14} />
          {submitting ? "Publishing…" : "Publish listing"}
        </Button>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Listing Sandbox Tab                                                        */
/* -------------------------------------------------------------------------- */

function ListingSandboxTab({ listing }: { listing: any }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-5 py-6 flex flex-col items-center gap-4 text-center">
      <span className="text-5xl">⚡</span>
      <div>
        <p className="text-[16px] font-black tracking-tight text-[#1D1D1F] mb-1">Try it in Forge</p>
        <p className="text-[13px] text-[#86868B] leading-relaxed">
          Open an interactive sandbox with the full source code for this listing.
          Edit files, run scripts, and see changes live.
        </p>
      </div>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#202020] text-white text-[12px] font-black uppercase tracking-widest hover:bg-[#333] transition-colors"
      >
        <span>⚡</span> Launch Forge
      </button>
      <p className="text-[11px] text-[#B0B0B5]">
        100% client-side • your code never leaves the browser
      </p>
      <Suspense fallback={null}>
        <SandboxIDE
          open={open}
          onClose={() => setOpen(false)}
          namespace={`listing-${listing.id}`}
          initialZipUrl={(listing as any).sandbox_zip_url}
          title={listing.title}
        />
      </Suspense>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium tracking-tight text-[#1D1D1F] mb-1.5 block">
        {label} {required && <span className="text-[#FF3B30]">*</span>}
      </span>
      {children}
    </label>
  );
}
