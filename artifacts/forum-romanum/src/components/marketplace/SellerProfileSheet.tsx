import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, Skeleton, cn } from "../UI";
import { toast } from "sonner";

type SellerStats = {
  total_listings: number;
  active_listings: number;
  total_revenue: number;
  total_purchases: number;
  avg_rating: number | null;
  total_reviews: number;
  total_views: number;
};

type Props = {
  sellerId: string;
  onClose: () => void;
  currentUser?: any;
  onOpenProfile?: (userId: string) => void;
  onOpenListing?: (listingId: string) => void;
};

const fmtCents = (c?: number | null) => {
  if (!c) return "$0";
  const v = c / 100;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

function StatTile({
  label,
  value,
  icon,
  color = "#0A84FF",
}: {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-black/[0.04] flex flex-col gap-1">
      <div
        className="w-7 h-7 rounded-xl flex items-center justify-center"
        style={{ background: `${color}18` }}
      >
        <Icon name={icon as any} size={13} color={color} />
      </div>
      <div className="text-[20px] font-semibold tracking-tight text-[#1D1D1F]">{value}</div>
      <div className="text-[10.5px] font-medium tracking-tight text-[#86868B]">{label}</div>
    </div>
  );
}

export function SellerProfileSheet({ sellerId, onClose, currentUser, onOpenProfile, onOpenListing }: Props) {
  const [seller, setSeller] = useState<any>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [tab, setTab] = useState<"about" | "products" | "reviews" | "stats">("about");
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [userRes, statsRes, listingsRes, reviewsRes, companyRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", sellerId).single(),
        supabase.rpc("get_seller_stats", { p_seller_id: sellerId }),
        supabase
          .from("marketplace_listings")
          .select("*")
          .eq("seller_id", sellerId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("listing_reviews")
          .select("*")
          .in(
            "listing_id",
            (
              await supabase
                .from("marketplace_listings")
                .select("id")
                .eq("seller_id", sellerId)
            ).data?.map((l: any) => l.id) || [],
          )
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("company_profiles")
          .select("*")
          .eq("owner_id", sellerId)
          .single(),
      ]);

      setSeller(userRes.data);
      setStats(statsRes.data as SellerStats);
      setListings(listingsRes.data || []);
      setReviews(reviewsRes.data || []);
      setCompany(companyRes.data);
      setLoading(false);
    };
    load();
  }, [sellerId]);

  const avgRatingDisplay = stats?.avg_rating != null
    ? Number(stats.avg_rating).toFixed(1)
    : "—";

  const TABS = ["about", "products", "reviews", "stats"] as const;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 200 }}
      className="absolute inset-0 z-[120] bg-[#F5F5F7] flex flex-col"
    >
      {/* Header */}
      <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
        <button
          onClick={onClose}
          className="text-[#0A84FF] tap-scale flex items-center text-[15px] tracking-tight"
        >
          <Icon name="ChevronLeft" size={22} />
          <span className="-ml-1">Back</span>
        </button>
        <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">
          Seller Profile
        </span>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            <Skeleton height={120} rounded={16} />
            <Skeleton height={80} rounded={14} />
            <Skeleton height={200} rounded={14} />
          </div>
        ) : (
          <>
            {/* Banner / Hero */}
            <div className="h-28 bg-gradient-to-br from-[#1D1D1F] to-[#3A3A3C] relative">
              {company?.banner_url && (
                <img
                  src={company.banner_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>

            {/* Avatar + Identity */}
            <div className="px-5 pb-4 -mt-10 relative">
              <div className="flex items-end justify-between">
                <div className="ring-4 ring-[#F5F5F7] rounded-full">
                  <Avatar src={seller?.avatar_url} seed={sellerId} size={76} />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  {onOpenProfile && (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={() => { onClose(); onOpenProfile(sellerId); }}
                    >
                      <Icon name="User" size={13} />
                      Full Profile
                    </Button>
                  )}
                  {currentUser?.id !== sellerId && (
                    <Button variant="outline" size="sm">
                      <Icon name="MessageSquare" size={13} />
                      Message
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-[#1D1D1F]">
                    {seller?.display_name || seller?.handle || "Seller"}
                  </h1>
                  {seller?.verified && (
                    <Icon name="BadgeCheck" size={18} color="#0A84FF" />
                  )}
                </div>
                <p className="text-[14px] text-[#86868B] font-medium tracking-tight mt-0.5">
                  @{seller?.handle || seller?.username || "anon"}
                </p>
                {company && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {company.logo_url && (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="w-4 h-4 rounded object-cover"
                      />
                    )}
                    <p className="text-[12.5px] font-medium text-[#86868B] tracking-tight">
                      {company.name}
                      {company.stage && (
                        <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-[#0A84FF]/10 text-[#0A84FF] font-semibold">
                          {company.stage}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick stats row */}
              {stats && (
                <div className="flex gap-4 mt-4 p-3 rounded-2xl bg-white border border-black/[0.05]">
                  {[
                    { label: "Products", value: stats.active_listings },
                    { label: "Sales", value: stats.total_purchases },
                    {
                      label: "Rating",
                      value: avgRatingDisplay,
                    },
                    { label: "Reviews", value: stats.total_reviews },
                  ].map((s) => (
                    <div key={s.label} className="flex-1 text-center">
                      <div className="text-[17px] font-semibold tracking-tight text-[#1D1D1F]">
                        {s.value}
                      </div>
                      <div className="text-[10.5px] font-medium text-[#86868B] tracking-tight mt-0.5">
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="sticky top-0 z-10 bg-[#F5F5F7]/90 backdrop-blur-xl">
              <div className="flex border-b border-black/[0.06] px-5">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "relative px-3 py-2.5 text-[13px] font-medium tracking-tight capitalize",
                      tab === t
                        ? "text-[#1D1D1F] font-semibold"
                        : "text-[#86868B]",
                    )}
                  >
                    {t}
                    {tab === t && (
                      <span className="absolute left-1 right-1 -bottom-px h-[2px] bg-[#1D1D1F] rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 pb-32 pt-4">
              {/* About tab */}
              {tab === "about" && (
                <div className="space-y-4">
                  {seller?.bio && (
                    <div className="p-4 rounded-2xl bg-white border border-black/[0.05]">
                      <h3 className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-2">
                        About
                      </h3>
                      <p className="text-[14px] text-[#1D1D1F] tracking-tight leading-relaxed">
                        {seller.bio}
                      </p>
                    </div>
                  )}
                  {/* Links */}
                  <div className="space-y-2">
                    {seller?.website && (
                      <a
                        href={seller.website}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-black/[0.05] text-[14px] font-medium tracking-tight text-[#1D1D1F]"
                      >
                        <Icon name="Globe" size={16} color="#0A84FF" />
                        {seller.website.replace(/^https?:\/\//, "")}
                        <Icon name="ExternalLink" size={12} color="#86868B" className="ml-auto" />
                      </a>
                    )}
                    {seller?.github_username && (
                      <a
                        href={`https://github.com/${seller.github_username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-black/[0.05] text-[14px] font-medium tracking-tight text-[#1D1D1F]"
                      >
                        <Icon name="Github" size={16} />
                        @{seller.github_username}
                        <Icon name="ExternalLink" size={12} color="#86868B" className="ml-auto" />
                      </a>
                    )}
                    {seller?.twitter_username && (
                      <a
                        href={`https://twitter.com/${seller.twitter_username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-black/[0.05] text-[14px] font-medium tracking-tight text-[#1D1D1F]"
                      >
                        <Icon name="Twitter" size={16} color="#1DA1F2" />
                        @{seller.twitter_username}
                        <Icon name="ExternalLink" size={12} color="#86868B" className="ml-auto" />
                      </a>
                    )}
                  </div>
                  {company && (
                    <div className="p-4 rounded-2xl bg-white border border-black/[0.05] space-y-2">
                      <h3 className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-2">
                        Company
                      </h3>
                      {[
                        { label: "Industry", value: company.industry },
                        { label: "Team size", value: company.team_size },
                        { label: "Founded", value: company.founded_year },
                        { label: "Location", value: company.location },
                        { label: "Stage", value: company.stage },
                      ]
                        .filter((r) => r.value)
                        .map((r) => (
                          <div key={r.label} className="flex justify-between">
                            <span className="text-[13px] text-[#86868B] tracking-tight">
                              {r.label}
                            </span>
                            <span className="text-[13px] font-medium text-[#1D1D1F] tracking-tight">
                              {r.value}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                  {!seller?.bio && !company && (
                    <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
                      No profile info yet.
                    </p>
                  )}
                </div>
              )}

              {/* Products tab */}
              {tab === "products" && (
                <div className="space-y-2.5">
                  {listings.length === 0 ? (
                    <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
                      No active listings.
                    </p>
                  ) : (
                    listings.map((l: any) => (
                      <div
                        key={l.id}
                        className="p-3 flex gap-3 rounded-2xl bg-white border border-black/[0.05] cursor-pointer active:scale-[0.98] transition-transform"
                        onClick={() => onOpenListing?.(l.id)}
                      >
                        <div className="w-[52px] h-[52px] rounded-xl bg-[#F5F5F7] overflow-hidden shrink-0">
                          {l.cover_url ? (
                            <img
                              src={l.cover_url}
                              alt={l.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#86868B]">
                              <Icon name="Package" size={18} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-semibold tracking-tight text-[#1D1D1F] truncate">
                            {l.title}
                          </p>
                          <p className="text-[12px] text-[#86868B] tracking-tight mt-0.5 line-clamp-1">
                            {l.summary}
                          </p>
                          <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-[#86868B] font-medium">
                            {l.rating > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Icon name="Star" size={10} color="#FFB100" />
                                {l.rating?.toFixed(1)}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5">
                              <Icon name="ShoppingBag" size={10} />
                              {l.purchases_count || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Reviews tab */}
              {tab === "reviews" && (
                <div className="space-y-3">
                  {reviews.length === 0 ? (
                    <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
                      No reviews yet.
                    </p>
                  ) : (
                    reviews.map((r: any) => (
                      <div
                        key={r.id}
                        className="p-3.5 rounded-2xl bg-white border border-black/[0.05] space-y-2"
                      >
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Icon
                              key={i}
                              name="Star"
                              size={12}
                              color={i < r.rating ? "#FFB100" : "#E5E5EA"}
                            />
                          ))}
                          {r.is_verified_purchase && (
                            <span className="ml-2 text-[10px] font-semibold text-emerald-700 tracking-tight">
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="text-[13.5px] text-[#1D1D1F] tracking-tight leading-relaxed">
                          {r.body}
                        </p>
                        <p className="text-[11px] text-[#86868B] tracking-tight">
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Stats tab */}
              {tab === "stats" && stats && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatTile
                      label="Active Listings"
                      value={stats.active_listings}
                      icon="Package"
                      color="#0A84FF"
                    />
                    <StatTile
                      label="Total Sales"
                      value={stats.total_purchases}
                      icon="ShoppingBag"
                      color="#34C759"
                    />
                    <StatTile
                      label="Total Revenue"
                      value={fmtCents(stats.total_revenue)}
                      icon="DollarSign"
                      color="#FF9F0A"
                    />
                    <StatTile
                      label="Avg Rating"
                      value={
                        stats.avg_rating != null
                          ? Number(stats.avg_rating).toFixed(1)
                          : "—"
                      }
                      icon="Star"
                      color="#FFB100"
                    />
                    <StatTile
                      label="Reviews"
                      value={stats.total_reviews}
                      icon="MessageSquare"
                      color="#8B5CF6"
                    />
                    <StatTile
                      label="Total Views"
                      value={
                        (stats.total_views || 0) >= 1000
                          ? `${((stats.total_views || 0) / 1000).toFixed(1)}k`
                          : stats.total_views || 0
                      }
                      icon="Eye"
                      color="#EF4444"
                    />
                  </div>

                  {/* Rank badge */}
                  <div className="p-4 rounded-2xl bg-white border border-black/[0.05] flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFB100] to-[#FF9F0A] flex items-center justify-center">
                      <Icon name="Trophy" size={22} color="white" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold tracking-tight text-[#1D1D1F]">
                        {stats.total_purchases >= 100
                          ? "Top Seller"
                          : stats.total_purchases >= 10
                            ? "Rising Seller"
                            : "New Seller"}
                      </p>
                      <p className="text-[12.5px] text-[#86868B] tracking-tight">
                        {stats.total_purchases >= 100
                          ? "100+ completed sales"
                          : stats.total_purchases >= 10
                            ? "10+ completed sales"
                            : "Getting started"}
                      </p>
                    </div>
                    {seller?.verified && (
                      <div className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-[#0A84FF] tracking-tight">
                        <Icon name="BadgeCheck" size={14} color="#0A84FF" />
                        Verified
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
