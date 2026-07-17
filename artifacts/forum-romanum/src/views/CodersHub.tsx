import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, Avatar, Button, Icon, Badge, cn, Skeleton } from "../components/UI";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";
import { DevProfileStrip, BountiesPanel } from "./dev/devhub";
import { LeaderboardPanel } from "../components/LeaderboardPanel";
import { LaunchesPanel } from "./dev/LaunchesPanel";
import { CollabPanel } from "./dev/CollabPanel";
import { NetworkPanel } from "./dev/NetworkPanel";
import { StacksPanel } from "./dev/StacksPanel";

type TabId = "Showcase" | "Bounties" | "Sponsors" | "Snippets" | "Leaderboard" | "Launches" | "Collab" | "Network" | "Stacks";
const ECO_TABS: TabId[] = ["Launches", "Collab", "Showcase", "Bounties", "Network", "Stacks", "Sponsors", "Snippets", "Leaderboard"];

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178C6",
  JavaScript: "#F7DF1E",
  Python: "#3776AB",
  Rust: "#DEA584",
  Go: "#00ADD8",
  Solidity: "#363636",
  Swift: "#FA7343",
  Kotlin: "#A97BFF",
  C: "#555555",
  "C++": "#F34B7D",
};
const langColor = (l?: string) => LANG_COLORS[l || ""] || "#C5A059";

