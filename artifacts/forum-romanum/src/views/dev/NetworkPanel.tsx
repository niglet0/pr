import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, cn } from "../../components/UI";
import { toast } from "sonner";

function timeAgo(d: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ago`;
}

function PulseNode({
  color,
  delay,
}: {
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      className="w-2 h-2 rounded-full absolute"
      style={{ background: color, opacity: 0.6 }}
      animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
      transition={{ duration: 2, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

function NetworkMap({ nodes }: { nodes: { color: string; x: number; y: number }[] }) {
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#111] mb-1">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />
      {/* Central node */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#8C6A32] flex items-center justify-center shadow-lg shadow-[#C5A059]/40 z-10 relative">
          <span className="text-[7px] font-black text-white">YOU</span>
        </div>
        <motion.div
          className="absolute inset-0 rounded-full border border-[#C5A059]/40"
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      </div>
      {/* Satellite nodes */}
      {nodes.map((n, i) => (
        <div key={i} className="absolute" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
          <div className="w-5 h-5 rounded-full border-2 border-[#333] flex items-center justify-center" style={{ background: n.color + "33" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: n.color }} />
          </div>
          <svg
            className="absolute top-2.5 left-2.5 pointer-events-none"
            style={{ overflow: "visible" }}
            width="0"
            height="0"
          >
            <line
              x1="0" y1="0"
              x2={`${50 - n.x}%`}
              y2={`${50 - n.y}%`}
              stroke={n.color}
              strokeWidth="0.5"
              strokeOpacity="0.25"
              strokeDasharray="3,3"
            />
          </svg>
        </div>
      ))}
      <div className="absolute bottom-2 left-3 text-[8px] font-bold text-white/30 uppercase tracking-widest">
        Your Network
      </div>
    </div>
  );
}

function PersonCard({
  person,
  currentUserId,
  onFollow,
}: {
  person: any;
  currentUserId?: string;
  onFollow: (id: string, following: boolean) => void;
}) {
  const [following, setFollowing] = useState(person.is_following || false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { toast.error("Sign in to follow"); return; }
    const newVal = !following;
    setFollowing(newVal);
    onFollow(person.id, newVal);
    if (newVal) {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: person.id, entity_type: "user" });
    } else {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", person.id);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E3DB] rounded-2xl hover:border-[#C5A059]/30 transition-all">
      <div className="relative shrink-0">
        <Avatar src={person.avatar_url} seed={person.id} size={40} className="rounded-full" />
        {person.is_online && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-[12px] text-[#202020] truncate">{person.display_name || person.username}</span>
          {person.is_verified && <Icon name="BadgeCheck" size={12} className="text-[#C5A059] shrink-0" />}
        </div>
        <p className="text-[10px] text-[#7A7A7A] truncate">{person.bio || `@${person.username}`}</p>
        {(person.tech_stack || []).length > 0 && (
          <div className="flex gap-1 mt-1 overflow-x-auto no-scrollbar">
            {person.tech_stack.slice(0, 3).map((t: string) => (
              <span key={t} className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#F3F1EC] text-[#555]">{t}</span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={toggle}
        className={cn(
          "shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full transition-all tap-scale border",
          following
            ? "bg-[#F3F1EC] text-[#7A7A7A] border-[#E5E3DB]"
            : "bg-[#C5A059] text-white border-[#C5A059] shadow-sm shadow-[#C5A059]/30"
        )}
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

function CompanyRow({
  company,
  currentUserId,
  onFollow,
}: {
  company: any;
  currentUserId?: string;
  onFollow: (id: string, following: boolean) => void;
}) {
  const [following, setFollowing] = useState(company.is_following || false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { toast.error("Sign in to follow"); return; }
    const newVal = !following;
    setFollowing(newVal);
    onFollow(company.id, newVal);
    if (newVal) {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: company.id, entity_type: "company" });
    } else {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", company.id);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#F3F1EC] rounded-xl transition-colors">
      <div className="w-9 h-9 rounded-xl bg-[#F3F1EC] border border-[#E5E3DB] overflow-hidden shrink-0">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-[#C5A059]">
            {(company.name || "?")[0].toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-black text-[12px] truncate">{company.name}</span>
          {company.is_verified && <Icon name="BadgeCheck" size={11} className="text-[#C5A059]" />}
        </div>
        <span className="text-[10px] text-[#7A7A7A]">{company.industry || "Company"} · {company.followers_count || 0} followers</span>
      </div>
      <button
        onClick={toggle}
        className={cn(
          "shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full transition-all border",
          following ? "bg-[#F3F1EC] text-[#7A7A7A] border-[#E5E3DB]" : "bg-[#202020] text-white border-transparent"
        )}
      >
        {following ? "Following" : "Watch"}
      </button>
    </div>
  );
}

export function NetworkPanel({ currentUserId }: { currentUserId?: string }) {
  const [people, setPeople] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"discover" | "followers" | "activity">("discover");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [pRes, cRes, aRes] = await Promise.all([
          supabase.from("users").select("id,display_name,username,avatar_url,bio,tech_stack,is_verified,activity_score")
            .order("activity_score", { ascending: false }).limit(15),
          supabase.from("company_profiles").select("id,name,slug,logo_url,industry,followers_count,is_verified,tagline")
            .order("followers_count", { ascending: false }).limit(10),
          supabase.from("v_posts").select("id,content,display_name,avatar_url,created_at,author_id,likes_count")
            .order("created_at", { ascending: false }).limit(20),
        ]);

        let personList = pRes.data || [];
        let companyList = cRes.data || [];

        if (currentUserId) {
          personList = personList.filter((p: any) => p.id !== currentUserId);
          const ids = personList.map((p: any) => p.id);
          const coIds = companyList.map((c: any) => c.id);

          const [followRes, coFollowRes, followerRes] = await Promise.all([
            ids.length ? supabase.from("follows").select("following_id").eq("follower_id", currentUserId).in("following_id", ids) : { data: [] },
            coIds.length ? supabase.from("follows").select("following_id").eq("follower_id", currentUserId).in("following_id", coIds) : { data: [] },
            supabase.from("follows").select("follower_id, users!follower_id(id,display_name,username,avatar_url,bio,tech_stack)").eq("following_id", currentUserId).limit(20),
          ]);

          const followedSet = new Set((followRes.data || []).map((f: any) => f.following_id));
          const coFollowedSet = new Set((coFollowRes.data || []).map((f: any) => f.following_id));

          setPeople(personList.map((p: any) => ({ ...p, is_following: followedSet.has(p.id) })));
          setCompanies(companyList.map((c: any) => ({ ...c, is_following: coFollowedSet.has(c.id) })));
          setFollowers(((followerRes.data as any) || []).map((f: any) => f.users).filter(Boolean));
        } else {
          setPeople(personList);
          setCompanies(companyList);
        }
        setActivity(aRes.data || []);
      } catch {
        setPeople([]);
        setCompanies([]);
        setActivity([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [currentUserId]);

  const networkNodes = [
    { color: "#C5A059", x: 20, y: 20 },
    { color: "#3B82F6", x: 75, y: 15 },
    { color: "#10B981", x: 85, y: 65 },
    { color: "#8B5CF6", x: 15, y: 70 },
    { color: "#F59E0B", x: 50, y: 82 },
    { color: "#EC4899", x: 60, y: 12 },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-black text-[16px] text-[#202020]">Your Network</h2>
        <p className="text-[11px] text-[#7A7A7A] font-medium mt-0.5">
          {people.filter((p) => p.is_following).length} following · {followers.length} followers
        </p>
      </div>

      <NetworkMap nodes={networkNodes} />

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F3F1EC] p-1 rounded-xl">
        {(["discover", "followers", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
              tab === t ? "bg-white text-[#C5A059] shadow-sm" : "text-[#7A7A7A]"
            )}
          >
            {t === "discover" ? "Discover" : t === "followers" ? "Followers" : "Activity"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-[#F3F1EC] rounded-2xl animate-pulse" />)}
        </div>
      ) : tab === "discover" ? (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">People to Follow</p>
            <div className="space-y-2">
              {people.slice(0, 6).map((p) => (
                <PersonCard key={p.id} person={p} currentUserId={currentUserId} onFollow={() => {}} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Companies to Watch</p>
            <div className="bg-white border border-[#E5E3DB] rounded-2xl divide-y divide-[#F3F1EC] overflow-hidden">
              {companies.slice(0, 5).map((c) => (
                <CompanyRow key={c.id} company={c} currentUserId={currentUserId} onFollow={() => {}} />
              ))}
            </div>
          </div>
        </div>
      ) : tab === "followers" ? (
        <div className="space-y-2">
          {followers.length === 0 ? (
            <div className="py-10 text-center">
              <Icon name="Users" size={28} className="text-[#C5A059] mx-auto mb-2" />
              <p className="font-black text-[13px]">No followers yet</p>
              <p className="text-[11px] text-[#7A7A7A] mt-1">Share your profile to grow your network</p>
            </div>
          ) : followers.map((f: any) => (
            <PersonCard key={f.id} person={f} currentUserId={currentUserId} onFollow={() => {}} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {activity.map((post: any, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-3 px-3 py-2.5 hover:bg-[#F3F1EC] rounded-xl transition-colors"
            >
              <Avatar src={post.avatar_url} seed={post.author_id} size={28} className="rounded-full shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-black text-[11px] text-[#202020]">{post.display_name || post.username}</span>
                <span className="text-[11px] text-[#7A7A7A]"> posted</span>
                <p className="text-[11px] text-[#555] line-clamp-1 mt-0.5">{post.content}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-[#7A7A7A]">{timeAgo(post.created_at)}</span>
                <span className="text-[9px] text-[#C5A059] font-bold">{post.likes_count || 0} ♥</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
