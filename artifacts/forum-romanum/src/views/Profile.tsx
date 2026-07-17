import React, { useEffect, useMemo, useState } from "react";
import { Card, Avatar, Button, Icon, Skeleton, cn } from "../components/UI";
import { motion, AnimatePresence } from "motion/react";
import { supabase, signOut } from "../integrations/supabase/client";
import { nextRankProgress } from "../lib/bountyRank";
import { ImageUploader } from "../components/marketplace/ImageUploader";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { SignalsPanel } from "../components/SignalsPanel";

type Tab = "posts" | "media" | "bounties" | "likes" | "about" | "store" | "companies" | "badges" | "signals";

const STATUSES = ["Building", "Open to Work", "Mentoring", "Stealth Mode", "Offline"] as const;
const ACCENT = "#C5A059";

function StatBlock({ value, label, onClick }: { value: number | string; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 text-left group"
    >
      <div className="text-[17px] font-black serif leading-none group-hover:text-[#C5A059] transition-colors">
        {value}
      </div>
      <div className="text-[9px] font-bold text-[#7A7A7A] uppercase tracking-widest mt-1">
        {label}
      </div>
    </button>
  );
}

export function ProfileView({ currentUser, viewUserId, onClose, onOpenCompany, onOpenListing }: { currentUser?: any; viewUserId?: string; onClose?: () => void; onOpenCompany?: (id: string) => void; onOpenListing?: (id: string) => void }) {
  const isOwnProfile = !viewUserId || viewUserId === currentUser?.id;
  const targetId = viewUserId || currentUser?.id;

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<any[]>([]);
  const [bounties, setBounties] = useState<any[]>([]);
  const [paidCount, setPaidCount] = useState(0);
  const [earned, setEarned] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [marketListings, setMarketListings] = useState<any[]>([]);
  const [marketRevenue, setMarketRevenue] = useState(0);
  const [marketOrders, setMarketOrders] = useState(0);
  const [companies, setCompanies] = useState<any[]>([]);
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [newCompanyBio, setNewCompanyBio] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [createError, setCreateError] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editStatus, setEditStatus] = useState<string>("Building");
  const [editTechStack, setEditTechStack] = useState("");
  const [editHireMe, setEditHireMe] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editGithub, setEditGithub] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editBanner, setEditBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [badges, setBadges] = useState<Array<{ badge_key: string; earned_at: string }>>([]);

  const loadAll = async () => {
    if (!targetId) return;
    try {
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", targetId)
        .single();
      let p = userData;
      if (!p) {
        if (!isOwnProfile) { setLoading(false); return; }
        const newProfile = {
          id: currentUser.id,
          username: currentUser.email?.split("@")[0] || `user_${currentUser.id.substring(0, 5)}`,
          display_name: currentUser.email?.split("@")[0] || "New Citizen",
          avatar_url: `https://picsum.photos/seed/${currentUser.id}/200/200`,
          activity_score: 0,
          streak: 0,
        };
        const { data: inserted } = await supabase.from("users").insert(newProfile).select().single();
        p = inserted || newProfile;
      }
      setProfile(p);
      if (isOwnProfile) {
        setEditName(p.display_name || "");
        setEditUsername(p.username || "");
        setEditBio(p.bio || "");
        setEditStatus(p.status || "Building");
        setEditTechStack(Array.isArray(p.tech_stack) ? p.tech_stack.join(", ") : "");
        setEditHireMe(!!p.hire_me);
        setEditLocation(p.location || "");
        setEditWebsite(p.website || "");
        setEditGithub(p.github || "");
        setEditAvatar(p.avatar_url || "");
        setEditBanner(p.banner_url || "");
      }

      const { data: postsData } = await supabase
        .from("v_posts")
        .select("*")
        .eq("author_id", targetId)
        .order("created_at", { ascending: false });
      setPosts(postsData || []);

      if (isOwnProfile) {
        try {
          const { data: likeRows } = await supabase
            .from("post_likes")
            .select("post_id, v_posts!inner(*)")
            .eq("user_id", targetId)
            .order("created_at", { ascending: false })
            .limit(50);
          setLikedPosts((likeRows || []).map((r: any) => r.v_posts).filter(Boolean));
        } catch {}
      }

      try {
        const { data: bData } = await supabase
          .from("v_dev_bounties")
          .select("*")
          .or(`poster_id.eq.${targetId},claimant_id.eq.${targetId}`)
          .order("created_at", { ascending: false })
          .limit(30);
        setBounties(bData || []);
      } catch {}

      const { count: paid } = await supabase
        .from("dev_bounties")
        .select("id", { count: "exact", head: true })
        .eq("claimant_id", targetId)
        .eq("status", "approved");
      setPaidCount(paid || 0);

      try {
        const { data: earnedRows } = await supabase
          .from("dev_bounties")
          .select("amount")
          .eq("claimant_id", targetId)
          .eq("status", "approved");
        setEarned(
          (earnedRows || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
        );
      } catch {}

      try {
        const [mlRes, moRes] = await Promise.all([
          supabase
            .from("marketplace_listings")
            .select("id, title, cover_url, price_cents, kind, status, views_count")
            .eq("seller_id", targetId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("listing_orders")
            .select("amount_cents, status")
            .eq("seller_id", targetId),
        ]);
        setMarketListings(mlRes.data || []);
        const completedOrders = (moRes.data || []).filter((o: any) => o.status === "completed");
        setMarketOrders(completedOrders.length);
        setMarketRevenue(completedOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0));
      } catch {}

      try {
        const { data: companyData } = await supabase
          .from("company_profiles")
          .select("id, name, slug, logo_url, banner_url, is_verified, industry, followers_count, total_sales, total_revenue_cents, is_hiring, tagline")
          .eq("owner_id", targetId)
          .order("created_at", { ascending: false });
        setCompanies(companyData || []);
      } catch {}

      try {
        const { data: badgeData } = await supabase
          .from("user_badges")
          .select("badge_key, earned_at")
          .eq("user_id", targetId)
          .order("earned_at", { ascending: false });
        setBadges(badgeData || []);
      } catch {}

      // Check follow status for other users
      if (!isOwnProfile && currentUser?.id) {
        try {
          const { data: followRow } = await supabase
            .from("user_follows")
            .select("id")
            .eq("follower_id", currentUser.id)
            .eq("following_id", targetId)
            .maybeSingle();
          setIsFollowing(!!followRow);
        } catch {}
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    setSaveErr("");
    const techArray = editTechStack.split(",").map((s) => s.trim()).filter(Boolean);
    const payload: any = {
      display_name: editName.trim(),
      username: editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
      bio: editBio,
      status: editStatus,
      tech_stack: techArray,
      hire_me: editHireMe,
    };
    if (editLocation) payload.location = editLocation;
    if (editWebsite) payload.website = editWebsite;
    if (editGithub) payload.github = editGithub;
    if (editAvatar) payload.avatar_url = editAvatar;
    if (editBanner) payload.banner_url = editBanner;
    let { error } = await supabase.from("users").update(payload).eq("id", currentUser.id);
    if (error && /column|schema/i.test(error.message)) {
      // retry with safe subset
      const safe = {
        display_name: payload.display_name,
        username: payload.username,
        bio: payload.bio,
        status: payload.status,
        tech_stack: payload.tech_stack,
        hire_me: payload.hire_me,
        avatar_url: payload.avatar_url,
      };
      const r = await supabase.from("users").update(safe).eq("id", currentUser.id);
      error = r.error;
    }
    setSaving(false);
    if (error) {
      setSaveErr(error.message);
      return;
    }
    setProfile((prev: any) => ({ ...prev, ...payload }));
    setIsEditing(false);
  };

  const handleCreateCompany = async () => {
    if (!currentUser || !newCompanyName.trim() || !newCompanySlug.trim()) return;
    setCreatingCompany(true);
    setCreateError("");
    const slug = newCompanySlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const { data, error } = await supabase
      .from("company_profiles")
      .insert({
        owner_id: currentUser.id,
        name: newCompanyName.trim(),
        slug,
        bio: newCompanyBio.trim() || null,
        industry: newCompanyIndustry.trim() || null,
        is_verified: false,
        is_hiring: false,
        followers_count: 0,
        total_revenue_cents: 0,
        total_sales: 0,
      })
      .select()
      .single();
    setCreatingCompany(false);
    if (error) {
      setCreateError(error.message.includes("duplicate") ? "That handle is already taken." : error.message);
      return;
    }
    setCompanies((prev) => [data, ...prev]);
    setCreateCompanyOpen(false);
    setNewCompanyName("");
    setNewCompanySlug("");
    setNewCompanyBio("");
    setNewCompanyIndustry("");
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Delete this post permanently?")) return;
    await supabase.from("posts").delete().eq("id", postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?u=${profile.username}`;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: profile.display_name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  };

  const profileUrl = useMemo(
    () => (profile ? `${typeof window !== "undefined" ? window.location.origin : ""}/?u=${profile.username}` : ""),
    [profile]
  );

  if (loading) {
    return (
      <div className="space-y-6 pb-24 px-2">
        <Skeleton width="100%" height={160} rounded={24} />
        <div className="px-2 pt-16">
          <Skeleton width="60%" height={32} />
        </div>
      </div>
    );
  }
  if (!profile) return <div className="p-8 text-center">Profile not found.</div>;

  const media = posts.filter((p) => p.image_url || p.media_url);
  const rank = nextRankProgress(paidCount);

  return (
    <div className="pb-28 bg-[#FAF9F6]">
      {/* COVER */}
      <div className="relative h-44 -mx-2 overflow-hidden">
        {profile.banner_url ? (
          <img src={profile.banner_url} className="w-full h-full object-cover" alt="" />
        ) : (
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "url('https://picsum.photos/seed/rome_banner/800/400')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/10 to-transparent" />
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {isOwnProfile && (
            <button
              onClick={() => setShareOpen(true)}
              className="bg-white/20 backdrop-blur-md p-2 rounded-xl text-white hover:bg-white/30"
              aria-label="Share"
            >
              <Icon name="Share2" size={18} />
            </button>
          )}
          {isOwnProfile && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="bg-white/20 backdrop-blur-md p-2 rounded-xl text-white hover:bg-white/30"
              aria-label="Settings"
            >
              <Icon name="Settings" size={18} />
            </button>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 left-3 bg-black/40 backdrop-blur-md p-2 rounded-xl text-white hover:bg-black/60 transition-colors"
            aria-label="Back"
          >
            <Icon name="ArrowLeft" size={18} />
          </button>
        )}
      </div>

      {/* IDENTITY */}
      <div className="relative px-4">
        <div className="absolute -top-12 left-4">
          <div className="p-1.5 bg-[#FAF9F6] rounded-full shadow-xl">
            <Avatar src={profile.avatar_url} seed={profile.username} size={92} ring />
          </div>
        </div>
        <div className="pt-2 flex justify-end gap-2">
          {isOwnProfile ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Icon name="Pencil" size={12} className="mr-1.5" />
              Edit Profile
            </Button>
          ) : (
            <button
              disabled={followBusy}
              onClick={async () => {
                if (!currentUser?.id) return;
                setFollowBusy(true);
                try {
                  if (isFollowing) {
                    await supabase.from("user_follows").delete().eq("follower_id", currentUser.id).eq("following_id", targetId);
                    setIsFollowing(false);
                    setProfile((p: any) => p ? { ...p, followers_count: Math.max(0, (p.followers_count || 1) - 1) } : p);
                  } else {
                    await supabase.from("user_follows").insert({ follower_id: currentUser.id, following_id: targetId });
                    setIsFollowing(true);
                    setProfile((p: any) => p ? { ...p, followers_count: (p.followers_count || 0) + 1 } : p);
                  }
                } catch {}
                setFollowBusy(false);
              }}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50",
                isFollowing ? "bg-[#F3F1EC] text-[#7A7A7A] border border-[#E5E3DB]" : "bg-[#C5A059] text-white shadow-md shadow-[#C5A059]/30"
              )}
            >
              <Icon name={isFollowing ? "UserCheck" : "UserPlus"} size={12} />
              {followBusy ? "…" : isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border"
            style={{ background: rank.current.tint, color: rank.current.fg, borderColor: rank.current.ring }}
          >
            <Icon name="Crown" size={10} />
            {rank.current.label}
          </span>
          {profile.hire_me && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-[#10B981]/10 text-[#10B981] px-2 py-1 rounded-full flex items-center gap-1">
              <Icon name="Briefcase" size={10} /> Hire Me
            </span>
          )}
          {profile.status && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-white border border-[#E5E3DB] text-[#7A7A7A] px-2 py-1 rounded-full inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059]" />
              {profile.status}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-black serif mt-2 leading-tight">{profile.display_name}</h1>
        <p className="text-[#C5A059] font-bold text-sm tracking-tight">@{profile.username}</p>

        {profile.bio && (
          <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
        )}

        {/* meta row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-[#7A7A7A]">
          {profile.location && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="MapPin" size={12} /> {profile.location}
            </span>
          )}
          {profile.website && (
            <a
              href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[#C5A059] hover:underline"
            >
              <Icon name="Link" size={12} /> {profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {profile.github && (
            <a
              href={`https://github.com/${profile.github.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[#C5A059] hover:underline"
            >
              <Icon name={"Github" as any} size={12} /> @{profile.github.replace(/^@/, "")}
            </a>
          )}
        </div>

        {profile.tech_stack?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.tech_stack.map((t: string, i: number) => (
              <span
                key={i}
                className="text-[11px] font-bold bg-white border border-[#E5E3DB] px-2.5 py-1 rounded-md"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* STATS GRID */}
        <div className="mt-5 grid grid-cols-4 gap-2 bg-white border border-[#E5E3DB] rounded-2xl p-3">
          <StatBlock value={posts.length} label="Posts" />
          <StatBlock value={profile.followers_count || 0} label="Followers" />
          <StatBlock value={profile.following_count || 0} label="Following" />
          <StatBlock value={paidCount} label="Bounties" />
        </div>

        {/* SECONDARY METRICS */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Card className="p-3 bg-white">
            <div className="flex items-center gap-2 text-[#C5A059]">
              <Icon name="Coins" size={14} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Earned</span>
            </div>
            <div className="text-[15px] font-black mt-1 serif">${earned.toLocaleString()}</div>
          </Card>
          <Card className="p-3 bg-white">
            <div className="flex items-center gap-2 text-[#C5A059]">
              <Icon name="Flame" size={14} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Streak</span>
            </div>
            <div className="text-[15px] font-black mt-1 serif">{profile.streak || 0}d</div>
          </Card>
          <Card className="p-3 bg-white">
            <div className="flex items-center gap-2 text-[#C5A059]">
              <Icon name="Zap" size={14} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Score</span>
            </div>
            <div className="text-[15px] font-black mt-1 serif">{profile.activity_score || 0}</div>
          </Card>
        </div>

        {/* RANK PROGRESS */}
        {rank.next && (
          <div className="mt-3 bg-white border border-[#E5E3DB] rounded-2xl p-3">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mb-2">
              <span>{rank.current.label}</span>
              <span>
                {rank.remaining} to{" "}
                <span style={{ color: rank.next.fg }}>{rank.next.label}</span>
              </span>
            </div>
            <div className="h-1.5 bg-[#F3F1EC] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, ((paidCount - (rank.current as any).min || 0) / Math.max(1, (rank.next as any).min - (rank.current as any).min)) * 100)}%`,
                  background: rank.next.fg,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {targetId && (
        <div className="px-4">
          <ActivityHeatmap userId={targetId} />
        </div>
      )}

      {/* TABS — icon grid */}
      <div className="mt-5 sticky top-0 z-10 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E5E3DB]">
        <div className="grid grid-cols-9 divide-x divide-[#E5E3DB]">
          {(
            [
              { id: "posts",     icon: "FileText",    label: "Posts"  },
              { id: "store",     icon: "ShoppingBag", label: "Store"  },
              { id: "companies", icon: "Building2",   label: "Corps"  },
              { id: "bounties",  icon: "Zap",         label: "Bounty" },
              { id: "media",     icon: "Image",       label: "Media"  },
              { id: "badges",    icon: "Award",       label: "Badge"  },
              { id: "likes",     icon: "Heart",       label: "Liked"  },
              { id: "signals",   icon: "BarChart2",   label: "Stats"  },
              { id: "about",     icon: "User",        label: "About"  },
            ] as const
          ).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "relative flex flex-col items-center justify-center py-2.5 gap-1 transition-all",
                activeTab === id ? "text-[#C5A059]" : "text-[#7A7A7A] hover:text-[#202020]"
              )}
            >
              <Icon name={icon as any} size={15} />
              <span className="text-[8px] font-bold uppercase tracking-wide leading-none">{label}</span>
              {activeTab === id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C5A059] rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="px-4 mt-4 space-y-4">
        {activeTab === "posts" && (
          <>
            {posts.length === 0 ? (
              <EmptyState icon="FileText" label="No posts yet" />
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="p-4 bg-white relative group">
                  <div className="flex gap-3 mb-3">
                    <Avatar src={profile.avatar_url} seed={profile.username} size={36} />
                    <div className="flex-1">
                      <div className="text-[14px] font-bold">{profile.display_name}</div>
                      <div className="text-[10px] text-[#7A7A7A] uppercase tracking-widest">
                        {post.created_at ? new Date(post.created_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                    {isOwnProfile && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 rounded-lg text-[#7A7A7A] hover:bg-red-50 hover:text-red-500"
                        aria-label="Delete"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    )}
                  </div>
                  {post.content && (
                    <p className="text-[14px] whitespace-pre-wrap mb-2">{post.content}</p>
                  )}
                  {(post.image_url || post.media_url) && (
                    <img
                      src={post.image_url || post.media_url}
                      className="w-full rounded-xl border border-[#E5E3DB]"
                      alt=""
                    />
                  )}
                  <div className="flex gap-4 mt-3 text-[11px] text-[#7A7A7A] font-bold uppercase tracking-widest">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="Heart" size={12} /> {post.likes_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="MessageCircle" size={12} /> {post.comments_count || 0}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </>
        )}

        {activeTab === "media" && (
          <>
            {media.length === 0 ? (
              <EmptyState icon="Image" label="No media" />
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {media.map((p) => (
                  <div key={p.id} className="aspect-square bg-[#F3F1EC] overflow-hidden rounded-md">
                    <img
                      src={p.image_url || p.media_url}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                      alt=""
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "bounties" && (
          <>
            {bounties.length === 0 ? (
              <EmptyState icon="Coins" label="No bounty history" />
            ) : (
              bounties.map((b) => {
                const isClaimant = b.claimant_id === targetId;
                return (
                  <Card key={b.id} className="p-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] mb-0.5">
                          {isClaimant ? "Claimed" : "Posted"} · {b.status}
                        </div>
                        <div className="text-[14px] font-bold truncate">{b.title}</div>
                      </div>
                      <div className="text-[#C5A059] font-black serif text-[15px]">
                        ${b.amount}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </>
        )}

        {activeTab === "likes" && (
          <>
            {likedPosts.length === 0 ? (
              <EmptyState icon="Heart" label="No likes yet" />
            ) : (
              likedPosts.map((post) => (
                <Card key={post.id} className="p-4 bg-white">
                  <p className="text-[14px] whitespace-pre-wrap">{post.content}</p>
                </Card>
              ))
            )}
          </>
        )}

        {activeTab === "about" && (
          <Card className="p-5 bg-white space-y-4">
            <AboutRow label="Member since" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"} icon="Calendar" />
            <AboutRow label="Rank" value={rank.current.label} icon="Crown" />
            <AboutRow label="Total earned" value={`$${earned.toLocaleString()}`} icon="Coins" />
            <AboutRow label="Approved bounties" value={String(paidCount)} icon="CheckCircle2" />
            <AboutRow label="Status" value={profile.status || "—"} icon="Activity" />
            {profile.location && <AboutRow label="Location" value={profile.location} icon="MapPin" />}
          </Card>
        )}

        {activeTab === "companies" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#7A7A7A]">
                {companies.length} {companies.length === 1 ? "Company" : "Companies"}
              </p>
              {isOwnProfile && (
                <Button size="sm" variant="gold" onClick={() => setCreateCompanyOpen(true)}>
                  <Icon name="Plus" size={12} /> New Company
                </Button>
              )}
            </div>

            {companies.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#8B5CF6]/10 mx-auto flex items-center justify-center mb-4">
                  <Icon name="Building2" size={28} className="text-[#8B5CF6]" />
                </div>
                <p className="font-bold text-[#202020]">No companies yet</p>
                <p className="text-[12px] text-[#7A7A7A] mt-1 mb-4">Create a company to sell products, post announcements, and build a team.</p>
                {isOwnProfile && (
                <Button variant="gold" onClick={() => setCreateCompanyOpen(true)}>
                  <Icon name="Plus" size={14} /> Create Company
                </Button>
              )}
              </div>
            ) : (
              <div className="space-y-3">
                {companies.map((co) => (
                  <Card
                    key={co.id}
                    className="p-4 bg-white cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => onOpenCompany?.(co.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/10 overflow-hidden shrink-0 flex items-center justify-center">
                        {co.logo_url ? (
                          <img src={co.logo_url} alt={co.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[18px] font-black text-[#8B5CF6]">{co.name[0]}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm truncate">{co.name}</p>
                          {co.is_verified && <Icon name="BadgeCheck" size={13} className="text-[#C5A059] shrink-0" />}
                          {co.is_hiring && (
                            <span className="text-[9px] font-bold bg-[#10B981]/10 text-[#10B981] px-1.5 py-0.5 rounded-full uppercase tracking-wider">Hiring</span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#7A7A7A]">@{co.slug} · {co.industry || "Tech"}</p>
                        {co.tagline && <p className="text-[12px] text-[#202020] mt-1 line-clamp-1">{co.tagline}</p>}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-3 text-[10px] font-bold uppercase tracking-wider text-[#7A7A7A]">
                      <span>{(co.followers_count || 0).toLocaleString()} followers</span>
                      <span>{co.total_sales || 0} sales</span>
                      {co.total_revenue_cents > 0 && (
                        <span className="text-[#10B981]">${(co.total_revenue_cents / 100).toLocaleString()} revenue</span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "badges" && (
          <>
            {badges.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#C5A059]/10 mx-auto flex items-center justify-center mb-4">
                  <Icon name="Award" size={28} className="text-[#C5A059]" />
                </div>
                <p className="font-bold text-[#202020] serif text-[17px]">No honours yet</p>
                <p className="text-[12px] text-[#7A7A7A] mt-1 max-w-[220px] mx-auto leading-relaxed">
                  Earn badges by solving bounties, publishing listings, and engaging with the Legion.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {badges.map((b) => (
                  <Card key={b.badge_key} className="p-4 bg-white text-center space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-[#C5A059]/10 mx-auto flex items-center justify-center">
                      <Icon name="Award" size={24} className="text-[#C5A059]" />
                    </div>
                    <div className="text-[12px] font-black uppercase tracking-widest text-[#202020]">
                      {b.badge_key.replace(/_/g, " ")}
                    </div>
                    <div className="text-[10px] text-[#7A7A7A]">
                      {new Date(b.earned_at).toLocaleDateString()}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "store" && (
          <>
            {/* Marketplace stats */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="p-3 bg-white text-center">
                <div className="text-[17px] font-black serif">{marketListings.length}</div>
                <div className="text-[9px] font-bold text-[#7A7A7A] uppercase tracking-widest mt-1">Listings</div>
              </Card>
              <Card className="p-3 bg-white text-center">
                <div className="text-[17px] font-black serif text-[#10B981]">
                  {marketRevenue >= 100 ? `$${(marketRevenue / 100).toLocaleString()}` : "—"}
                </div>
                <div className="text-[9px] font-bold text-[#7A7A7A] uppercase tracking-widest mt-1">Revenue</div>
              </Card>
              <Card className="p-3 bg-white text-center">
                <div className="text-[17px] font-black serif">{marketOrders}</div>
                <div className="text-[9px] font-bold text-[#7A7A7A] uppercase tracking-widest mt-1">Sales</div>
              </Card>
            </div>

            {marketListings.length === 0 ? (
              <div className="py-10 text-center">
                <Icon name="Store" size={32} color="#C7C7CC" />
                <p className="text-[14px] text-[#7A7A7A] mt-3 tracking-tight">No listings yet.</p>
                <p className="text-[12px] text-[#7A7A7A] mt-1">Head to the Marketplace tab to start selling.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {marketListings.map((l: any) => (
                  <Card
                    key={l.id}
                    className="p-3 bg-white flex gap-3 items-center cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => onOpenListing?.(l.id)}
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#F3F1EC] overflow-hidden shrink-0 flex items-center justify-center">
                      {l.cover_url ? (
                        <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
                      ) : (
                        <Icon name="Package" size={18} color="#7A7A7A" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold truncate">{l.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-[#7A7A7A] uppercase tracking-widest font-bold">
                          {l.kind}
                        </span>
                        {l.views_count > 0 && (
                          <span className="text-[11px] text-[#7A7A7A] flex items-center gap-1">
                            <Icon name="Eye" size={10} /> {l.views_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {l.price_cents > 0 ? (
                        <span className="text-[14px] font-black serif">
                          ${(l.price_cents / 100).toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-[#10B981] uppercase tracking-widest">Free</span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
        {activeTab === "signals" && (
          <SignalsPanel currentUserId={targetId} />
        )}
      </div>

      {/* EDIT SHEET */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-sm flex items-end justify-center p-3"
            onClick={() => setIsEditing(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-[#FAF9F6] rounded-t-[32px] shadow-2xl border border-[#C5A059]/30 max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center border-b border-[#E5E3DB] px-5 py-4">
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-[#7A7A7A] font-bold uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <h3 className="font-bold text-sm tracking-widest uppercase">Edit Profile</h3>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-white bg-[#C5A059] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[10px] disabled:opacity-50"
                >
                  {saving ? "Saving" : "Save"}
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-5 space-y-4">
                {/* avatar + banner preview */}
                <div className="relative h-28 rounded-2xl overflow-hidden bg-[#F3F1EC]">
                  {editBanner && (
                    <img src={editBanner} className="w-full h-full object-cover" alt="" />
                  )}
                  <div className="absolute bottom-2 left-2">
                    <div className="p-1 bg-[#FAF9F6] rounded-full">
                      <Avatar src={editAvatar} seed={editUsername} size={56} />
                    </div>
                  </div>
                </div>

                <FieldRow label="Avatar photo">
                  <ImageUploader
                    bucket="forum-media"
                    pathPrefix={`avatars/${currentUser?.id}`}
                    existingUrl={editAvatar || null}
                    aspect="square"
                    label="Upload avatar"
                    onUploaded={(url) => setEditAvatar(url)}
                    onClear={() => setEditAvatar("")}
                    className="max-w-[120px]"
                  />
                </FieldRow>
                <FieldRow label="Cover / banner photo">
                  <ImageUploader
                    bucket="forum-media"
                    pathPrefix={`banners/${currentUser?.id}`}
                    existingUrl={editBanner || null}
                    aspect="banner"
                    label="Upload cover photo"
                    onUploaded={(url) => setEditBanner(url)}
                    onClear={() => setEditBanner("")}
                  />
                </FieldRow>

                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Display name">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="field"
                    />
                  </FieldRow>
                  <FieldRow label="Username">
                    <input
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="field"
                    />
                  </FieldRow>
                </div>

                <FieldRow label="Bio">
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell the legion who you are…"
                    maxLength={280}
                    className="field min-h-[90px] resize-none"
                  />
                  <div className="text-[10px] text-right text-[#7A7A7A] mt-1">
                    {editBio.length}/280
                  </div>
                </FieldRow>

                <FieldRow label="Status">
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setEditStatus(s)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors",
                          editStatus === s
                            ? "bg-[#C5A059] text-white border-[#C5A059]"
                            : "bg-white text-[#7A7A7A] border-[#E5E3DB]"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </FieldRow>

                <FieldRow label="Tech stack (comma separated)">
                  <input
                    value={editTechStack}
                    onChange={(e) => setEditTechStack(e.target.value)}
                    placeholder="TypeScript, Postgres, Rust"
                    className="field"
                  />
                </FieldRow>

                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Location">
                    <input
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="Berlin"
                      className="field"
                    />
                  </FieldRow>
                  <FieldRow label="GitHub">
                    <input
                      value={editGithub}
                      onChange={(e) => setEditGithub(e.target.value)}
                      placeholder="octocat"
                      className="field"
                    />
                  </FieldRow>
                </div>

                <FieldRow label="Website">
                  <input
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    placeholder="yourdomain.com"
                    className="field"
                  />
                </FieldRow>

                <label className="flex items-center justify-between bg-white border border-[#E5E3DB] p-3 rounded-xl">
                  <div>
                    <div className="text-[13px] font-bold flex items-center gap-2">
                      <Icon name="Briefcase" size={14} className="text-[#10B981]" />
                      Hire Me badge
                    </div>
                    <div className="text-[11px] text-[#7A7A7A] mt-0.5">
                      Show recruiters you're open to work
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={editHireMe}
                    onChange={(e) => setEditHireMe(e.target.checked)}
                    className="w-5 h-5 accent-[#10B981]"
                  />
                </label>

                {saveErr && (
                  <p className="text-red-500 text-[11px] font-bold text-center">{saveErr}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTINGS SHEET */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-sm flex items-end justify-center p-3"
            onClick={() => setSettingsOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-[#FAF9F6] rounded-t-[32px] shadow-2xl border border-[#C5A059]/30"
            >
              <div className="flex justify-between items-center border-b border-[#E5E3DB] px-5 py-4">
                <h3 className="font-bold text-sm tracking-widest uppercase">Settings</h3>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[#E5E3DB]"
                >
                  <Icon name="X" size={18} />
                </button>
              </div>
              <div className="p-3 space-y-1">
                <SettingsGroup label="Account">
                  <SettingsRow icon="User" label="Edit profile" onClick={() => { setSettingsOpen(false); setIsEditing(true); }} />
                  <SettingsRow icon="AtSign" label="Username" value={`@${profile.username}`} onClick={() => { setSettingsOpen(false); setIsEditing(true); }} />
                  <SettingsRow icon="Mail" label="Email" value={currentUser?.email || "—"} />
                </SettingsGroup>

                <SettingsGroup label="Privacy">
                  <SettingsRow icon="Lock" label="Private account" toggle />
                  <SettingsRow icon="EyeOff" label="Hide activity status" toggle />
                  <SettingsRow icon="Shield" label="Blocked users" badge="0" />
                </SettingsGroup>

                <SettingsGroup label="Notifications">
                  <SettingsRow icon="Bell" label="Push notifications" toggle defaultOn />
                  <SettingsRow icon="Mail" label="Email digest" toggle />
                </SettingsGroup>

                <SettingsGroup label="Earnings">
                  <SettingsRow icon="Coins" label="Payout method" value="Not set" />
                  <SettingsRow icon="Receipt" label="Transaction history" />
                </SettingsGroup>

                <SettingsGroup label="Support">
                  <SettingsRow icon="HelpCircle" label="Help center" />
                  <SettingsRow icon="FileText" label="Terms & privacy" />
                </SettingsGroup>

                <div className="pt-2">
                  <button
                    onClick={signOut}
                    className="w-full py-3 rounded-xl bg-white border border-red-200 text-red-500 font-bold text-[13px] uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Icon name="LogOut" size={14} /> Sign out
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SHARE SHEET */}
      <AnimatePresence>
        {shareOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-sm flex items-end justify-center p-3"
            onClick={() => setShareOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-[#FAF9F6] rounded-t-[32px] shadow-2xl border border-[#C5A059]/30 p-5"
            >
              <h3 className="font-bold text-sm tracking-widest uppercase text-center mb-4">
                Share profile
              </h3>
              <div className="bg-white border border-[#E5E3DB] rounded-xl p-3 flex items-center gap-2">
                <code className="flex-1 truncate text-[12px] text-[#7A7A7A]">
                  {profileUrl}
                </code>
                <button
                  onClick={handleShare}
                  className="px-3 py-1.5 rounded-lg bg-[#C5A059] text-white text-[11px] font-bold uppercase tracking-widest"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CREATE COMPANY MODAL */}
      <AnimatePresence>
        {createCompanyOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/30 backdrop-blur-sm flex items-end justify-center p-3"
            onClick={() => setCreateCompanyOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-[#FAF9F6] rounded-t-[32px] shadow-2xl border border-[#C5A059]/30 max-h-[85vh] flex flex-col"
            >
              <div className="flex justify-between items-center border-b border-[#E5E3DB] px-5 py-4 shrink-0">
                <button
                  onClick={() => setCreateCompanyOpen(false)}
                  className="text-[#7A7A7A] font-bold uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <h3 className="font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                  <Icon name="Building2" size={15} className="text-[#8B5CF6]" />
                  Create Company
                </h3>
                <button
                  onClick={handleCreateCompany}
                  disabled={creatingCompany || !newCompanyName.trim() || !newCompanySlug.trim()}
                  className="text-white bg-[#C5A059] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[10px] disabled:opacity-50"
                >
                  {creatingCompany ? "Creating…" : "Create"}
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-5 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-[#8B5CF6]/10 mx-auto flex items-center justify-center mb-2">
                  {newCompanyName ? (
                    <span className="text-2xl font-black text-[#8B5CF6]">{newCompanyName[0].toUpperCase()}</span>
                  ) : (
                    <Icon name="Building2" size={26} className="text-[#8B5CF6]" />
                  )}
                </div>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">Company Name *</span>
                  <input
                    className="field mt-1"
                    placeholder="e.g. Acme Corp"
                    value={newCompanyName}
                    onChange={(e) => {
                      setNewCompanyName(e.target.value);
                      if (!newCompanySlug) {
                        setNewCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"));
                      }
                    }}
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">Handle / Slug * (@yourcompany)</span>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A7A] text-sm font-bold">@</span>
                    <input
                      className="field pl-7"
                      placeholder="acme-corp"
                      value={newCompanySlug}
                      onChange={(e) => setNewCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">Industry</span>
                  <input
                    className="field mt-1"
                    placeholder="e.g. SaaS, Fintech, Dev Tools…"
                    value={newCompanyIndustry}
                    onChange={(e) => setNewCompanyIndustry(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">Tagline / Bio</span>
                  <textarea
                    className="field mt-1 resize-none"
                    rows={3}
                    placeholder="What does your company do?"
                    value={newCompanyBio}
                    onChange={(e) => setNewCompanyBio(e.target.value)}
                  />
                </label>

                {createError && (
                  <p className="text-red-500 text-[12px] font-bold bg-red-50 px-3 py-2 rounded-xl">
                    {createError}
                  </p>
                )}

                <div className="bg-[#8B5CF6]/5 border border-[#8B5CF6]/15 rounded-xl p-4 text-[12px] text-[#7A7A7A] leading-relaxed">
                  <p className="font-bold text-[#8B5CF6] mb-1">What you get with a company:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Official storefront in the Marketplace</li>
                    <li>Company announcements in Home Feed</li>
                    <li>Team members with roles</li>
                    <li>Analytics dashboard</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .field {
          width: 100%;
          background: white;
          border: 1px solid #E5E3DB;
          padding: 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          outline: none;
        }
        .field:focus { border-color: ${ACCENT}; }
      `}</style>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function EmptyState({ icon, label }: { icon: any; label: string }) {
  return (
    <div className="text-center py-14 opacity-60">
      <Icon name={icon} size={40} className="mx-auto mb-3" />
      <p className="text-[11px] font-bold uppercase tracking-widest">{label}</p>
    </div>
  );
}

function AboutRow({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#F3F1EC] flex items-center justify-center text-[#C5A059]">
        <Icon name={icon} size={16} />
      </div>
      <div className="flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
          {label}
        </div>
        <div className="text-[14px] font-bold">{value}</div>
      </div>
    </div>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
        {label}
      </div>
      <div className="bg-white border border-[#E5E3DB] rounded-2xl overflow-hidden divide-y divide-[#F3F1EC]">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  badge,
  toggle,
  defaultOn,
  onClick,
}: {
  icon: any;
  label: string;
  value?: string;
  badge?: string;
  toggle?: boolean;
  defaultOn?: boolean;
  onClick?: () => void;
}) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <button
      onClick={() => {
        if (toggle) setOn((v) => !v);
        onClick?.();
      }}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FAF9F6]"
    >
      <Icon name={icon} size={16} className="text-[#7A7A7A]" />
      <span className="flex-1 text-[13px] font-medium">{label}</span>
      {value && <span className="text-[12px] text-[#7A7A7A] truncate max-w-[140px]">{value}</span>}
      {badge && (
        <span className="text-[10px] font-bold bg-[#F3F1EC] text-[#7A7A7A] px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      {toggle && (
        <span
          className={cn(
            "w-9 h-5 rounded-full relative transition-colors",
            on ? "bg-[#C5A059]" : "bg-[#E5E3DB]"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
              on ? "left-[18px]" : "left-0.5"
            )}
          />
        </span>
      )}
      {!toggle && !badge && !value && (
        <Icon name="ChevronRight" size={14} className="text-[#7A7A7A]" />
      )}
    </button>
  );
}