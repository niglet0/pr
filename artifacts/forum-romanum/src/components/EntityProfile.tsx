import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, Button, Icon, Card, Skeleton, cn, C } from "./UI";
import { supabase } from "../integrations/supabase/client";

export type EntityType = "user" | "company" | "channel";

export interface EntityRef {
  type: EntityType;
  id: string;
  handle?: string;
}

type Tab = "posts" | "products" | "bounties" | "channels" | "about";

function TabBar({ tabs, active, onChange }: { tabs: { id: Tab; label: string }[]; active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar px-4 py-2 border-b border-[#E5E3DB]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0 transition-all",
            active === t.id
              ? "bg-[#C5A059] text-white"
              : "bg-[#F3F1EC] text-[#7A7A7A] hover:bg-[#E5E3DB]"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function PostCard({ p }: { p: any }) {
  return (
    <Card className="p-4 mx-4 mb-3">
      <p className="text-sm leading-relaxed text-[#202020] line-clamp-4">{p.content}</p>
      <div className="flex gap-4 mt-3 text-[11px] font-bold text-[#7A7A7A]">
        <span className="flex items-center gap-1"><Icon name="Heart" size={12} />{p.likes_count ?? 0}</span>
        <span className="flex items-center gap-1"><Icon name="MessageCircle" size={12} />{p.comments_count ?? 0}</span>
        <span className="ml-auto">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</span>
      </div>
    </Card>
  );
}

function ProductCard({ p }: { p: any }) {
  const price = p.price_cents ? `$${(p.price_cents / 100).toFixed(0)}` : p.pricing_model === "free" ? "Free" : "—";
  return (
    <Card className="mx-4 mb-3 overflow-hidden">
      {p.cover_url && <img src={p.cover_url} className="w-full h-28 object-cover" alt={p.title} />}
      <div className="p-3">
        <p className="font-bold text-sm truncate">{p.title}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[#C5A059] font-black text-sm">{price}</span>
          <span className="text-[10px] text-[#7A7A7A] font-bold">{p.purchases_count ?? 0} sales</span>
        </div>
      </div>
    </Card>
  );
}

function BountyCard({ b }: { b: any }) {
  return (
    <Card className="p-4 mx-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-sm flex-1 line-clamp-2">{b.title}</p>
        <span className="text-[#C5A059] font-black text-sm shrink-0">${b.amount ?? b.bounty_amount ?? 0}</span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
          b.status === "open" ? "bg-green-100 text-green-700"
            : b.status === "claimed" ? "bg-blue-100 text-blue-700"
              : "bg-[#F3F1EC] text-[#7A7A7A]"
        )}>{b.status}</span>
        {b.language && <span className="text-[10px] text-[#7A7A7A]">{b.language}</span>}
      </div>
    </Card>
  );
}

function AboutSection({ entity }: { entity: any }) {
  const rows: { icon: any; label: string; value: string }[] = [];
  if (entity.website) rows.push({ icon: "Globe", label: "Website", value: entity.website });
  if (entity.location) rows.push({ icon: "MapPin", label: "Location", value: entity.location });
  if (entity.github || entity.github_url) rows.push({ icon: "Github", label: "GitHub", value: entity.github || entity.github_url });
  if (entity.twitter_username || entity.twitter_url) rows.push({ icon: "Twitter", label: "Twitter", value: entity.twitter_username || entity.twitter_url });
  if (entity.linkedin_url) rows.push({ icon: "Linkedin", label: "LinkedIn", value: entity.linkedin_url });
  if (entity.industry) rows.push({ icon: "Briefcase", label: "Industry", value: entity.industry });
  if (entity.team_size) rows.push({ icon: "Users", label: "Team Size", value: entity.team_size });
  if (entity.founded_year) rows.push({ icon: "Calendar", label: "Founded", value: String(entity.founded_year) });

  return (
    <div className="px-4 pt-4 space-y-3">
      {entity.bio && <p className="text-sm text-[#202020] leading-relaxed">{entity.bio}</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <Icon name={r.icon} size={15} className="text-[#C5A059] shrink-0" />
          <span className="text-[#7A7A7A] text-xs font-bold uppercase tracking-wider w-16 shrink-0">{r.label}</span>
          <span className="text-[#202020] text-sm truncate">{r.value}</span>
        </div>
      ))}
      {rows.length === 0 && !entity.bio && (
        <p className="text-[#7A7A7A] text-sm text-center py-8">No info yet.</p>
      )}
    </div>
  );
}