export function CodersHubView({ currentUser, forceAction, clearAction, forceLaunchId, onForceLaunchConsumed, onOpenProfile }: { currentUser?: any; forceAction?: string | null; clearAction?: () => void; forceLaunchId?: string | null; onForceLaunchConsumed?: () => void; onOpenProfile?: (userId: string) => void }) {
  const [activeTab, setActiveTab] = useState<TabId>("Launches");
  const [repos, setRepos] = useState<any[]>([]);
  const [bounties, setBounties] = useState<any[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [snippets, setSnippets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState<null | "snippet" | "bounty" | "repo">(null);
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const [pinned, setPinned] = useState<Record<string, boolean>>({});

  const [launchCompose, setLaunchCompose] = useState(false);
  const [collabCompose, setCollabCompose] = useState(false);

  useEffect(() => {
    if (forceAction === "launch_product") {
      setActiveTab("Launches");
      setLaunchCompose(true);
      clearAction?.();
    } else if (forceAction === "post_collab") {
      setActiveTab("Collab");
      setCollabCompose(true);
      clearAction?.();
    }
  }, [forceAction]);

  const refresh = async () => {
    setLoading(true);
    const [r, b, c, s] = await Promise.all([
      supabase.from("v_repos").select("*").order("created_at", { ascending: false }),
      supabase.from("v_bounties").select("*").order("created_at", { ascending: false }),
      supabase.from("v_creators").select("*").order("current_amount", { ascending: false }),
      supabase.from("v_snippets").select("*").order("created_at", { ascending: false }),
    ]);
    setRepos(r.data || []);
    setBounties(b.data || []);
    setCreators(c.data || []);
    setSnippets(s.data || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const stats = useMemo(() => {
    const totalBounty = bounties.reduce((acc, x) => {
      const n = parseInt(String(x.bounty_amount || "0").replace(/[^0-9]/g, ""));
      return acc + (isFinite(n) ? n : 0);
    }, 0);
    return {
      repos: repos.length,
      bounties: bounties.filter((b) => (b.status || "Open") === "Open").length,
      pool: totalBounty,
      creators: creators.length,
    };
  }, [repos, bounties, creators]);

  const allLangs = useMemo(() => {
    const set = new Set<string>();
    repos.forEach((r) => r.language && set.add(r.language));
    snippets.forEach((s) => s.language && set.add(s.language));
    return Array.from(set).slice(0, 8);
  }, [repos, snippets]);

  const filteredRepos = repos.filter(
    (r) =>
      (!langFilter || r.language === langFilter) &&
      (!query || (r.name + " " + (r.description || "")).toLowerCase().includes(query.toLowerCase()))
  );
  const filteredSnippets = snippets.filter(
    (s) =>
      (!langFilter || s.language === langFilter) &&
      (!query || (s.title + " " + (s.code || "")).toLowerCase().includes(query.toLowerCase()))
  );
  const filteredBounties = bounties.filter(
    (b) => !query || (b.title + " " + (b.description || "")).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto pb-32 bg-[#FAF9F6] -mx-4 -mt-4">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1A1A1A] via-[#222] to-[#0F0F0F] text-white px-6 pt-10 pb-8">
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <motion.div
          className="absolute -top-16 -right-10 w-64 h-64 rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #C5A059 0%, transparent 70%)" }}
          animate={{ y: [0, 12, 0], x: [0, -8, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
              animate={{ rotate: -3, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
              className="w-14 h-14 bg-gradient-to-tr from-[#C5A059] to-[#F0D58A] rounded-2xl flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(197,160,89,0.7)]"
            >
              <Icon name="TerminalSquare" size={26} color="#1A1A1A" />
            </motion.div>
            <button
              onClick={refresh}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white tap-scale"
              aria-label="Refresh"
            >
              <Icon name="RefreshCw" size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          <h1 className="mt-4 text-[28px] leading-none font-black tracking-tight font-mono">
            Dev Nexus<span className="text-[#C5A059]">.</span>
          </h1>
          <p className="mt-2 text-[#A8A8A8] text-[13px] max-w-sm leading-relaxed">
            Where the legion ships. Open repos, fund creators, claim bounties, share snippets.
          </p>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-4 gap-2">
            {[
              { k: "Repos", v: stats.repos, icon: "BookOpen" },
              { k: "Open", v: stats.bounties, icon: "Target" },
              { k: "Pool", v: `$${stats.pool >= 1000 ? (stats.pool / 1000).toFixed(1) + "k" : stats.pool}`, icon: "Coins" },
              { k: "Creators", v: stats.creators, icon: "Sparkles" },
            ].map((s, i) => (
              <motion.div
                key={s.k}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-2 py-2.5 backdrop-blur-sm"
              >
                <Icon name={s.icon as any} size={12} className="text-[#C5A059] mb-1" />
                <div className="text-white font-black text-[15px] tracking-tight leading-none">{s.v}</div>
                <div className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-1">{s.k}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Dev profile + credits */}
      {currentUser?.id && (
        <DevProfileStrip userId={currentUser.id} />
      )}

      {/* Search + Tabs */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/85 glass border-b border-[#E5E3DB]">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-white border border-[#E5E3DB] rounded-full px-3.5 py-2 focus-within:border-[#C5A059] transition-colors">
            <Icon name="Search" size={15} className="text-[#7A7A7A]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${activeTab.toLowerCase()}…`}
              className="flex-1 bg-transparent outline-none text-[13px] font-medium placeholder:text-[#7A7A7A]/70"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-[#7A7A7A]">
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
        </div>
        <LayoutGroup id="hub-tabs">
          <div className="flex px-2 pb-2 gap-1 overflow-x-auto no-scrollbar">
            {ECO_TABS.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-full whitespace-nowrap transition-colors",
                    active ? "text-white" : "text-[#7A7A7A]"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="hub-tab-pill"
                      className="absolute inset-0 bg-[#202020] rounded-full shadow-sm"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className={cn("relative", active && "text-[#C5A059]")}>{tab}</span>
                </button>
              );
            })}
          </div>
          {(activeTab === "Showcase" || activeTab === "Snippets") && allLangs.length > 0 && (
            <div className="flex px-3 pb-2 gap-1.5 overflow-x-auto no-scrollbar">
              <LangPill label="All" active={!langFilter} onClick={() => setLangFilter(null)} color="#7A7A7A" />
              {allLangs.map((l) => (
                <LangPill key={l} label={l} color={langColor(l)} active={langFilter === l} onClick={() => setLangFilter(langFilter === l ? null : l)} />
              ))}
            </div>
          )}
        </LayoutGroup>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            {activeTab === "Launches" ? (
              <LaunchesPanel currentUserId={currentUser?.id} onOpenListing={() => {}} forceCompose={launchCompose} onComposeClose={() => setLaunchCompose(false)} onOpenProfile={onOpenProfile} forceLaunchId={forceLaunchId} onForceLaunchConsumed={onForceLaunchConsumed} />
            ) : activeTab === "Collab" ? (
              <CollabPanel currentUserId={currentUser?.id} forceCompose={collabCompose} onComposeClose={() => setCollabCompose(false)} />
            ) : activeTab === "Network" ? (
              <NetworkPanel currentUserId={currentUser?.id} />
            ) : activeTab === "Stacks" ? (
              <StacksPanel currentUserId={currentUser?.id} />
            ) : loading ? (
              <LoadingSkeletons />
            ) : activeTab === "Showcase" ? (
              <ShowcaseList
                repos={filteredRepos}
                pinned={pinned}
                togglePin={(id) => setPinned((p) => ({ ...p, [id]: !p[id] }))}
              />
            ) : activeTab === "Bounties" ? (
              <BountiesPanel userId={currentUser?.id} query={query} />
            ) : activeTab === "Sponsors" ? (
              <SponsorList creators={creators} />
            ) : activeTab === "Snippets" ? (
              <SnippetList snippets={filteredSnippets} />
            ) : activeTab === "Leaderboard" ? (
              <LeaderboardPanel currentUserId={currentUser?.id} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating Compose */}
      {activeTab !== "Sponsors" && activeTab !== "Bounties" && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 360, damping: 22, delay: 0.2 }}
          onClick={() =>
            setComposeOpen(activeTab === "Showcase" ? "repo" : "snippet")
          }
          className="absolute bottom-28 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-[#C5A059] to-[#E3C58B] text-[#1A1A1A] shadow-[0_12px_30px_-8px_rgba(197,160,89,0.6)] flex items-center justify-center animate-pulse-gold tap-scale"
          aria-label="Compose"
        >
          <Icon name="Feather" size={22} />
        </motion.button>
      )}

      <ComposeSheet
        open={composeOpen}
        onClose={() => setComposeOpen(null)}
        onSaved={refresh}
        currentUser={currentUser}
      />
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function LangPill({ label, active, onClick, color }: { label: string; active?: boolean; onClick?: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all tap-scale border",
        active ? "bg-[#202020] text-white border-[#202020]" : "bg-white text-[#7A7A7A] border-[#E5E3DB]"
      )}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </button>
  );
}

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-[#F3F1EC] border border-[#E5E3DB] flex items-center justify-center mb-4 animate-float">
        <Icon name={icon as any} size={28} className="text-[#C5A059]" />
      </div>
      <p className="text-[13px] font-black uppercase tracking-widest text-[#202020]">{title}</p>
      <p className="text-[12px] text-[#7A7A7A] mt-1 max-w-[240px]">{hint}</p>
    </motion.div>
  );
}

function LoadingSkeletons() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5">
          <Skeleton width="55%" height={16} className="mb-3" />
          <Skeleton width="100%" height={10} className="mb-2" />
          <Skeleton width="80%" height={10} />
        </Card>
      ))}
    </div>
  );
}

function ShowcaseList({ repos, pinned, togglePin }: { repos: any[]; pinned: Record<string, boolean>; togglePin: (id: string) => void }) {
  if (repos.length === 0) return <EmptyState icon="BookOpen" title="No Repos Yet" hint="Be the first to publish a repository to the Forum." />;
  return (
    <>
      {repos.map((repo, i) => (
        <motion.div
          key={repo.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Card
            className="p-5 group relative overflow-hidden border-[#E5E3DB] hover:border-[#C5A059]/40 shine-sweep"
            onClick={() => repo.link_url && window.open(repo.link_url, "_blank")}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${langColor(repo.language)}22`, color: langColor(repo.language) }}
                >
                  <Icon name="BookOpen" size={15} />
                </div>
                <div className="min-w-0">
                  <div className="font-mono font-bold text-[14px] truncate">
                    <span className="text-[#7A7A7A]">{repo.username || repo.author || "anon"}</span>
                    <span className="text-[#C5A059]"> / </span>
                    <span>{repo.name}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(repo.id);
                  toast(pinned[repo.id] ? "Unpinned" : "Pinned to your forum");
                }}
                className="text-[#C5A059]/40 hover:text-[#C5A059] tap-scale"
              >
                <Icon name={pinned[repo.id] ? "Pin" : "PinOff"} size={15} />
              </button>
            </div>
            {repo.description && (
              <p className="text-[13px] text-[#7A7A7A] mb-4 line-clamp-2 leading-relaxed">{repo.description}</p>
            )}
            <div className="flex items-center gap-5 text-[11px] font-bold text-[#7A7A7A]">
              {repo.language && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: langColor(repo.language) }} />
                  {repo.language}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Icon name="Star" size={12} />
                {repo.stars || 0}
              </div>
              <div className="flex items-center gap-1.5">
                <Icon name="GitFork" size={12} />
                {repo.forks || 0}
              </div>
              {repo.sponsored && (
                <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-[#C5A059] bg-[#C5A059]/10 px-2 py-0.5 rounded-full">
                  Sponsored
                </span>
              )}
            </div>
          </Card>
        </motion.div>
      ))}
    </>
  );
}

function BountyList({ bounties, claimed, onClaim }: { bounties: any[]; claimed: Record<string, boolean>; onClaim: (id: string) => void }) {
  if (bounties.length === 0) return <EmptyState icon="Target" title="No Bounties" hint="Post the first challenge and rally the legion." />;
  return (
    <>
      {bounties.map((b, i) => {
        const urg = (b.urgency || "Medium").toLowerCase();
        const urgColor = urg === "high" || urg === "urgent" ? "#EF4444" : urg === "low" ? "#10B981" : "#F59E0B";
        const isClaimed = claimed[b.id];
        return (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card className="p-0 overflow-hidden">
              <div className="border-l-[3px] p-5" style={{ borderColor: "#C5A059" }}>
                <div className="flex justify-between items-start mb-2 gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-[15px] leading-snug pr-2">{b.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: urgColor }}>
                        ● {b.urgency || "Medium"}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
                        {b.status || "Open"}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="bg-[#10B981]/10 text-[#10B981] font-black tracking-widest px-3 py-1.5 rounded-md border border-[#10B981]/20 text-[12px] shrink-0"
                  >
                    {b.bounty_amount || "—"}
                  </motion.div>
                </div>
                {b.description && (
                  <p className="text-[13px] text-[#7A7A7A] mb-3 line-clamp-3 leading-relaxed">{b.description}</p>
                )}
                {Array.isArray(b.tags) && b.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {b.tags.slice(0, 5).map((t: string) => (
                      <span key={t} className="text-[10px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-2 py-0.5 rounded-full">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  variant={isClaimed ? "ghost" : "gold"}
                  size="sm"
                  className="w-full"
                  onClick={() => onClaim(b.id)}
                >
                  <Icon name={isClaimed ? "Check" : "Swords"} size={13} />
                  {isClaimed ? "Claimed" : "Claim Bounty"}
                </Button>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </>
  );
}

function SponsorList({ creators }: { creators: any[] }) {
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-br from-[#1E1E1E] to-[#0F0F0F] rounded-2xl p-6 text-white text-center overflow-hidden"
      >
        <motion.div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-30"
          style={{ background: "#C5A059" }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#C5A059]/30 to-transparent mx-auto flex items-center justify-center mb-4 border border-[#C5A059]/30">
            <Icon name="HeartHandshake" size={26} className="text-[#C5A059]" />
          </div>
          <h2 className="text-lg font-black mb-2 tracking-tight">Fund the Builders</h2>
          <p className="text-[13px] text-[#A8A8A8] mb-5 max-w-xs mx-auto leading-relaxed">
            Back the makers shipping the infrastructure of the digital legion.
          </p>
          <Button onClick={() => toast.info("Creator browsing coming soon")} className="w-full max-w-[200px] mx-auto">
            Browse Tiers
          </Button>
        </div>
      </motion.div>
      {creators.length === 0 ? (
        <EmptyState icon="Sparkles" title="No Creators Yet" hint="Become the first sponsored creator." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {creators.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 text-center group tap-scale" onClick={() => toast.success(`Sponsoring @${c.username}`)}>
                <div className="relative w-fit mx-auto mb-3">
                  <Avatar src={c.avatar_url} seed={c.username} size={56} ring />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#10B981] border-2 border-white flex items-center justify-center">
                    <Icon name="Check" size={11} color="white" />
                  </div>
                </div>
                <h4 className="font-bold text-[13px] mb-0.5 truncate">@{c.username}</h4>
                <p className="text-[10px] text-[#C5A059] font-bold uppercase tracking-widest">
                  {c.supporters_count || 0} sponsors
                </p>
                <p className="text-[11px] text-[#10B981] font-black mt-1">
                  ${c.current_amount || 0}/mo
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function SnippetList({ snippets }: { snippets: any[] }) {
  if (snippets.length === 0) return <EmptyState icon="Code2" title="No Snippets" hint="Drop your first elegant snippet." />;
  return (
    <>
      {snippets.map((s, i) => (
        <SnippetCard key={s.id} s={s} index={i} />
      ))}
    </>
  );
}

function SnippetCard({ s, index }: { s: any; index: number }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const code = s.code || "";
  const lines = code.split("\n");
  const showExpand = lines.length > 8;
  const visible = expanded ? code : lines.slice(0, 8).join("\n");
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E3DB]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: `${langColor(s.language)}22`, color: langColor(s.language) }}
            >
              <Icon name="Code2" size={14} />
            </div>
            <div className="min-w-0">
              <div className="font-mono font-bold text-[13px] truncate">{s.title}</div>
              <div className="text-[10px] text-[#7A7A7A] font-bold uppercase tracking-widest">
                {s.username || "anon"} · {s.language || "txt"}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                toast.success("Copied to clipboard");
                setTimeout(() => setCopied(false), 1600);
              } catch {
                toast.error("Couldn't copy");
              }
            }}
            className="text-[#7A7A7A] hover:text-[#C5A059] tap-scale p-1.5"
          >
            <Icon name={copied ? "Check" : "Copy"} size={15} />
          </button>
        </div>
        <div className="bg-[#1A1A1A] p-4 overflow-x-auto relative">
          <pre className="text-[12px] font-mono text-[#E5E3DB] leading-relaxed">
            <code>{visible}</code>
          </pre>
          {showExpand && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-[10px] text-[#C5A059] font-bold uppercase tracking-widest"
            >
              {expanded ? "Collapse" : `Show ${lines.length - 8} more lines`}
            </button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

/* ----------------------------- Compose Sheet ----------------------------- */

function ComposeSheet({
  open,
  onClose,
  onSaved,
  currentUser,
}: {
  open: null | "snippet" | "bounty" | "repo";
  onClose: () => void;
  onSaved: () => void;
  currentUser?: any;
}) {
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({});
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      if (open === "snippet") {
        if (!form.title || !form.code) throw new Error("Title and code required");
        const { error } = await supabase.from("snippets").insert({
          title: form.title,
          code: form.code,
          language: form.language || "txt",
          author_id: currentUser?.id,
        });
        if (error) throw error;
      } else if (open === "bounty") {
        if (!form.title) throw new Error("Title required");
        const { error } = await supabase.from("bounties").insert({
          title: form.title,
          description: form.description || "",
          bounty_amount: form.amount ? `$${String(form.amount).replace(/[^0-9]/g, "")}` : "$100",
          urgency: form.urgency || "Medium",
          tags: form.tags ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
          creator_id: currentUser?.id,
        });
        if (error) throw error;
      } else {
        if (!form.name) throw new Error("Name required");
        const { error } = await supabase.from("repos").insert({
          name: form.name,
          description: form.description || "",
          language: form.language || "TypeScript",
          link_url: form.link_url || null,
          author_id: currentUser?.id,
        });
        if (error) throw error;
      }
      toast.success("Published to the Forum");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  const titleMap = { snippet: "New Snippet", bounty: "Post Bounty", repo: "Showcase Repo" };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="absolute left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl border-t border-[#E5E3DB] shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white/95 glass border-b border-[#E5E3DB] px-5 py-3 flex items-center justify-between">
              <div className="w-10 h-1 rounded-full bg-[#E5E3DB] absolute left-1/2 -translate-x-1/2 -top-2" />
              <h3 className="text-[15px] font-black tracking-tight">{titleMap[open]}</h3>
              <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-full hover:bg-[#F3F1EC] tap-scale">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {open === "snippet" && (
                <>
                  <Field label="Title">
                    <input ref={inputRef} className={inputCls} placeholder="useDebounce hook" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </Field>
                  <Field label="Language">
                    <input className={inputCls} placeholder="TypeScript" value={form.language || ""} onChange={(e) => setForm({ ...form, language: e.target.value })} />
                  </Field>
                  <Field label="Code">
                    <textarea
                      rows={8}
                      className={cn(inputCls, "font-mono text-[12px] resize-y")}
                      placeholder={`export const useDebounce = (...) => { ... }`}
                      value={form.code || ""}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                    />
                  </Field>
                </>
              )}
              {open === "bounty" && (
                <>
                  <Field label="Title">
                    <input ref={inputRef} className={inputCls} placeholder="Build a Stripe webhook handler" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </Field>
                  <Field label="Description">
                    <textarea rows={4} className={cn(inputCls, "resize-y")} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount (USD)">
                      <input type="number" className={inputCls} placeholder="500" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </Field>
                    <Field label="Urgency">
                      <select className={inputCls} value={form.urgency || "Medium"} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                        <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Tags (comma-separated)">
                    <input className={inputCls} placeholder="stripe, webhooks, node" value={form.tags || ""} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                  </Field>
                </>
              )}
              {open === "repo" && (
                <>
                  <Field label="Name">
                    <input ref={inputRef} className={inputCls} placeholder="awesome-cli" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field>
                  <Field label="Description">
                    <textarea rows={3} className={cn(inputCls, "resize-y")} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Language">
                      <input className={inputCls} placeholder="TypeScript" value={form.language || ""} onChange={(e) => setForm({ ...form, language: e.target.value })} />
                    </Field>
                    <Field label="Link">
                      <input className={inputCls} placeholder="https://github.com/…" value={form.link_url || ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
                    </Field>
                  </div>
                </>
              )}
              <Button onClick={submit} disabled={busy} className="w-full mt-2">
                {busy ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const inputCls =
  "w-full bg-[#FAF9F6] border border-[#E5E3DB] px-3.5 py-2.5 rounded-xl text-[13px] font-medium focus:border-[#C5A059] outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
