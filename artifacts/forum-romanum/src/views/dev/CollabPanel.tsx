import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Card, Avatar, Button, Icon, Badge, cn } from "../../components/UI";
import { toast } from "sonner";

const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  idea:   { label: "Idea",   color: "#8B5CF6", bg: "#8B5CF6/10" },
  mvp:    { label: "MVP",    color: "#F59E0B", bg: "#F59E0B/10" },
  growth: { label: "Growth", color: "#10B981", bg: "#10B981/10" },
  scale:  { label: "Scale",  color: "#3B82F6", bg: "#3B82F6/10" },
};

const ROLE_COLORS: Record<string, string> = {
  Developer: "#3B82F6",
  Designer: "#EC4899",
  Marketer: "#F59E0B",
  "Product Manager": "#8B5CF6",
  Founder: "#C5A059",
  Investor: "#10B981",
  Advisor: "#6B7280",
  Writer: "#14B8A6",
  DevOps: "#F97316",
  "Data Scientist": "#6366F1",
};

const ROLE_OPTIONS = Object.keys(ROLE_COLORS);

function timeAgo(d: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function CollabCard({
  req,
  currentUserId,
  onUpvote,
}: {
  req: any;
  currentUserId?: string;
  onUpvote: (id: string) => void;
}) {
  const [voted, setVoted] = useState(req.user_voted);
  const [count, setCount] = useState(req.upvotes_count || 0);
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");
  const stage = STAGE_META[req.project_stage] || STAGE_META.idea;

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { toast.error("Sign in to express interest"); return; }
    const newVoted = !voted;
    setVoted(newVoted);
    setCount((c: number) => c + (newVoted ? 1 : -1));
    onUpvote(req.id);
    if (newVoted) {
      await supabase.from("collab_upvotes").insert({ request_id: req.id, user_id: currentUserId });
    } else {
      await supabase.from("collab_upvotes").delete().eq("request_id", req.id).eq("user_id", currentUserId);
    }
    await supabase.from("collab_requests").update({ upvotes_count: count + (newVoted ? 1 : -1) }).eq("id", req.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#E5E3DB] rounded-2xl overflow-hidden hover:border-[#C5A059]/40 transition-all"
    >
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <Avatar src={req.creator_avatar} seed={req.user_id} size={36} className="rounded-full shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 justify-between">
              <div className="min-w-0">
                <h3 className="font-black text-[13px] text-[#202020] leading-tight">{req.title}</h3>
                <p className="text-[11px] text-[#7A7A7A] mt-0.5">{req.creator_name || req.creator_username}</p>
              </div>
              <button
                onClick={handleVote}
                className={cn(
                  "shrink-0 flex flex-col items-center justify-center w-11 h-12 rounded-xl border-2 transition-all tap-scale",
                  voted
                    ? "border-[#C5A059] bg-[#C5A059]/10 text-[#C5A059]"
                    : "border-[#E5E3DB] bg-white text-[#7A7A7A] hover:border-[#C5A059]/50"
                )}
              >
                <Icon name="Heart" size={14} className={voted ? "fill-[#C5A059] text-[#C5A059]" : ""} />
                <span className="text-[10px] font-black mt-0.5">{count}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span
                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
                style={{ color: stage.color, background: `${stage.color}18` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: stage.color }} />
                {stage.label}
              </span>
              {req.equity_offered && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full text-purple-600 bg-purple-50">Equity</span>
              )}
              {req.paid && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full text-emerald-600 bg-emerald-50">Paid</span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {(req.roles_needed || []).slice(0, 4).map((role: string) => (
                <span
                  key={role}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ color: ROLE_COLORS[role] || "#C5A059", background: `${ROLE_COLORS[role] || "#C5A059"}18` }}
                >
                  {role}
                </span>
              ))}
              {(req.roles_needed || []).length > 4 && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full text-[#7A7A7A] bg-[#F3F1EC]">
                  +{req.roles_needed.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-[#F3F1EC]">
              {req.description && (
                <p className="text-[12px] text-[#555] leading-relaxed mt-3">{req.description}</p>
              )}
              {(req.tech_stack || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {req.tech_stack.map((t: string) => (
                    <span key={t} className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#F3F1EC] text-[#555]">{t}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[10px] text-[#7A7A7A]">{timeAgo(req.created_at)}</span>
                {req.company_name && (
                  <span className="text-[10px] text-[#7A7A7A] flex items-center gap-1">
                    <Icon name="Building2" size={10} /> {req.company_name}
                  </span>
                )}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!currentUserId) { toast.error("Sign in to connect"); return; }
                    if (connected) return;
                    setShowConnectForm(!showConnectForm);
                  }}
                  disabled={connected}
                  className={cn(
                    "ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    connected
                      ? "bg-[#10B981]/10 text-[#10B981]"
                      : "bg-[#C5A059]/10 text-[#C5A059] hover:bg-[#C5A059]/20"
                  )}
                >
                  <Icon name={connected ? "CheckCircle2" : "UserPlus"} size={11} />
                  {connected ? "Requested" : "Connect"}
                </button>
              </div>

              <AnimatePresence>
                {showConnectForm && !connected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-2">
                      <textarea
                        value={connectMsg}
                        onChange={(e) => setConnectMsg(e.target.value)}
                        placeholder={`Introduce yourself to ${req.creator_name || "the founder"} — what's your background and how can you contribute?`}
                        rows={2}
                        className="w-full text-[12px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2 outline-none font-medium focus:border-[#C5A059] resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!currentUserId) return;
                            setConnecting(true);
                            try {
                              await supabase.from("notifications").insert({
                                user_id: req.user_id,
                                kind: "collab_connect",
                                title: "New Collab Request",
                                body: connectMsg.trim() || `Someone is interested in joining your "${req.title}" project.`,
                                actor_id: currentUserId,
                                metadata: { collab_request_id: req.id },
                              });
                              setConnected(true);
                              setShowConnectForm(false);
                              toast.success("Connection request sent!");
                            } catch {
                              toast.error("Could not send — try again");
                            } finally {
                              setConnecting(false);
                            }
                          }}
                          disabled={connecting}
                          className="flex-1 py-1.5 rounded-xl bg-[#C5A059] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#B8943F] transition-colors disabled:opacity-60"
                        >
                          {connecting ? "Sending…" : "Send Request"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowConnectForm(false); }}
                          className="px-3 py-1.5 rounded-xl bg-[#F3F1EC] text-[#7A7A7A] text-[10px] font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CollabCompose({ currentUserId, onDone }: { currentUserId?: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("mvp");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [techStack, setTechStack] = useState("");
  const [equity, setEquity] = useState(false);
  const [paid, setPaid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleRole = (r: string) =>
    setSelectedRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const submit = async () => {
    if (!currentUserId || !title.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from("collab_requests").insert({
        user_id: currentUserId,
        title: title.trim(),
        description: description.trim() || null,
        project_stage: stage,
        roles_needed: selectedRoles,
        tech_stack: techStack.split(",").map((t) => t.trim()).filter(Boolean),
        equity_offered: equity,
        paid,
        status: "open",
        upvotes_count: 0,
      });
      toast.success("Collab request posted!");
      onDone();
    } catch {
      toast.error("Could not post — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#C5A059]/30 rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-purple-500 flex items-center justify-center">
          <Icon name="Users" size={14} color="white" />
        </div>
        <h3 className="font-black text-[13px] text-[#202020]">Post a Collab Request</h3>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What are you building? *"
        className="w-full text-[13px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2.5 outline-none font-medium focus:border-[#C5A059]"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the project, the vision, what you need..."
        rows={3}
        className="w-full text-[12px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2.5 outline-none font-medium focus:border-[#C5A059] resize-none"
      />

      <div className="flex gap-1.5">
        {(["idea", "mvp", "growth", "scale"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={cn(
              "flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl border-2 transition-all",
              stage === s ? "border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10" : "border-[#E5E3DB] text-[#7A7A7A]"
            )}
          >
            {STAGE_META[s].label}
          </button>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Roles Needed</p>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => toggleRole(r)}
              className={cn(
                "text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                selectedRoles.includes(r)
                  ? "border-transparent text-white"
                  : "border-[#E5E3DB] text-[#7A7A7A]"
              )}
              style={selectedRoles.includes(r) ? { background: ROLE_COLORS[r] || "#C5A059" } : {}}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <input
        value={techStack}
        onChange={(e) => setTechStack(e.target.value)}
        placeholder="Tech stack (comma separated: React, Node, Postgres…)"
        className="w-full text-[12px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2.5 outline-none font-medium focus:border-[#C5A059]"
      />

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-[11px] font-bold cursor-pointer">
          <input type="checkbox" checked={equity} onChange={(e) => setEquity(e.target.checked)} className="accent-purple-500" />
          Equity offered
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold cursor-pointer">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-emerald-500" />
          Paid role
        </label>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={submitting || !title.trim()} className="flex-1">
          {submitting ? "Posting…" : "Post Request"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </motion.div>
  );
}

export function CollabPanel({
  currentUserId,
  forceCompose,
  onComposeClose,
}: {
  currentUserId?: string;
  forceCompose?: boolean;
  onComposeClose?: () => void;
}) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      let q = supabase.from("v_collab_requests").select("*").eq("status", "open").order("upvotes_count", { ascending: false });
      if (stageFilter) q = q.eq("project_stage", stageFilter);
      const { data } = await q.limit(30);
      if (data && currentUserId) {
        const ids = data.map((r: any) => r.id);
        if (ids.length) {
          const { data: votes } = await supabase
            .from("collab_upvotes")
            .select("request_id")
            .eq("user_id", currentUserId)
            .in("request_id", ids);
          const votedSet = new Set((votes || []).map((v: any) => v.request_id));
          const filtered = roleFilter
            ? data.filter((r: any) => (r.roles_needed || []).includes(roleFilter))
            : data;
          setRequests(filtered.map((r: any) => ({ ...r, user_voted: votedSet.has(r.id) })));
        } else {
          setRequests([]);
        }
      } else {
        const filtered = roleFilter && data
          ? data.filter((r: any) => (r.roles_needed || []).includes(roleFilter))
          : data || [];
        setRequests(filtered);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [stageFilter, roleFilter, currentUserId]);
  useEffect(() => { if (forceCompose) setComposeOpen(true); }, [forceCompose]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-[16px] text-[#202020]">Collab Board</h2>
          <p className="text-[11px] text-[#7A7A7A] font-medium mt-0.5">Find co-founders, teammates & contributors</p>
        </div>
        <Button size="sm" onClick={() => setComposeOpen(true)} className="gap-1.5 bg-purple-500 hover:bg-purple-600">
          <Icon name="Plus" size={13} />
          Post
        </Button>
      </div>

      <AnimatePresence>
        {composeOpen && (
          <CollabCompose
            currentUserId={currentUserId}
            onDone={() => { setComposeOpen(false); onComposeClose?.(); fetch(); }}
          />
        )}
      </AnimatePresence>

      {/* Stage filter */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setStageFilter(null)}
          className={cn(
            "shrink-0 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all",
            !stageFilter ? "bg-[#202020] text-white" : "bg-[#F3F1EC] text-[#7A7A7A]"
          )}
        >All</button>
        {Object.entries(STAGE_META).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setStageFilter(stageFilter === k ? null : k)}
            className={cn(
              "shrink-0 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all",
              stageFilter === k ? "text-white" : "bg-[#F3F1EC] text-[#7A7A7A]"
            )}
            style={stageFilter === k ? { background: v.color } : {}}
          >{v.label}</button>
        ))}
      </div>

      {/* Role filter */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setRoleFilter(null)}
          className={cn(
            "shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all",
            !roleFilter ? "border-[#202020] text-[#202020]" : "border-[#E5E3DB] text-[#7A7A7A]"
          )}
        >Any Role</button>
        {ROLE_OPTIONS.slice(0, 6).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(roleFilter === r ? null : r)}
            className={cn(
              "shrink-0 text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all",
              roleFilter === r ? "border-transparent text-white" : "border-[#E5E3DB] text-[#7A7A7A]"
            )}
            style={roleFilter === r ? { background: ROLE_COLORS[r] } : {}}
          >{r}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-[#F3F1EC] rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F3F1EC] flex items-center justify-center mx-auto mb-3">
            <Icon name="Users" size={24} className="text-purple-400" />
          </div>
          <p className="font-black text-[13px] text-[#202020]">No open requests</p>
          <p className="text-[11px] text-[#7A7A7A] mt-1">Post what you're building and who you need</p>
          <Button size="sm" className="mt-4 bg-purple-500 hover:bg-purple-600" onClick={() => setComposeOpen(true)}>
            Post Collab Request
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <CollabCard key={r.id} req={r} currentUserId={currentUserId} onUpvote={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
