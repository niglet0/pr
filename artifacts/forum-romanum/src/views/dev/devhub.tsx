import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Card, Avatar, Button, Icon, cn, Skeleton } from "../../components/UI";
import { supabase } from "../../integrations/supabase/client";
import {
  fetchGitHubProfile,
  fetchGitHubRepos,
  deriveTopLanguages,
  totalStars,
} from "../../lib/github";
import { InlineDiffViewer } from "../../components/InlineDiffViewer";


/* ----------------------------- shared bits ----------------------------- */

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178C6", JavaScript: "#F7DF1E", Python: "#3776AB", Rust: "#DEA584",
  Go: "#00ADD8", Solidity: "#363636", Swift: "#FA7343", Kotlin: "#A97BFF",
  C: "#555555", "C++": "#F34B7D", Java: "#B07219", Ruby: "#CC342D", PHP: "#777BB4",
  HTML: "#E34F26", CSS: "#1572B6", Shell: "#89E051", Dart: "#00B4AB",
};
const langColor = (l?: string | null) => LANG_COLORS[l || ""] || "#C5A059";

const spring = { type: "spring" as const, stiffness: 320, damping: 32 };

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

function Sheet({
  open, onClose, title, children, footer,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={spring}
            className="fixed left-0 right-0 bottom-0 z-[201] bg-white rounded-t-3xl border-t border-[#E5E3DB] shadow-2xl max-h-[88vh] flex flex-col"
          >
            <div className="shrink-0 bg-white/95 backdrop-blur border-b border-[#E5E3DB] px-5 py-3.5 flex items-center justify-between relative">
              <div className="w-10 h-1 rounded-full bg-[#E5E3DB] absolute left-1/2 -translate-x-1/2 -top-2" />
              <h3 className="text-[15px] font-black tracking-tight">{title}</h3>
              <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-full hover:bg-[#F3F1EC] active:scale-95">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3">{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-[#E5E3DB] bg-white px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- types ----------------------------- */

type Credits = { balance: number; locked: number };
type GhConn = {
  user_id: string; username: string; avatar_url: string | null; name: string | null;
  bio: string | null; public_repos: number; followers: number; total_stars: number;
  top_languages: { language: string; weight: number }[];
};
type Bounty = {
  id: string; poster_id: string; title: string; description: string;
  repo_url: string | null; language: string | null; difficulty: string;
  amount: number; status: "open" | "claimed" | "submitted" | "approved" | "cancelled";
  claimant_id: string | null; submission_url: string | null; submission_notes: string | null;
  created_at: string; claimed_at: string | null; submitted_at: string | null; closed_at: string | null;
  poster_github?: string | null; poster_avatar?: string | null;
  claimant_github?: string | null; claimant_avatar?: string | null;
};

/* ============================================================
 * 1) DEV PROFILE STRIP — credits + GitHub connect
 * ============================================================ */

export function DevProfileStrip({
  userId,
  onConnectChange,
}: { userId: string; onConnectChange?: () => void }) {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [gh, setGh] = useState<GhConn | null>(null);
  const [loading, setLoading] = useState(true);
  const [openConnect, setOpenConnect] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { await supabase.rpc("ensure_credits", { p_user: userId }); } catch {}
    const [c, g] = await Promise.all([
      supabase.from("user_credits").select("balance, locked").eq("user_id", userId).maybeSingle(),
      supabase.from("github_connections").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    setCredits((c.data as Credits) || { balance: 0, locked: 0 });
    setGh((g.data as GhConn) || null);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [userId]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        className="mx-4 mt-4 rounded-2xl border border-[#E5E3DB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden"
      >
        <div className="p-4 flex items-center gap-3">
          {/* GitHub side */}
          {gh ? (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <Avatar src={gh.avatar_url || undefined} seed={gh.username} size={44} ring />
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#202020] border-2 border-white flex items-center justify-center">
                  <Icon name="GitBranch" size={9} color="white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold truncate">@{gh.username}</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#C5A059] bg-[#C5A059]/10 px-1.5 py-0.5 rounded">
                    linked
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#7A7A7A] font-bold uppercase tracking-widest mt-0.5">
                  <span className="flex items-center gap-1"><Icon name="BookOpen" size={10}/> {gh.public_repos}</span>
                  <span className="flex items-center gap-1"><Icon name="Star" size={10}/> {gh.total_stars}</span>
                  <span className="flex items-center gap-1"><Icon name="Users" size={10}/> {gh.followers}</span>
                </div>
              </div>
              <button
                onClick={() => setOpenConnect(true)}
                className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] hover:text-[#202020] px-2 py-1 rounded-md hover:bg-[#F3F1EC]"
              >
                Sync
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-full bg-[#202020] flex items-center justify-center shrink-0">
                <Icon name="GitBranch" size={20} color="white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight">Connect GitHub</div>
                <div className="text-[11px] text-[#7A7A7A] leading-tight mt-0.5">Verified language badges & repos</div>
              </div>
              <Button size="sm" onClick={() => setOpenConnect(true)}>Connect</Button>
            </div>
          )}
        </div>

        {/* Languages row */}
        {gh && gh.top_languages?.length > 0 && (
          <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {gh.top_languages.map((l) => (
              <span
                key={l.language}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#E5E3DB] bg-[#FAF9F6]"
              >
                <span className="w-2 h-2 rounded-full" style={{ background: langColor(l.language) }} />
                {l.language}
              </span>
            ))}
          </div>
        )}

        {/* Credits bar */}
        <div className="border-t border-[#E5E3DB] bg-[#FAF9F6] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#C5A059]/15 flex items-center justify-center">
              <Icon name="Coins" size={14} className="text-[#C5A059]" />
            </div>
            <div className="leading-tight">
              <div className="text-[14px] font-black tracking-tight">
                {loading ? <Skeleton width={50} height={14} rounded={4} /> : (credits?.balance ?? 0).toLocaleString()}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">credits</div>
            </div>
          </div>
          {!!credits?.locked && (
            <div className="text-right leading-tight">
              <div className="text-[12px] font-bold text-[#C5A059]">{credits.locked.toLocaleString()}</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A]">in escrow</div>
            </div>
          )}
        </div>
      </motion.div>

      <GitHubConnectSheet
        open={openConnect} onClose={() => setOpenConnect(false)} userId={userId}
        existing={gh}
        onSaved={() => { refresh(); onConnectChange?.(); }}
      />
    </>
  );
}

/* ============================================================
 * 2) GITHUB CONNECT SHEET
 * ============================================================ */

function GitHubConnectSheet({
  open, onClose, userId, existing, onSaved,
}: { open: boolean; onClose: () => void; userId: string; existing: GhConn | null; onSaved: () => void }) {
  const [username, setUsername] = useState(existing?.username || "");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    profile: { login: string; name: string | null; avatar_url: string; bio: string | null; public_repos: number; followers: number };
    stars: number; langs: { language: string; weight: number }[]; repoCount: number;
  } | null>(null);

  useEffect(() => {
    if (open) { setUsername(existing?.username || ""); setPreview(null); }
  }, [open, existing]);

  const preflight = async (): Promise<void> => {
    const u = username.trim().replace(/^@/, "");
    if (!u) { toast.error("Enter your GitHub username"); return; }
    setBusy(true);
    try {
      const [profile, repos] = await Promise.all([fetchGitHubProfile(u), fetchGitHubRepos(u)]);
      setPreview({ profile, stars: totalStars(repos), langs: deriveTopLanguages(repos), repoCount: repos.length });
    } catch (e: any) {
      toast.error(e.message || "Could not load GitHub");
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const u = preview.profile.login;
      const repos = await fetchGitHubRepos(u);
      const { error: e1 } = await supabase.from("github_connections").upsert({
        user_id: userId,
        username: u,
        avatar_url: preview.profile.avatar_url,
        name: preview.profile.name,
        bio: preview.profile.bio,
        public_repos: preview.profile.public_repos,
        followers: preview.profile.followers,
        total_stars: preview.stars,
        top_languages: preview.langs,
        last_synced_at: new Date().toISOString(),
      });
      if (e1) throw e1;
      // wipe & re-insert top 30 repos
      await supabase.from("github_repos").delete().eq("user_id", userId);
      if (repos.length) {
        const rows = repos.slice(0, 30).map((r) => ({
          user_id: userId, gh_id: r.id, name: r.name, full_name: r.full_name,
          description: r.description, language: r.language, stars: r.stargazers_count,
          forks: r.forks_count, html_url: r.html_url, pushed_at: r.pushed_at,
        }));
        const { error: e2 } = await supabase.from("github_repos").insert(rows);
        if (e2) throw e2;
      }
      toast.success(`Linked @${u}`);
      onSaved(); onClose();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "Re-sync GitHub" : "Connect GitHub"}>
      <div className="rounded-xl bg-[#FAF9F6] border border-[#E5E3DB] p-3 text-[12px] text-[#7A7A7A] leading-relaxed">
        We use GitHub's public API — no login, no token. Your repos, top languages and star count
        are pulled and saved as your "linked" dev badges. You can re-sync anytime.
      </div>
      <Field label="GitHub Username">
        <div className="flex items-center gap-2">
          <input
            className={inputCls}
            placeholder="octocat"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setPreview(null); }}
            onKeyDown={(e) => e.key === "Enter" && preflight()}
            autoFocus
          />
          <Button size="sm" onClick={preflight} disabled={busy}>
            <Icon name="Search" size={12} /> Look up
          </Button>
        </div>
      </Field>

      <AnimatePresence mode="wait">
        {preview && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={spring}
            className="rounded-2xl border border-[#E5E3DB] overflow-hidden"
          >
            <div className="p-4 flex items-center gap-3">
              <Avatar src={preview.profile.avatar_url} seed={preview.profile.login} size={48} ring />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold truncate">{preview.profile.name || preview.profile.login}</div>
                <div className="text-[11px] text-[#7A7A7A] truncate">@{preview.profile.login}</div>
                {preview.profile.bio && (
                  <div className="text-[11px] text-[#7A7A7A] line-clamp-2 mt-0.5">{preview.profile.bio}</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-[#E5E3DB] text-center">
              {[
                { k: "Repos", v: preview.repoCount },
                { k: "Stars", v: preview.stars },
                { k: "Followers", v: preview.profile.followers },
              ].map((s) => (
                <div key={s.k} className="py-3 border-r border-[#E5E3DB] last:border-r-0">
                  <div className="text-[15px] font-black tracking-tight">{s.v}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#7A7A7A] mt-0.5">{s.k}</div>
                </div>
              ))}
            </div>
            {preview.langs.length > 0 && (
              <div className="p-3 border-t border-[#E5E3DB] flex flex-wrap gap-1.5 bg-[#FAF9F6]">
                {preview.langs.map((l) => (
                  <span key={l.language}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white border border-[#E5E3DB]">
                    <span className="w-2 h-2 rounded-full" style={{ background: langColor(l.language) }} />
                    {l.language}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Button onClick={confirm} disabled={busy || !preview} className="w-full">
        {busy ? "Working…" : preview ? "Save & Link" : "Look up first"}
      </Button>
    </Sheet>
  );
}

/* ============================================================
 * 3) BOUNTIES — list + composer + detail
 * ============================================================ */

const STATUS_META: Record<Bounty["status"], { label: string; color: string; bg: string }> = {
  open:      { label: "Open",      color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  claimed:   { label: "Claimed",   color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  submitted: { label: "In Review", color: "#F59E0B", bg: "rgba(245,158,11,0.14)" },
  approved:  { label: "Paid",      color: "#C5A059", bg: "rgba(197,160,89,0.16)" },
  cancelled: { label: "Cancelled", color: "#7A7A7A", bg: "rgba(122,122,122,0.10)" },
};

export function BountiesPanel({
  userId, query,
}: { userId: string; query: string }) {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [detail, setDetail] = useState<Bounty | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "mine">("all");

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("v_dev_bounties")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setBounties((data as Bounty[]) || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  // keep detail synced with latest list
  useEffect(() => {
    if (!detail) return;
    const fresh = bounties.find((b) => b.id === detail.id);
    if (fresh && fresh !== detail) setDetail(fresh);
  }, [bounties]);

  const filtered = useMemo(() => {
    return bounties.filter((b) => {
      if (filter === "open" && b.status !== "open") return false;
      if (filter === "mine" && b.poster_id !== userId && b.claimant_id !== userId) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!(b.title + " " + b.description + " " + (b.language || "")).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [bounties, filter, query, userId]);

  return (
    <div className="space-y-3 relative">
      {/* Sub-filters */}
      <div className="flex items-center gap-1.5 px-1">
        {(["all", "open", "mine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              filter === f ? "bg-[#202020] text-[#C5A059]" : "bg-white border border-[#E5E3DB] text-[#7A7A7A] hover:text-[#202020]"
            )}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : "Mine"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={refresh}
          className="w-8 h-8 rounded-full bg-white border border-[#E5E3DB] flex items-center justify-center text-[#7A7A7A] hover:text-[#202020] active:scale-95"
          aria-label="Refresh"
        >
          <Icon name="RefreshCw" size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0,1,2].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton width="55%" height={16} className="mb-3" />
              <Skeleton width="100%" height={10} className="mb-2" />
              <Skeleton width="80%" height={10} />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#F3F1EC] border border-[#E5E3DB] flex items-center justify-center mx-auto mb-4">
            <Icon name="Target" size={26} className="text-[#C5A059]" />
          </div>
          <p className="text-[13px] font-black uppercase tracking-widest">No bounties</p>
          <p className="text-[12px] text-[#7A7A7A] mt-1">Post the first one and lock credits into escrow.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {filtered.map((b, i) => (
            <BountyCard key={b.id} b={b} index={i} userId={userId} onOpen={() => setDetail(b)} />
          ))}
        </AnimatePresence>
      )}

      {/* Compose FAB */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ ...spring, delay: 0.15 }}
        onClick={() => setComposeOpen(true)}
        className="absolute bottom-28 right-2 z-40 w-14 h-14 rounded-full bg-[#202020] text-[#C5A059] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.5)] flex items-center justify-center active:scale-95"
        aria-label="Post bounty"
      >
        <Icon name="Plus" size={22} />
      </motion.button>

      <BountyComposer
        open={composeOpen} onClose={() => setComposeOpen(false)}
        onCreated={refresh}
      />
      <BountyDetail
        bounty={detail} onClose={() => setDetail(null)}
        userId={userId} onChanged={refresh}
      />
    </div>
  );
}

function BountyCard({
  b, index, userId, onOpen,
}: { b: Bounty; index: number; userId: string; onOpen: () => void }) {
  const status = STATUS_META[b.status];
  const mine = b.poster_id === userId;
  const claimed = b.claimant_id === userId;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
      transition={{ ...spring, delay: index * 0.03 }}
    >
      <Card className="p-0 overflow-hidden" onClick={onOpen}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                  style={{ color: status.color, background: status.bg }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
                  {status.label}
                </span>
                {b.language && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#7A7A7A] font-bold">
                    <span className="w-2 h-2 rounded-full" style={{ background: langColor(b.language) }} />
                    {b.language}
                  </span>
                )}
                {mine && <span className="text-[9px] font-black uppercase tracking-widest text-[#C5A059]">yours</span>}
                {claimed && !mine && <span className="text-[9px] font-black uppercase tracking-widest text-[#3B82F6]">claimed</span>}
              </div>
              <h4 className="font-bold text-[15px] leading-snug line-clamp-2">{b.title}</h4>
            </div>
            <div className="shrink-0 text-right">
              <div className="inline-flex items-center gap-1 bg-[#C5A059]/10 text-[#C5A059] px-2.5 py-1 rounded-lg border border-[#C5A059]/20">
                <Icon name="Coins" size={11} />
                <span className="text-[13px] font-black tracking-tight">{b.amount}</span>
              </div>
            </div>
          </div>
          {b.description && (
            <p className="text-[12.5px] text-[#7A7A7A] line-clamp-2 leading-relaxed mb-3">{b.description}</p>
          )}
          <div className="flex items-center gap-2">
            <Avatar src={b.poster_avatar || undefined} seed={b.poster_id} size={20} />
            <span className="text-[11px] text-[#7A7A7A] font-bold truncate">
              {b.poster_github ? `@${b.poster_github}` : "Anonymous"} · {b.difficulty}
            </span>
            <div className="flex-1" />
            <Icon name="ChevronRight" size={14} className="text-[#C5A059]" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function BountyComposer({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<any>({ amount: 100, difficulty: "Medium" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ amount: 100, difficulty: "Medium" }); }, [open]);

  const submit = async (): Promise<void> => {
    if (!form.title?.trim()) { toast.error("Title required"); return; }
    const amt = parseInt(String(form.amount));
    if (!isFinite(amt) || amt <= 0) { toast.error("Amount must be > 0"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_bounty", {
        p_title: form.title.trim(),
        p_description: form.description || "",
        p_amount: amt,
        p_repo_url: form.repo_url || null,
        p_language: form.language || null,
        p_difficulty: form.difficulty || "Medium",
      });
      if (error) throw error;
      toast.success(`Bounty posted — ${amt} credits locked in escrow`);
      onCreated(); onClose();
    } catch (e: any) {
      const msg = e.message?.includes("insufficient credits")
        ? "Not enough credits to escrow this bounty"
        : e.message || "Could not post";
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Post a Bounty">
      <div className="rounded-xl bg-[#FAF9F6] border border-[#E5E3DB] p-3 text-[12px] text-[#7A7A7A] leading-relaxed flex items-start gap-2">
        <Icon name="Lock" size={14} className="text-[#C5A059] mt-0.5 shrink-0" />
        Credits are <b>locked in escrow</b> when you post. They release to the claimant only after you approve their submission, or refund to you on cancel.
      </div>
      <Field label="Title">
        <input className={inputCls} placeholder="Fix flaky webhook retry in payments-api"
          value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
      </Field>
      <Field label="Description">
        <textarea rows={4} className={cn(inputCls, "resize-y")}
          placeholder="What needs to happen, acceptance criteria, links…"
          value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (credits)">
          <input type="number" min={1} className={inputCls}
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="Difficulty">
          <select className={inputCls} value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            <option>Easy</option><option>Medium</option><option>Hard</option><option>Expert</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Language">
          <input className={inputCls} placeholder="TypeScript"
            value={form.language || ""} onChange={(e) => setForm({ ...form, language: e.target.value })} />
        </Field>
        <Field label="Repo URL (optional)">
          <input className={inputCls} placeholder="https://github.com/…"
            value={form.repo_url || ""} onChange={(e) => setForm({ ...form, repo_url: e.target.value })} />
        </Field>
      </div>
      <Button onClick={submit} disabled={busy} className="w-full mt-1">
        {busy ? "Locking escrow…" : `Post & Lock ${form.amount || 0} credits`}
      </Button>
    </Sheet>
  );
}

function BountyDetail({
  bounty, onClose, userId, onChanged,
}: { bounty: Bounty | null; onClose: () => void; userId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState({ url: "", notes: "" });

  // Milestones
  const [milestones, setMilestones] = useState<any[]>([]);
  const [msLoading, setMsLoading] = useState(false);
  const [newMs, setNewMs] = useState("");
  const [addingMs, setAddingMs] = useState(false);

  // Watchers
  const [watcherCount, setWatcherCount] = useState(0);
  const [isWatching, setIsWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);

  // Dispute
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeForm, setDisputeForm] = useState({ reason: "non_delivery", details: "" });
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [existingDispute, setExistingDispute] = useState<any>(null);

  useEffect(() => {
    if (!bounty) return;
    setSubmission({ url: bounty.submission_url || "", notes: bounty.submission_notes || "" });
    setMilestones([]);
    setWatcherCount(0);
    setIsWatching(false);
    setExistingDispute(null);
    loadExtras(bounty.id);
  }, [bounty?.id]);

  const loadExtras = async (bountyId: string) => {
    setMsLoading(true);
    try {
      const [msRes, wcRes, myWatchRes, dispRes] = await Promise.all([
        supabase.from("bounty_milestones").select("*").eq("bounty_id", bountyId).order("sort_order"),
        supabase.from("bounty_watchers").select("user_id", { count: "exact", head: true }).eq("bounty_id", bountyId),
        supabase.from("bounty_watchers").select("user_id").eq("bounty_id", bountyId).eq("user_id", userId).maybeSingle(),
        supabase.from("bounty_disputes").select("*").eq("bounty_id", bountyId).eq("filer_id", userId).maybeSingle(),
      ]);
      setMilestones(msRes.data || []);
      setWatcherCount((wcRes as any).count || 0);
      setIsWatching(!!myWatchRes.data);
      setExistingDispute(dispRes.data);
    } catch {}
    setMsLoading(false);
  };

  if (!bounty) return null;

  const status    = STATUS_META[bounty.status];
  const isPoster  = bounty.poster_id === userId;
  const isClaimant = bounty.claimant_id === userId;
  const canClaim  = !isPoster && bounty.status === "open";
  const canSubmit = isClaimant && (bounty.status === "claimed" || bounty.status === "submitted");
  const canApprove = isPoster && bounty.status === "submitted";
  const canCancel = isPoster && (bounty.status === "open" || bounty.status === "claimed");
  const canDispute = (isPoster || isClaimant) && bounty.status === "submitted" && !existingDispute;

  const completedMs = milestones.filter((m) => m.completed).length;
  const totalMs = milestones.length;

  const run = async (fn: () => PromiseLike<any>, msg: string) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast.success(msg);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally { setBusy(false); }
  };

  const toggleWatch = async () => {
    setWatchBusy(true);
    try {
      if (isWatching) {
        await supabase.from("bounty_watchers").delete().eq("bounty_id", bounty.id).eq("user_id", userId);
        setIsWatching(false);
        setWatcherCount((c) => Math.max(0, c - 1));
        toast("Unwatched");
      } else {
        await supabase.from("bounty_watchers").insert({ bounty_id: bounty.id, user_id: userId });
        setIsWatching(true);
        setWatcherCount((c) => c + 1);
        toast.success("Watching — you'll see updates");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
    setWatchBusy(false);
  };

  const addMilestone = async () => {
    if (!newMs.trim()) return;
    setAddingMs(true);
    try {
      const { data, error } = await supabase.from("bounty_milestones").insert({
        bounty_id: bounty.id,
        title: newMs.trim(),
        sort_order: milestones.length,
      }).select().single();
      if (error) throw error;
      setMilestones((prev) => [...prev, data]);
      setNewMs("");
    } catch (e: any) {
      toast.error(e.message || "Failed to add milestone");
    }
    setAddingMs(false);
  };

  const toggleMilestone = async (ms: any) => {
    const updated = !ms.completed;
    setMilestones((prev) => prev.map((m) => m.id === ms.id ? { ...m, completed: updated, completed_at: updated ? new Date().toISOString() : null } : m));
    try {
      await supabase.from("bounty_milestones").update({ completed: updated, completed_at: updated ? new Date().toISOString() : null }).eq("id", ms.id);
    } catch {
      setMilestones((prev) => prev.map((m) => m.id === ms.id ? { ...m, completed: ms.completed } : m));
    }
  };

  const fileDispute = async () => {
    if (!disputeForm.reason) return;
    setDisputeBusy(true);
    try {
      const { data, error } = await supabase.from("bounty_disputes").insert({
        bounty_id: bounty.id,
        filer_id: userId,
        reason: disputeForm.reason,
        details: disputeForm.details || null,
      }).select().single();
      if (error) throw error;
      setExistingDispute(data);
      setDisputeOpen(false);
      toast.success("Dispute filed — admin will review within 48h");
    } catch (e: any) {
      toast.error(e.message || "Failed to file dispute");
    }
    setDisputeBusy(false);
  };

  const escrowColor = bounty.status === "open" || bounty.status === "claimed" ? "#F59E0B"
    : bounty.status === "submitted" ? "#3B82F6"
    : bounty.status === "approved" ? "#10B981"
    : "#7A7A7A";
  const escrowLabel = bounty.status === "open" || bounty.status === "claimed" ? "Locked in Escrow"
    : bounty.status === "submitted" ? "Pending Release"
    : bounty.status === "approved" ? "Released"
    : "Refunded";

  const actionBar = (
    <BountyActionBar
      bounty={bounty}
      busy={busy}
      canClaim={canClaim}
      canApprove={canApprove}
      canCancel={canCancel}
      run={run}
    />
  );

  return (
    <Sheet open={!!bounty} onClose={onClose} title="Bounty" footer={actionBar}>
      {/* ── Hero header ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-[#E5E3DB] bg-gradient-to-br from-[#1A1A1A] to-[#0F0F0F] text-white p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                style={{ color: status.color, background: status.bg }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
                {status.label}
              </span>
              {bounty.language && (
                <span className="inline-flex items-center gap-1 text-[10px] text-white/60 font-bold">
                  <span className="w-2 h-2 rounded-full" style={{ background: langColor(bounty.language) }} />
                  {bounty.language}
                </span>
              )}
              <span className="text-[10px] text-white/40 font-bold">{bounty.difficulty}</span>
            </div>
            <h2 className="text-[18px] font-black tracking-tight leading-tight text-white">{bounty.title}</h2>
          </div>
          <div className="shrink-0 text-right">
            <div className="inline-flex items-center gap-1.5 bg-[#C5A059]/20 text-[#C5A059] px-3 py-1.5 rounded-xl border border-[#C5A059]/30">
              <Icon name="Coins" size={14} />
              <span className="text-[17px] font-black">{bounty.amount}</span>
            </div>
          </div>
        </div>

        {/* Escrow status + watcher */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
            style={{ background: escrowColor + "22", color: escrowColor }}
          >
            <Icon name="Lock" size={11} />
            {escrowLabel}
          </div>
          <div className="flex-1" />
          <button
            onClick={toggleWatch}
            disabled={watchBusy}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              isWatching ? "bg-[#C5A059]/20 text-[#C5A059]" : "bg-white/10 text-white/60 hover:bg-white/20"
            )}
          >
            <Icon name={isWatching ? "Eye" : "EyeOff"} size={11} />
            {watcherCount} {watcherCount === 1 ? "watcher" : "watchers"}
          </button>
        </div>
      </div>

      {/* ── Description ─────────────────────────────────────────── */}
      {bounty.description && (
        <p className="text-[13px] text-[#202020]/80 leading-relaxed whitespace-pre-wrap">{bounty.description}</p>
      )}
      {bounty.repo_url && (
        <a href={bounty.repo_url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#C5A059] hover:underline">
          <Icon name="GitBranch" size={13} /> {bounty.repo_url.replace(/^https?:\/\//, "")}
        </a>
      )}

      {/* ── Milestones ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#E5E3DB] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E3DB] bg-[#FAF9F6]">
          <div className="flex items-center gap-2">
            <Icon name="ListChecks" size={14} className="text-[#C5A059]" />
            <span className="text-[11px] font-black uppercase tracking-widest">Milestones</span>
          </div>
          {totalMs > 0 && (
            <span className="text-[10px] font-black text-[#C5A059]">{completedMs}/{totalMs} done</span>
          )}
        </div>

        {/* Progress bar */}
        {totalMs > 0 && (
          <div className="h-1.5 bg-[#E5E3DB]">
            <div
              className="h-full bg-[#C5A059] transition-all duration-500 rounded-r-full"
              style={{ width: `${totalMs > 0 ? (completedMs / totalMs) * 100 : 0}%` }}
            />
          </div>
        )}

        <div className="p-3 space-y-1.5">
          {msLoading ? (
            <div className="py-4 flex items-center justify-center">
              <Icon name="Loader2" size={16} className="animate-spin text-[#C5A059]" />
            </div>
          ) : milestones.length === 0 ? (
            <p className="text-[11px] text-[#7A7A7A] text-center py-3">
              {isPoster ? "Break this bounty into milestones below." : "No milestones defined yet."}
            </p>
          ) : (
            milestones.map((ms) => (
              <div key={ms.id} className="flex items-start gap-2.5">
                <button
                  onClick={() => isPoster && toggleMilestone(ms)}
                  disabled={!isPoster}
                  className={cn(
                    "w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                    ms.completed
                      ? "bg-[#10B981] border-[#10B981]"
                      : "border-[#E5E3DB] bg-white",
                    isPoster ? "cursor-pointer hover:border-[#10B981]" : "cursor-default"
                  )}
                  style={{ width: 18, height: 18 }}
                >
                  {ms.completed && <Icon name="Check" size={10} color="white" />}
                </button>
                <span className={cn("text-[12px] leading-relaxed flex-1", ms.completed ? "line-through text-[#7A7A7A]" : "text-[#202020]")}>
                  {ms.title}
                </span>
              </div>
            ))
          )}

          {/* Add milestone (poster only, bounty open/claimed) */}
          {isPoster && (bounty.status === "open" || bounty.status === "claimed") && (
            <div className="flex items-center gap-2 pt-1">
              <input
                className="flex-1 bg-[#FAF9F6] border border-[#E5E3DB] px-2.5 py-1.5 rounded-lg text-[12px] outline-none focus:border-[#C5A059] transition-colors"
                placeholder="Add a milestone…"
                value={newMs}
                onChange={(e) => setNewMs(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              />
              <button
                onClick={addMilestone}
                disabled={addingMs || !newMs.trim()}
                className="px-3 py-1.5 bg-[#C5A059] text-white rounded-lg text-[11px] font-bold disabled:opacity-50"
              >
                {addingMs ? "…" : "Add"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Poster & Claimant ───────────────────────────────────── */}
      <div className="rounded-xl border border-[#E5E3DB] bg-[#FAF9F6] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Avatar src={bounty.poster_avatar || undefined} seed={bounty.poster_id} size={24} />
          <div className="text-[11px] text-[#7A7A7A] flex-1">
            Posted by <b className="text-[#202020]">{bounty.poster_github ? `@${bounty.poster_github}` : "anon"}</b>
          </div>
          <span className="text-[10px] text-[#7A7A7A]">{new Date(bounty.created_at).toLocaleDateString()}</span>
        </div>
        {bounty.claimant_id && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#E5E3DB]">
            <Avatar src={bounty.claimant_avatar || undefined} seed={bounty.claimant_id} size={24} />
            <div className="text-[11px] text-[#7A7A7A] flex-1">
              Claimed by <b className="text-[#202020]">{bounty.claimant_github ? `@${bounty.claimant_github}` : "anon"}</b>
            </div>
            {bounty.claimed_at && <span className="text-[10px] text-[#7A7A7A]">{new Date(bounty.claimed_at).toLocaleDateString()}</span>}
          </div>
        )}
      </div>

      {/* ── Activity timeline ───────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] px-1">Timeline</p>
        <div className="rounded-xl border border-[#E5E3DB] divide-y divide-[#E5E3DB] overflow-hidden">
          {[
            { date: bounty.created_at, label: "Bounty posted & escrowed", icon: "Rocket", color: "#C5A059" },
            bounty.claimed_at && { date: bounty.claimed_at, label: "Claimed by developer", icon: "Hand", color: "#3B82F6" },
            bounty.submitted_at && { date: bounty.submitted_at, label: "Solution submitted for review", icon: "Send", color: "#F59E0B" },
            bounty.closed_at && bounty.status === "approved" && { date: bounty.closed_at, label: `${bounty.amount} credits released`, icon: "CheckCircle2", color: "#10B981" },
            bounty.closed_at && bounty.status === "cancelled" && { date: bounty.closed_at, label: "Cancelled — credits refunded", icon: "XCircle", color: "#7A7A7A" },
          ].filter(Boolean).map((ev: any, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: ev.color + "20" }}>
                <Icon name={ev.icon} size={11} color={ev.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-[#202020]">{ev.label}</p>
                <p className="text-[10px] text-[#7A7A7A]">{new Date(ev.date).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Submission ──────────────────────────────────────────── */}
      {(canSubmit || bounty.status === "submitted" || bounty.status === "approved") && (
        <div className="rounded-xl border border-[#E5E3DB] p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A]">Submission</div>
          {canSubmit ? (
            <>
              <Field label="Pull Request / Solution URL">
                <input className={inputCls} placeholder="https://github.com/org/repo/pull/123"
                  value={submission.url} onChange={(e) => setSubmission({ ...submission, url: e.target.value })} />
              </Field>
              <Field label="Notes (optional)">
                <textarea rows={3} className={cn(inputCls, "resize-y")}
                  value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} />
              </Field>
              <Button size="sm" variant="outline" className="w-full"
                disabled={busy || !submission.url}
                onClick={() => run(
                  () => supabase.rpc("submit_bounty_work", { p_bounty: bounty.id, p_url: submission.url, p_notes: submission.notes || null }),
                  bounty.status === "submitted" ? "Submission updated" : "Submitted for review"
                )}
              >
                <Icon name="Send" size={12} /> {bounty.status === "submitted" ? "Update submission" : "Submit for review"}
              </Button>
            </>
          ) : (
            <>
              {bounty.submission_url && (
                <a href={bounty.submission_url} target="_blank" rel="noreferrer"
                  className="block text-[12px] font-bold text-[#C5A059] hover:underline break-all">
                  {bounty.submission_url}
                </a>
              )}
              {bounty.submission_notes && (
                <p className="text-[12px] text-[#7A7A7A] whitespace-pre-wrap">{bounty.submission_notes}</p>
              )}
              {bounty.submission_url && <InlineDiffViewer url={bounty.submission_url} />}
            </>
          )}
        </div>
      )}

      {/* ── Dispute ─────────────────────────────────────────────── */}
      {existingDispute && (
        <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} color="#EF4444" className="shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#EF4444]">Dispute Filed</p>
            <p className="text-[11px] text-[#7A7A7A] mt-0.5">Reason: {existingDispute.reason.replace(/_/g, " ")}</p>
            <p className="text-[10px] text-[#7A7A7A] mt-0.5">Status: <b>{existingDispute.status}</b></p>
          </div>
        </div>
      )}

      {canDispute && !existingDispute && (
        <div className="rounded-xl border border-[#E5E3DB] overflow-hidden">
          <button
            onClick={() => setDisputeOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#FAF9F6] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Icon name="AlertTriangle" size={14} color="#F59E0B" />
              <span className="text-[11px] font-black uppercase tracking-widest text-[#7A7A7A]">File a Dispute</span>
            </div>
            <Icon name={disputeOpen ? "ChevronUp" : "ChevronDown"} size={14} className="text-[#7A7A7A]" />
          </button>
          {disputeOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-[#E5E3DB]">
              <Field label="Reason">
                <select
                  className={inputCls}
                  value={disputeForm.reason}
                  onChange={(e) => setDisputeForm({ ...disputeForm, reason: e.target.value })}
                >
                  <option value="non_delivery">Non-delivery</option>
                  <option value="quality_issue">Quality issue</option>
                  <option value="scope_creep">Scope creep</option>
                  <option value="payment_issue">Payment issue</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Details">
                <textarea rows={3} className={cn(inputCls, "resize-y")}
                  placeholder="Describe the issue clearly…"
                  value={disputeForm.details}
                  onChange={(e) => setDisputeForm({ ...disputeForm, details: e.target.value })}
                />
              </Field>
              <Button size="sm" className="w-full" disabled={disputeBusy} onClick={fileDispute}>
                <Icon name="Flag" size={12} /> {disputeBusy ? "Filing…" : "Submit Dispute"}
              </Button>
            </div>
          )}
        </div>
      )}

    </Sheet>
  );
}

function BountyActionBar({ bounty, busy, canClaim, canApprove, canCancel, run }: {
  bounty: Bounty; busy: boolean;
  canClaim: boolean; canApprove: boolean; canCancel: boolean;
  run: (fn: () => PromiseLike<any>, msg: string) => void;
}) {
  if (!canClaim && !canApprove && !canCancel && bounty.status !== "approved" && bounty.status !== "cancelled") return null;
  return (
    <div className="flex flex-col gap-2">
      {canClaim && (
        <Button disabled={busy} className="w-full"
          onClick={() => run(() => supabase.rpc("claim_bounty", { p_bounty: bounty.id }), "Bounty claimed — start building!")}>
          <Icon name="Hand" size={13} /> Claim this bounty
        </Button>
      )}
      {canApprove && (
        <Button disabled={busy} className="w-full"
          onClick={() => run(() => supabase.rpc("approve_bounty", { p_bounty: bounty.id }), `Approved — ${bounty.amount} credits released`)}>
          <Icon name="Check" size={13} /> Approve & release {bounty.amount} credits
        </Button>
      )}
      {canCancel && (
        <Button variant="ghost" disabled={busy} className="w-full"
          onClick={() => run(() => supabase.rpc("cancel_bounty", { p_bounty: bounty.id }), "Bounty cancelled — credits refunded")}>
          <Icon name="X" size={13} /> Cancel & refund
        </Button>
      )}
      {bounty.status === "approved" && (
        <div className="text-center text-[11px] font-bold uppercase tracking-widest text-[#C5A059]">
          <Icon name="CheckCircle2" size={14} className="inline mr-1.5" />
          Paid · closed {bounty.closed_at && new Date(bounty.closed_at).toLocaleDateString()}
        </div>
      )}
      {bounty.status === "cancelled" && (
        <div className="text-center text-[11px] font-bold uppercase tracking-widest text-[#7A7A7A]">Cancelled — Credits Refunded</div>
      )}
    </div>
  );
}
