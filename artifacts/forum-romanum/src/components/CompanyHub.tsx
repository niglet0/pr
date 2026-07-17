import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Avatar, Button, Card, Icon, Skeleton, cn } from "./UI";

const ACCENT = "#C5A059";

function timeAgo(d: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Tab = "feed" | "products" | "members" | "about" | "analytics" | "workspace";

const HIRING_STAGES: { id: string; label: string; color: string }[] = [
  { id: "applied",   label: "Applied",   color: "#7A7A7A" },
  { id: "review",    label: "Review",    color: "#8B5CF6" },
  { id: "interview", label: "Interview", color: "#0A84FF" },
  { id: "offer",     label: "Offer",     color: "#F59E0B" },
  { id: "hired",     label: "Hired",     color: "#10B981" },
  { id: "rejected",  label: "Rejected",  color: "#EF4444" },
];

type Props = {
  companyId?: string;
  companySlug?: string;
  currentUser?: any;
  onClose: () => void;
  onOpenProduct?: (listingId: string) => void;
  onOpenProfile?: (userId: string) => void;
};

export function CompanyHub({ companyId, companySlug, currentUser, onClose, onOpenProduct, onOpenProfile }: Props) {
  const [company, setCompany]   = useState<any>(null);
  const [tab, setTab]           = useState<Tab>("feed");
  const [loading, setLoading]   = useState(true);
  const [posts, setPosts]       = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // workspace
  const [wsSubTab, setWsSubTab] = useState<"hiring" | "treasury" | "ops">("hiring");
  const [wsLoading, setWsLoading] = useState(false);
  const [applications, setApplications] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [opsLog, setOpsLog] = useState<any[]>([]);
  const [appStage, setAppStage] = useState("applied");
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  // composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [posting, setPosting]           = useState(false);

  const isOwner = currentUser?.id && company?.owner_id === currentUser.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = supabase.from("company_profiles").select("*");
      const { data: co } = companyId
        ? await q.eq("id", companyId).single()
        : await q.eq("slug", companySlug!).single();
      if (!co) { setLoading(false); return; }
      setCompany(co);

      const [postsRes, listingsRes, membersRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id,content,image_url,created_at,likes_count,comments_count,author_entity_id,author_entity_type")
          .eq("author_entity_id", co.id)
          .eq("author_entity_type", "company")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("marketplace_listings")
          .select("id,title,cover_url,price_cents,kind,status,views_count,purchases_count,rating,reviews_count")
          .eq("seller_id", co.owner_id)
          .eq("status", "active")
          .order("views_count", { ascending: false })
          .limit(20),
        supabase
          .from("company_members")
          .select("id,user_id,role,title,joined_at,users(display_name,handle,avatar_url)")
          .eq("company_id", co.id)
          .limit(30),
      ]);
      setPosts(postsRes.data || []);
      setListings(listingsRes.data || []);
      setMembers(membersRes.data || []);

      if (currentUser) {
        const { data: fol } = await supabase
          .from("company_follows")
          .select("id")
          .eq("company_id", co.id)
          .eq("follower_id", currentUser.id)
          .single();
        setIsFollowing(!!fol);
      }
    } catch {}
    setLoading(false);
  }, [companyId, companySlug, currentUser]);

  useEffect(() => { load(); }, [load]);

  const loadWorkspace = useCallback(async () => {
    if (!company || !isOwner) return;
    setWsLoading(true);
    try {
      const { data: jobListings } = await supabase
        .from("marketplace_listings")
        .select("id, title")
        .eq("seller_id", company.owner_id);
      const listingIds = (jobListings || []).map((l: any) => l.id);
      const [appsRes, ordersRes, opsRes] = await Promise.all([
        listingIds.length > 0
          ? supabase.from("job_applications")
              .select("id, stage, cover_letter, created_at, listing_id, applicant_id, listing:listing_id(title)")
              .in("listing_id", listingIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        supabase.from("listing_orders")
          .select("id, amount_cents, order_type, status, created_at, listing_id")
          .eq("seller_id", company.owner_id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("company_ops_log")
          .select("id, kind, payload, created_at, actor_id")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      setApplications((appsRes as any).data || []);
      setOrders((ordersRes.data as any) || []);
      setOpsLog((opsRes.data as any) || []);
    } catch {}
    setWsLoading(false);
  }, [company, isOwner]);

  useEffect(() => {
    if (tab === "workspace") loadWorkspace();
  }, [tab, loadWorkspace]);

  const toggleFollow = async () => {
    if (!currentUser || !company) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from("company_follows").delete().eq("company_id", company.id).eq("follower_id", currentUser.id);
      setIsFollowing(false);
      setCompany((c: any) => ({ ...c, followers_count: Math.max(0, (c.followers_count || 1) - 1) }));
    } else {
      await supabase.from("company_follows").insert({ company_id: company.id, follower_id: currentUser.id });
      setIsFollowing(true);
      setCompany((c: any) => ({ ...c, followers_count: (c.followers_count || 0) + 1 }));
    }
    setFollowLoading(false);
  };

  const publishPost = async () => {
    if (!draftContent.trim() || !company) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: company.owner_id,
        author_entity_id: company.id,
        author_entity_type: "company",
        content: draftContent.trim(),
      })
      .select()
      .single();
    setPosting(false);
    if (!error && data) {
      setPosts((prev) => [data, ...prev]);
      setDraftContent("");
      setComposerOpen(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: string; ownerOnly?: boolean }[] = (
    [
      { id: "feed"      as Tab, label: "Feed",      icon: "Newspaper" },
      { id: "products"  as Tab, label: "Products",  icon: "Package"   },
      { id: "members"   as Tab, label: "Members",   icon: "Users"     },
      { id: "about"     as Tab, label: "About",     icon: "Info"      },
      { id: "analytics" as Tab, label: "Analytics", icon: "BarChart2", ownerOnly: true },
      { id: "workspace" as Tab, label: "Workspace", icon: "Briefcase", ownerOnly: true },
    ]
  ).filter((t) => !t.ownerOnly || isOwner);

  const totalRevenue = listings.reduce((s, l) => s + ((l.purchases_count || 0) * (l.price_cents || 0)), 0);

  if (loading) {
    return (
      <div className="absolute inset-0 bg-[#FAF9F6] flex flex-col z-[115]">
        <div className="h-14 border-b border-[#E5E3DB] flex items-center px-4 gap-3">
          <button onClick={onClose} className="p-2 hover:bg-[#E5E3DB] rounded-xl">
            <Icon name="ArrowLeft" size={18} />
          </button>
          <Skeleton width={160} height={14} />
        </div>
        <Skeleton width="100%" height={180} />
        <div className="p-4 space-y-3">
          <Skeleton width="60%" height={22} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="40%" height={14} />
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="absolute inset-0 bg-[#FAF9F6] flex flex-col items-center justify-center z-[115]">
        <Icon name="Building2" size={40} className="text-[#C5A059]/30 mb-3" />
        <p className="font-bold text-[#7A7A7A]">Company not found</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-[#E5E3DB] rounded-xl text-sm font-bold">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-[#FAF9F6] flex flex-col z-[115] overflow-hidden">
      {/* Header */}
      <header className="h-14 px-4 border-b border-[#E5E3DB] flex items-center gap-3 shrink-0 bg-[#FAF9F6]">
        <button onClick={onClose} className="p-2 hover:bg-[#E5E3DB] rounded-xl transition-colors">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{company.name}</p>
          <p className="text-[10px] text-[#7A7A7A] uppercase tracking-widest">@{company.slug}</p>
        </div>
        {currentUser && !isOwner && (
          <Button
            size="sm"
            variant={isFollowing ? "outline" : "gold"}
            onClick={toggleFollow}
            disabled={followLoading}
          >
            {isFollowing ? "Following" : "Follow"}
          </Button>
        )}
        {isOwner && (
          <Button size="sm" variant="gold" onClick={() => { setTab("feed"); setComposerOpen(true); }}>
            <Icon name="Plus" size={12} /> Post
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Banner */}
        <div className="relative w-full h-[140px] bg-gradient-to-br from-[#8B5CF6]/20 to-[#C5A059]/20 overflow-hidden">
          {company.banner_url && (
            <img src={company.banner_url} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* Company identity */}
        <div className="relative px-4 pb-4 border-b border-[#E5E3DB]">
          <div className="flex items-end gap-3 -mt-8 mb-3">
            <div className="w-[64px] h-[64px] rounded-2xl border-[3px] border-[#FAF9F6] bg-white overflow-hidden shrink-0 flex items-center justify-center shadow-md">
              {company.logo_url
                ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                : <span className="text-2xl font-black text-[#8B5CF6]">{company.name[0]}</span>
              }
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-black text-[18px] text-[#202020] leading-tight">{company.name}</h2>
                {company.is_verified && <Icon name="BadgeCheck" size={16} className="text-[#C5A059]" />}
                {company.is_hiring && (
                  <span className="text-[9px] font-bold bg-[#10B981]/10 text-[#10B981] px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    Hiring
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#7A7A7A]">
                {company.industry || "Tech"}{company.location ? ` · ${company.location}` : ""}
                {company.stage ? ` · ${company.stage}` : ""}
              </p>
            </div>
          </div>

          {company.tagline && (
            <p className="text-[13px] text-[#202020] font-medium mb-3">{company.tagline}</p>
          )}
          {company.bio && !company.tagline && (
            <p className="text-[13px] text-[#7A7A7A] mb-3 line-clamp-2">{company.bio}</p>
          )}

          {/* Stats row */}
          <div className="flex gap-5 text-center">
            <div>
              <p className="text-[17px] font-black text-[#202020]">{(company.followers_count || 0).toLocaleString()}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">Followers</p>
            </div>
            <div>
              <p className="text-[17px] font-black text-[#202020]">{listings.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">Products</p>
            </div>
            <div>
              <p className="text-[17px] font-black text-[#202020]">{members.length || 1}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">Members</p>
            </div>
            {isOwner && (
              <div>
                <p className="text-[17px] font-black text-[#10B981]">${(totalRevenue / 100).toLocaleString()}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#10B981]/70">Revenue</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-0 z-10 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E5E3DB] flex overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest shrink-0 transition-colors border-b-2",
                tab === t.id
                  ? "text-[#C5A059] border-[#C5A059]"
                  : "text-[#7A7A7A] border-transparent hover:text-[#202020]"
              )}
            >
              <Icon name={t.icon as any} size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 space-y-3 pb-24">

          {/* ── Feed tab ───────────────────────────────────────────── */}
          {tab === "feed" && (
            <>
              {/* Post composer (owner only) */}
              <AnimatePresence>
                {composerOpen && isOwner && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Card className="p-4 bg-white rounded-2xl">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center overflow-hidden">
                          {company.logo_url
                            ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" />
                            : <span className="font-black text-[#8B5CF6] text-sm">{company.name[0]}</span>
                          }
                        </div>
                        <span className="font-bold text-sm text-[#202020]">Post as {company.name}</span>
                      </div>
                      <textarea
                        className="w-full bg-[#F3F1EC] rounded-xl px-3 py-2.5 text-[13px] resize-none outline-none min-h-[88px] border border-transparent focus:border-[#C5A059]/40"
                        placeholder="Share an update, milestone, or announcement…"
                        value={draftContent}
                        onChange={(e) => setDraftContent(e.target.value)}
                        maxLength={800}
                      />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-[#7A7A7A]">{draftContent.length}/800</span>
                        <div className="flex gap-2">
                          <button onClick={() => setComposerOpen(false)} className="px-3 py-1.5 text-[11px] font-bold text-[#7A7A7A]">
                            Cancel
                          </button>
                          <button
                            onClick={publishPost}
                            disabled={posting || !draftContent.trim()}
                            className="px-4 py-1.5 bg-[#C5A059] text-white text-[11px] font-bold rounded-xl disabled:opacity-50"
                          >
                            {posting ? "Posting…" : "Publish"}
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {posts.length === 0 ? (
                <div className="py-12 text-center">
                  <Icon name="Newspaper" size={32} className="mx-auto mb-3 text-[#C5A059]/20" />
                  <p className="font-bold text-[#202020] text-sm">No posts yet</p>
                  {isOwner && (
                    <button onClick={() => setComposerOpen(true)} className="mt-3 text-[#C5A059] text-[12px] font-bold">
                      Write your first post →
                    </button>
                  )}
                </div>
              ) : (
                posts.map((p) => (
                  <Card key={p.id} className="p-4 bg-white rounded-2xl">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center overflow-hidden">
                        {company.logo_url
                          ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" />
                          : <span className="font-black text-[#8B5CF6] text-sm">{company.name[0]}</span>
                        }
                      </div>
                      <div>
                        <p className="font-bold text-[12px] text-[#202020]">{company.name}</p>
                        <p className="text-[10px] text-[#7A7A7A]">{timeAgo(p.created_at)}</p>
                      </div>
                      <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-[#8B5CF6] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded-full">
                        Announcement
                      </span>
                    </div>
                    <p className="text-[13px] text-[#202020] leading-relaxed">{p.content}</p>
                    {p.image_url && (
                      <img src={p.image_url} alt="" className="w-full rounded-xl mt-3 max-h-48 object-cover" />
                    )}
                    <div className="flex gap-4 mt-3 text-[11px] text-[#7A7A7A]">
                      <span className="flex items-center gap-1"><Icon name="Heart" size={11} />{p.likes_count || 0}</span>
                      <span className="flex items-center gap-1"><Icon name="MessageCircle" size={11} />{p.comments_count || 0}</span>
                    </div>
                  </Card>
                ))
              )}
            </>
          )}

          {/* ── Products tab ───────────────────────────────────────── */}
          {tab === "products" && (
            <>
              {listings.length === 0 ? (
                <div className="py-12 text-center">
                  <Icon name="Package" size={32} className="mx-auto mb-3 text-[#C5A059]/20" />
                  <p className="font-bold text-[#202020] text-sm">No products listed</p>
                  <p className="text-[12px] text-[#7A7A7A] mt-1">Add listings in the Marketplace to sell here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {listings.map((l) => (
                    <Card
                      key={l.id}
                      className="p-0 overflow-hidden rounded-2xl cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => onOpenProduct?.(l.id)}
                    >
                      <div className="aspect-square bg-[#F3F1EC] relative overflow-hidden">
                        {l.cover_url
                          ? <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <Icon name="Package" size={28} className="text-[#C5A059]/30" />
                            </div>
                        }
                        <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider bg-white/80 backdrop-blur-sm text-[#7A7A7A] px-1.5 py-0.5 rounded-full">
                          {l.kind}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="font-bold text-[12px] text-[#202020] line-clamp-2 leading-snug mb-1">{l.title}</p>
                        <div className="flex items-center justify-between">
                          <p className="font-black text-[#C5A059] text-[14px]">${((l.price_cents || 0) / 100).toFixed(2)}</p>
                          {l.rating && (
                            <span className="text-[10px] text-[#7A7A7A] flex items-center gap-0.5">
                              <Icon name="Star" size={10} className="text-[#C5A059]" />
                              {l.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-[#7A7A7A]">
                          <span className="flex items-center gap-0.5"><Icon name="Eye" size={9} />{l.views_count || 0}</span>
                          <span className="flex items-center gap-0.5"><Icon name="Download" size={9} />{l.purchases_count || 0}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Members tab ────────────────────────────────────────── */}
          {tab === "members" && (
            <>
              {/* Owner always shown */}
              <Card
                className="p-3 bg-white rounded-2xl flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => company.owner_id && onOpenProfile?.(company.owner_id)}
              >
                <Avatar seed={company.owner_id} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-[#202020]">Founder</p>
                  <p className="text-[10px] text-[#7A7A7A]">@{company.slug}</p>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#C5A059] bg-[#C5A059]/10 px-2 py-1 rounded-full">
                  Owner
                </span>
                {onOpenProfile && <Icon name="ChevronRight" size={14} color="#7A7A7A" />}
              </Card>

              {members.map((m) => (
                <Card
                  key={m.id}
                  className="p-3 bg-white rounded-2xl flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => m.user_id && onOpenProfile?.(m.user_id)}
                >
                  <Avatar
                    seed={m.user_id}
                    src={(m as any).users?.avatar_url}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13px] text-[#202020] truncate">
                      {(m as any).users?.display_name || "Member"}
                    </p>
                    <p className="text-[10px] text-[#7A7A7A]">
                      {m.title || m.role} · joined {timeAgo(m.joined_at)} ago
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                      m.role === "admin" ? "text-[#8B5CF6] bg-[#8B5CF6]/10" :
                      m.role === "editor" ? "text-[#0A84FF] bg-[#0A84FF]/10" :
                      "text-[#7A7A7A] bg-[#F3F1EC]"
                    )}
                  >
                    {m.role}
                  </span>
                  {onOpenProfile && <Icon name="ChevronRight" size={14} color="#7A7A7A" />}
                </Card>
              ))}

              {members.length === 0 && (
                <div className="py-8 text-center">
                  <Icon name="Users" size={28} className="mx-auto mb-2 text-[#C5A059]/20" />
                  <p className="text-[12px] text-[#7A7A7A]">No team members yet. Invite from Company settings.</p>
                </div>
              )}
            </>
          )}

          {/* ── About tab ──────────────────────────────────────────── */}
          {tab === "about" && (
            <Card className="p-5 bg-white rounded-2xl space-y-4">
              {company.bio && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mb-1.5">About</p>
                  <p className="text-[13px] text-[#202020] leading-relaxed">{company.bio}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Industry",   value: company.industry    },
                  { label: "Stage",      value: company.stage       },
                  { label: "Team size",  value: company.team_size   },
                  { label: "Founded",    value: company.founded_year?.toString() },
                  { label: "Location",   value: company.location    },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="bg-[#F3F1EC] rounded-xl p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">{row.label}</p>
                    <p className="text-[13px] font-bold text-[#202020] mt-0.5">{row.value}</p>
                  </div>
                ))}
              </div>
              {(company.tags || []).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(company.tags as string[]).map((tag) => (
                      <span key={tag} className="text-[10px] font-bold text-[#C5A059] bg-[#C5A059]/10 px-2 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(company.website || company.twitter_url || company.linkedin_url || company.github_url) && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mb-2">Links</p>
                  <div className="space-y-2">
                    {[
                      { label: "Website",  url: company.website,      icon: "Globe"   },
                      { label: "Twitter",  url: company.twitter_url,  icon: "Twitter" },
                      { label: "LinkedIn", url: company.linkedin_url, icon: "Linkedin"},
                      { label: "GitHub",   url: company.github_url,   icon: "Github"  },
                    ].filter((l) => l.url).map((link) => (
                      <a
                        key={link.label}
                        href={link.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[13px] text-[#0A84FF] hover:underline"
                      >
                        <Icon name={link.icon as any} size={13} />
                        {link.url!.replace(/^https?:\/\//, "")}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Workspace tab (owner only) ──────────────────────────── */}
          {tab === "workspace" && isOwner && (
            <>
              {/* Sub-tab bar */}
              <div className="flex gap-1.5 mb-4">
                {(["hiring", "treasury", "ops"] as const).map((st) => {
                  const meta = { hiring: { icon: "Users2", label: "Hiring" }, treasury: { icon: "Coins", label: "Treasury" }, ops: { icon: "Activity", label: "Ops Log" } }[st];
                  return (
                    <button
                      key={st}
                      onClick={() => setWsSubTab(st)}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        wsSubTab === st ? "bg-[#202020] text-[#C5A059]" : "bg-[#F3F1EC] text-[#7A7A7A]"
                      )}
                    >
                      <Icon name={meta.icon as any} size={14} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              {wsLoading ? (
                <div className="space-y-3">
                  {[0,1,2].map((i) => (
                    <Card key={i} className="p-4">
                      <Skeleton width="60%" height={14} className="mb-2" />
                      <Skeleton width="100%" height={10} />
                    </Card>
                  ))}
                </div>
              ) : (
                <>
                  {wsSubTab === "hiring" && (
                    <HiringPipeline
                      applications={applications}
                      stage={appStage}
                      onStageChange={setAppStage}
                      advancingId={advancingId}
                      onAdvance={async (appId, newStage) => {
                        setAdvancingId(appId);
                        await supabase.from("job_applications").update({ stage: newStage }).eq("id", appId);
                        setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, stage: newStage } : a));
                        setAdvancingId(null);
                      }}
                    />
                  )}
                  {wsSubTab === "treasury" && (
                    <TreasuryLedger orders={orders} listings={listings} />
                  )}
                  {wsSubTab === "ops" && (
                    <OpsLogPanel opsLog={opsLog} members={members} company={company} />
                  )}
                </>
              )}
            </>
          )}

          {/* ── Analytics tab (owner only) ──────────────────────────── */}
          {tab === "analytics" && isOwner && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Followers",    value: (company.followers_count || 0).toLocaleString(), icon: "Users",    color: "#8B5CF6" },
                  { label: "Products",     value: listings.length.toString(),                       icon: "Package",  color: "#C5A059" },
                  { label: "Total Views",  value: listings.reduce((s, l) => s + (l.views_count || 0), 0).toLocaleString(), icon: "Eye", color: "#0A84FF" },
                  { label: "Total Sales",  value: listings.reduce((s, l) => s + (l.purchases_count || 0), 0).toString(),   icon: "ShoppingBag", color: "#10B981" },
                  { label: "Revenue",      value: `$${(totalRevenue / 100).toLocaleString()}`,      icon: "DollarSign", color: "#10B981" },
                  { label: "Avg Rating",   value: listings.filter((l) => l.rating).length > 0
                    ? (listings.reduce((s, l) => s + (l.rating || 0), 0) / listings.filter((l) => l.rating).length).toFixed(1)
                    : "—",                                                                           icon: "Star",     color: "#F59E0B" },
                ].map((stat) => (
                  <Card key={stat.label} className="p-3 bg-white rounded-2xl">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: stat.color + "18" }}>
                        <Icon name={stat.icon as any} size={13} color={stat.color} />
                      </div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">{stat.label}</p>
                    </div>
                    <p className="text-[22px] font-black text-[#202020] leading-none">{stat.value}</p>
                  </Card>
                ))}
              </div>

              {/* Top products */}
              {listings.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mt-2 mb-2">Top Products by Revenue</p>
                  {listings
                    .slice()
                    .sort((a, b) => (b.purchases_count * b.price_cents) - (a.purchases_count * a.price_cents))
                    .slice(0, 5)
                    .map((l, i) => (
                      <Card key={l.id} className="p-3 bg-white rounded-xl mb-2 flex items-center gap-3">
                        <span className="text-[13px] font-black text-[#7A7A7A] w-5 text-center">{i + 1}</span>
                        <div className="w-8 h-8 rounded-lg bg-[#F3F1EC] overflow-hidden shrink-0">
                          {l.cover_url
                            ? <img src={l.cover_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Icon name="Package" size={14} className="text-[#C5A059]/40" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[12px] truncate">{l.title}</p>
                          <p className="text-[10px] text-[#7A7A7A]">{l.purchases_count || 0} sales</p>
                        </div>
                        <p className="text-[13px] font-black text-[#10B981]">
                          ${((l.purchases_count || 0) * (l.price_cents || 0) / 100).toLocaleString()}
                        </p>
                      </Card>
                    ))
                  }
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── HiringPipeline ─────────────────────────────────────────────────── */

function HiringPipeline({
  applications, stage, onStageChange, onAdvance, advancingId,
}: {
  applications: any[];
  stage: string;
  onStageChange: (s: string) => void;
  onAdvance: (appId: string, newStage: string) => void;
  advancingId: string | null;
}) {
  const countByStage = HIRING_STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s.id] = applications.filter((a) => a.stage === s.id).length;
    return acc;
  }, {});
  const filtered = applications.filter((a) => a.stage === stage);
  const currentMeta = HIRING_STAGES.find((s) => s.id === stage)!;
  const nextStage = () => {
    const idx = HIRING_STAGES.findIndex((s) => s.id === stage);
    return idx >= 0 && idx < HIRING_STAGES.length - 2 ? HIRING_STAGES[idx + 1] : null;
  };
  const next = nextStage();

  return (
    <div className="space-y-3">
      {/* Stage chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {HIRING_STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => onStageChange(s.id)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all",
              stage === s.id
                ? "border-transparent text-white"
                : "bg-white border-[#E5E3DB] text-[#7A7A7A]"
            )}
            style={stage === s.id ? { background: s.color } : {}}
          >
            {s.label}
            <span
              className={cn(
                "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black",
                stage === s.id ? "bg-white/30 text-white" : "bg-[#F3F1EC] text-[#7A7A7A]"
              )}
            >
              {countByStage[s.id] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Pipeline progress bar */}
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-[#E5E3DB]">
        {HIRING_STAGES.filter((s) => s.id !== "rejected").map((s) => (
          <div
            key={s.id}
            className="h-full transition-all duration-300"
            style={{
              width: `${100 / (HIRING_STAGES.length - 1)}%`,
              background: countByStage[s.id] > 0 ? s.color : "transparent",
            }}
          />
        ))}
      </div>

      {/* Total + stage name */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-black text-[#202020]">{filtered.length} candidate{filtered.length !== 1 ? "s" : ""}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: currentMeta.color }}>
            {currentMeta.label} stage
          </p>
        </div>
        <span className="text-[10px] font-bold text-[#7A7A7A]">
          {applications.length} total applicants
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center">
          <Icon name="Users2" size={28} className="mx-auto mb-2 text-[#C5A059]/20" />
          <p className="text-[12px] font-bold text-[#7A7A7A]">No candidates in {currentMeta.label}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((app) => (
            <Card key={app.id} className="p-4 bg-white rounded-2xl">
              <div className="flex items-start gap-3">
                <Avatar seed={app.applicant_id} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-[#202020] truncate">
                    {(app.applicant as any)?.display_name || "Applicant"}
                  </p>
                  <p className="text-[10px] text-[#7A7A7A] mb-1 truncate">
                    {(app.listing as any)?.title || "Position"} · {timeAgo(app.created_at)} ago
                  </p>
                  {app.cover_letter && (
                    <p className="text-[11px] text-[#7A7A7A] line-clamp-2 leading-relaxed">{app.cover_letter}</p>
                  )}
                </div>
              </div>
              {stage !== "hired" && stage !== "rejected" && (
                <div className="flex gap-2 mt-3">
                  {next && (
                    <button
                      onClick={() => onAdvance(app.id, next.id)}
                      disabled={advancingId === app.id}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
                      style={{ background: next.color }}
                    >
                      {advancingId === app.id ? "…" : `→ ${next.label}`}
                    </button>
                  )}
                  <button
                    onClick={() => onAdvance(app.id, "rejected")}
                    disabled={advancingId === app.id}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[#EF4444]/10 text-[#EF4444] transition-all disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
              {(stage === "hired" || stage === "rejected") && (
                <div className="mt-2 text-center text-[10px] font-black uppercase tracking-widest"
                  style={{ color: currentMeta.color }}>
                  {currentMeta.label} ✓
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TreasuryLedger ─────────────────────────────────────────────────── */

function TreasuryLedger({ orders, listings }: { orders: any[]; listings: any[] }) {
  const [filter, setFilter] = useState<"all" | "sale" | "refund">("all");

  const revenue = orders.filter((o) => o.status === "completed").reduce((s, o) => s + (o.amount_cents || 0), 0);
  const refunds = orders.filter((o) => o.status === "refunded").reduce((s, o) => s + (o.amount_cents || 0), 0);
  const net = revenue - refunds;

  const filtered = orders.filter((o) => {
    if (filter === "sale") return o.status === "completed";
    if (filter === "refund") return o.status === "refunded";
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Revenue",  value: revenue / 100,  color: "#10B981", icon: "TrendingUp" },
          { label: "Refunds",  value: refunds / 100,  color: "#EF4444", icon: "TrendingDown" },
          { label: "Net",      value: net / 100,      color: net >= 0 ? "#C5A059" : "#EF4444", icon: "Wallet" },
        ].map((tile) => (
          <Card key={tile.label} className="p-3 bg-white rounded-2xl text-center">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1.5" style={{ background: tile.color + "18" }}>
              <Icon name={tile.icon as any} size={13} color={tile.color} />
            </div>
            <p className="text-[16px] font-black" style={{ color: tile.color }}>
              ${Math.abs(tile.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A] mt-0.5">{tile.label}</p>
          </Card>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5">
        {(["all", "sale", "refund"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all",
              filter === f ? "bg-[#202020] text-[#C5A059] border-transparent" : "bg-white border-[#E5E3DB] text-[#7A7A7A]"
            )}
          >
            {f === "all" ? "All" : f === "sale" ? "Sales" : "Refunds"}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="py-10 text-center">
          <Icon name="Receipt" size={28} className="mx-auto mb-2 text-[#C5A059]/20" />
          <p className="text-[12px] font-bold text-[#7A7A7A]">No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const isSale = o.status === "completed";
            const isRefund = o.status === "refunded";
            return (
              <Card key={o.id} className="p-3 bg-white rounded-xl flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: isSale ? "#10B981" + "18" : isRefund ? "#EF444418" : "#F3F1EC" }}
                >
                  <Icon
                    name={isSale ? "ArrowUpRight" : isRefund ? "ArrowDownLeft" : "Clock"}
                    size={14}
                    color={isSale ? "#10B981" : isRefund ? "#EF4444" : "#7A7A7A"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-[#202020] truncate capitalize">
                    {o.order_type || o.status || "Order"}
                  </p>
                  <p className="text-[10px] text-[#7A7A7A]">{new Date(o.created_at).toLocaleDateString()}</p>
                </div>
                <p
                  className="text-[14px] font-black shrink-0"
                  style={{ color: isSale ? "#10B981" : isRefund ? "#EF4444" : "#7A7A7A" }}
                >
                  {isSale ? "+" : isRefund ? "-" : ""}${((o.amount_cents || 0) / 100).toFixed(2)}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── OpsLogPanel ────────────────────────────────────────────────────── */

function OpsLogPanel({ opsLog, members, company }: { opsLog: any[]; members: any[]; company: any }) {
  const OPS_META: Record<string, { icon: string; color: string; label: (p: any) => string }> = {
    hire:          { icon: "UserCheck",    color: "#10B981", label: (p) => `Hired ${p.name || "a candidate"}` },
    fire:          { icon: "UserX",        color: "#EF4444", label: (p) => `Removed ${p.name || "a member"}` },
    sale:          { icon: "ShoppingBag",  color: "#C5A059", label: (p) => `Sale: ${p.listing || "product"}` },
    announcement:  { icon: "Megaphone",    color: "#8B5CF6", label: (p) => `Posted: ${p.title || "announcement"}` },
    member_join:   { icon: "UserPlus",     color: "#0A84FF", label: (p) => `${p.name || "Someone"} joined the team` },
    member_leave:  { icon: "UserMinus",    color: "#7A7A7A", label: (p) => `${p.name || "Member"} left` },
  };

  // Derive synthetic log from members if no ops log yet
  const syntheticLog = members.map((m) => ({
    id: m.id,
    kind: "member_join",
    payload: { name: (m as any).users?.display_name || "Member" },
    created_at: m.joined_at,
    actor_id: m.user_id,
  }));

  const combined = [...opsLog, ...syntheticLog]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);

  if (combined.length === 0) {
    return (
      <div className="py-10 text-center">
        <Icon name="Activity" size={28} className="mx-auto mb-2 text-[#C5A059]/20" />
        <p className="text-[12px] font-bold text-[#7A7A7A]">No activity recorded yet</p>
        <p className="text-[11px] text-[#7A7A7A] mt-1">Activity appears here as the team grows.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {combined.map((entry, i) => {
        const meta = OPS_META[entry.kind] || { icon: "Zap", color: "#C5A059", label: () => entry.kind };
        const payload = entry.payload || {};
        return (
          <div key={entry.id || i} className="flex items-start gap-3 py-2.5 border-b border-[#E5E3DB] last:border-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: meta.color + "18" }}
            >
              <Icon name={meta.icon as any} size={13} color={meta.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-[#202020]">{meta.label(payload)}</p>
              <p className="text-[10px] text-[#7A7A7A]">{timeAgo(entry.created_at)} ago</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