export function EntityProfile({
  entity: ref,
  currentUserId,
  onClose,
}: {
  entity: EntityRef;
  currentUserId?: string;
  onClose: () => void;
}) {
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [bounties, setBounties] = useState<any[]>([]);
  const [subChannels, setSubChannels] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState<Partial<Record<Tab, boolean>>>({});

  useEffect(() => {
    loadEntity();
  }, [ref.id, ref.type]);

  useEffect(() => {
    if (entity && !dataLoaded[activeTab]) {
      loadTabData(activeTab);
    }
  }, [activeTab, entity]);

  const loadEntity = async () => {
    setLoading(true);
    try {
      if (ref.type === "user") {
        const query = ref.handle
          ? supabase.from("users").select("*").eq("handle", ref.handle)
          : supabase.from("users").select("*").eq("id", ref.id);
        const { data } = await (query as any).maybeSingle();
        setEntity(data);
        if (data && currentUserId) {
          const { data: fol } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", currentUserId)
            .eq("following_id", data.id)
            .maybeSingle();
          setIsFollowing(!!fol);
        }
      } else if (ref.type === "company") {
        const query = ref.handle
          ? supabase.from("company_profiles").select("*").eq("slug", ref.handle)
          : supabase.from("company_profiles").select("*").eq("id", ref.id);
        const { data } = await (query as any).maybeSingle();
        setEntity(data);
        if (data && currentUserId) {
          const { data: fol } = await supabase
            .from("company_follows")
            .select("company_id")
            .eq("company_id", data.id)
            .eq("user_id", currentUserId)
            .maybeSingle();
          setIsFollowing(!!fol);
        }
      } else {
        const query = ref.handle
          ? supabase.from("groups").select("*").eq("username", ref.handle)
          : supabase.from("groups").select("*").eq("id", ref.id);
        const { data } = await (query as any).maybeSingle();
        setEntity(data);
        if (data && currentUserId) {
          const { data: sub } = await supabase
            .from("group_members")
            .select("group_id")
            .eq("group_id", data.id)
            .eq("user_id", currentUserId)
            .maybeSingle();
          setIsFollowing(!!sub);
        }
      }
    } finally {
      setLoading(false);
    }
    await loadTabData("posts");
  };

  const loadTabData = async (tab: Tab) => {
    if (!entity && tab !== "posts") return;
    const id = entity?.id ?? ref.id;
    try {
      if (tab === "posts") {
        const col = ref.type === "user" ? "author_id" : ref.type === "company" ? "author_id" : "group_id";
        if (ref.type !== "channel") {
          const { data } = await supabase.from("v_posts").select("*").eq("author_id", id).order("created_at", { ascending: false }).limit(20);
          setPosts(data || []);
        }
      } else if (tab === "products") {
        const { data } = await supabase.from("marketplace_listings").select("id,title,cover_url,price_cents,pricing_model,purchases_count,kind").eq("seller_id", id).eq("status", "active").order("created_at", { ascending: false }).limit(20);
        setProducts(data || []);
      } else if (tab === "bounties") {
        const { data } = await supabase.from("v_dev_bounties").select("*").eq("poster_id", id).order("created_at", { ascending: false }).limit(20);
        setBounties(data || []);
      } else if (tab === "channels") {
        const { data } = await supabase.from("groups").select("id,name,avatar_url,members_count,is_channel").eq("owner_id", id).eq("is_channel", true).limit(10);
        setSubChannels(data || []);
      }
    } catch {}
    setDataLoaded((prev) => ({ ...prev, [tab]: true }));
  };

  const toggleFollow = async () => {
    if (!currentUserId || !entity) return;
    setFollowLoading(true);
    try {
      if (ref.type === "user") {
        if (isFollowing) {
          await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", entity.id);
        } else {
          await supabase.from("follows").insert({ follower_id: currentUserId, following_id: entity.id });
        }
      } else if (ref.type === "company") {
        if (isFollowing) {
          await supabase.from("company_follows").delete().eq("company_id", entity.id).eq("user_id", currentUserId);
        } else {
          await supabase.from("company_follows").insert({ company_id: entity.id, user_id: currentUserId });
        }
      } else {
        if (isFollowing) {
          await supabase.from("group_members").delete().eq("group_id", entity.id).eq("user_id", currentUserId);
        } else {
          await supabase.from("group_members").insert({ group_id: entity.id, user_id: currentUserId, role: "member", muted: false, last_read_at: new Date().toISOString(), unread_count: 0, color_seed: Math.floor(Math.random() * 100) });
        }
      }
      setIsFollowing((f) => !f);
    } finally {
      setFollowLoading(false);
    }
  };

  const name = entity?.display_name || entity?.name || entity?.username || "Unknown";
  const handle = entity?.handle || entity?.username || entity?.slug || "";
  const avatar = entity?.avatar_url || entity?.logo_url || null;
  const banner = entity?.banner_url || null;
  const bio = entity?.bio || entity?.tagline || entity?.description || "";
  const verified = entity?.verified || entity?.is_verified || false;
  const followers = entity?.followers_count || entity?.subscribers_count || entity?.members_count || 0;

  const TABS: { id: Tab; label: string }[] = ref.type === "user"
    ? [
        { id: "posts", label: "Posts" },
        { id: "products", label: "Products" },
        { id: "bounties", label: "Bounties" },
        { id: "about", label: "About" },
      ]
    : ref.type === "company"
    ? [
        { id: "posts", label: "Updates" },
        { id: "products", label: "Products" },
        { id: "channels", label: "Channels" },
        { id: "about", label: "About" },
      ]
    : [
        { id: "posts", label: "Posts" },
        { id: "about", label: "About" },
      ];

  const isOwn = currentUserId && entity && (entity.id === currentUserId || entity.owner_id === currentUserId);

  return (
    <div className="absolute inset-0 z-[110] flex flex-col bg-[#FAF9F6] overflow-hidden">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="relative">
          {banner ? (
            <img src={banner} className="w-full h-32 object-cover" alt="banner" />
          ) : (
            <div className="w-full h-32 bg-gradient-to-br from-[#D4AF37] to-[#8C6A32]" />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
          >
            <Icon name="ArrowLeft" size={18} />
          </button>
          {verified && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
              <Icon name="BadgeCheck" size={14} className="text-[#C5A059]" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Verified</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="px-4 pt-6 space-y-3">
            <Skeleton height={56} width={56} rounded={28} />
            <Skeleton height={20} width="60%" />
            <Skeleton height={14} width="40%" />
          </div>
        ) : !entity ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#7A7A7A]">
            <Icon name="UserX" size={40} className="mb-4" />
            <p className="font-bold">Entity not found</p>
          </div>
        ) : (
          <>
            <div className="px-4 -mt-8 flex items-end justify-between">
              <div className="w-20 h-20 rounded-2xl border-4 border-[#FAF9F6] overflow-hidden shadow-lg bg-[#F3F1EC]">
                {avatar ? (
                  <img src={avatar} className="w-full h-full object-cover" alt={name} />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#C5A059] to-[#8C6A32] flex items-center justify-center text-white font-black text-3xl">
                    {name[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              {!isOwn && (
                <Button
                  variant={isFollowing ? "ghost" : "gold"}
                  size="sm"
                  onClick={toggleFollow}
                  disabled={followLoading}
                  className="mt-2"
                >
                  {isFollowing
                    ? ref.type === "channel" ? "Joined" : "Following"
                    : ref.type === "channel" ? "Join" : "Follow"}
                </Button>
              )}
            </div>

            <div className="px-4 mt-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black serif tracking-tight text-[#202020]">{name}</h2>
                {verified && <Icon name="BadgeCheck" size={18} className="text-[#C5A059]" />}
              </div>
              {handle && <p className="text-[#7A7A7A] text-sm font-medium mt-0.5">@{handle}</p>}
              {bio && <p className="text-sm text-[#202020] mt-2 leading-relaxed">{bio}</p>}

              <div className="flex gap-6 mt-4">
                <div>
                  <p className="text-lg font-black serif text-[#202020]">{followers.toLocaleString()}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">
                    {ref.type === "channel" ? "Members" : "Followers"}
                  </p>
                </div>
                {entity.following_count != null && (
                  <div>
                    <p className="text-lg font-black serif text-[#202020]">{entity.following_count.toLocaleString()}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">Following</p>
                  </div>
                )}
                {entity.posts_count != null && (
                  <div>
                    <p className="text-lg font-black serif text-[#202020]">{entity.posts_count.toLocaleString()}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">Posts</p>
                  </div>
                )}
                {entity.total_sales != null && (
                  <div>
                    <p className="text-lg font-black serif text-[#202020]">{entity.total_sales.toLocaleString()}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">Sales</p>
                  </div>
                )}
              </div>

              {ref.type === "company" && entity.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {entity.tags.map((tag: string) => (
                    <span key={tag} className="text-[10px] font-bold bg-[#C5A059]/10 text-[#C5A059] px-2.5 py-1 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

            <div className="pb-24 mt-2">
              {activeTab === "posts" && (
                posts.length === 0 ? (
                  <p className="text-center text-[#7A7A7A] py-12 text-sm">No posts yet.</p>
                ) : posts.map((p) => <PostCard key={p.id} p={p} />)
              )}
              {activeTab === "products" && (
                products.length === 0 ? (
                  <p className="text-center text-[#7A7A7A] py-12 text-sm">No products yet.</p>
                ) : products.map((p) => <ProductCard key={p.id} p={p} />)
              )}
              {activeTab === "bounties" && (
                bounties.length === 0 ? (
                  <p className="text-center text-[#7A7A7A] py-12 text-sm">No bounties posted.</p>
                ) : bounties.map((b) => <BountyCard key={b.id} b={b} />)
              )}
              {activeTab === "channels" && (
                subChannels.length === 0 ? (
                  <p className="text-center text-[#7A7A7A] py-12 text-sm">No channels yet.</p>
                ) : (
                  <div className="px-4 space-y-3 mt-2">
                    {subChannels.map((ch) => (
                      <Card key={ch.id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 flex items-center justify-center">
                          {ch.avatar_url ? (
                            <img src={ch.avatar_url} className="w-full h-full rounded-xl object-cover" alt={ch.name} />
                          ) : (
                            <Icon name="Radio" size={18} className="text-[#C5A059]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{ch.name}</p>
                          <p className="text-[11px] text-[#7A7A7A]">{(ch.members_count || 0).toLocaleString()} members</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )
              )}
              {activeTab === "about" && <AboutSection entity={entity} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
