import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, cn } from "../../components/UI";
import { toast } from "sonner";

const TOOL_CATEGORIES = [
  { label: "Frontend", color: "#3B82F6", tools: ["React", "Next.js", "Vue", "Svelte", "Angular", "Vite", "Tailwind CSS"] },
  { label: "Backend", color: "#10B981", tools: ["Node.js", "Express", "FastAPI", "Django", "Rails", "Go", "Rust"] },
  { label: "Database", color: "#F59E0B", tools: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase", "PlanetScale"] },
  { label: "Cloud", color: "#8B5CF6", tools: ["Vercel", "AWS", "GCP", "Fly.io", "Railway", "Render", "Hetzner"] },
  { label: "Mobile", color: "#EC4899", tools: ["React Native", "Expo", "Flutter", "Swift", "Kotlin"] },
  { label: "AI/ML", color: "#C5A059", tools: ["OpenAI", "Anthropic", "LangChain", "HuggingFace", "PyTorch", "TensorFlow"] },
];

interface Stack {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  tools: Record<string, string[]>;
  upvotes_count: number;
  created_at: string;
  user_voted?: boolean;
  creator_name?: string;
  creator_avatar?: string;
  creator_username?: string;
}

function StackCard({ stack, currentUserId, onVote }: { stack: Stack; currentUserId?: string; onVote: () => void }) {
  const [voted, setVoted] = useState(stack.user_voted);
  const [count, setCount] = useState(stack.upvotes_count || 0);
  const [expanded, setExpanded] = useState(false);

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { toast.error("Sign in to upvote"); return; }
    const newVoted = !voted;
    setVoted(newVoted);
    setCount((c) => c + (newVoted ? 1 : -1));
    onVote();
    if (newVoted) {
      await supabase.from("stack_upvotes").insert({ stack_id: stack.id, user_id: currentUserId });
    } else {
      await supabase.from("stack_upvotes").delete().eq("stack_id", stack.id).eq("user_id", currentUserId);
    }
    await supabase.from("dev_stacks").update({ upvotes_count: count + (newVoted ? 1 : -1) }).eq("id", stack.id);
  };

  const allTools = Object.values(stack.tools || {}).flat();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#E5E3DB] rounded-2xl overflow-hidden hover:border-[#C5A059]/40 transition-all"
    >
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black text-[14px] text-[#202020]">{stack.name}</h3>
              <button
                onClick={handleVote}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[11px] font-black transition-all tap-scale",
                  voted
                    ? "border-[#C5A059] bg-[#C5A059]/10 text-[#C5A059]"
                    : "border-[#E5E3DB] text-[#7A7A7A] hover:border-[#C5A059]/40"
                )}
              >
                <Icon name="ChevronUp" size={12} />
                {count}
              </button>
            </div>
            {stack.description && (
              <p className="text-[11px] text-[#7A7A7A] mt-1 line-clamp-2">{stack.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {allTools.slice(0, 6).map((t) => {
                const cat = TOOL_CATEGORIES.find((c) => c.tools.includes(t));
                return (
                  <span
                    key={t}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: cat?.color || "#C5A059", background: `${cat?.color || "#C5A059"}18` }}
                  >
                    {t}
                  </span>
                );
              })}
              {allTools.length > 6 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F3F1EC] text-[#7A7A7A]">
                  +{allTools.length - 6} more
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Avatar src={stack.creator_avatar} seed={stack.user_id} size={18} className="rounded-full" />
          <span className="text-[10px] text-[#7A7A7A] font-bold">{stack.creator_name || stack.creator_username}</span>
          <Icon name="ChevronDown" size={12} className={cn("ml-auto text-[#7A7A7A] transition-transform", expanded && "rotate-180")} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[#F3F1EC]"
          >
            <div className="p-4 space-y-3">
              {TOOL_CATEGORIES.filter((cat) => (stack.tools || {})[cat.label]?.length).map((cat) => (
                <div key={cat.label}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: cat.color }}>
                    {cat.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {((stack.tools || {})[cat.label] || []).map((t: string) => (
                      <span
                        key={t}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                        style={{ borderColor: `${cat.color}40`, color: cat.color, background: `${cat.color}10` }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StackCompose({ currentUserId, onDone }: { currentUserId?: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const toggleTool = (cat: string, tool: string) => {
    setSelected((prev) => {
      const cur = prev[cat] || [];
      return {
        ...prev,
        [cat]: cur.includes(tool) ? cur.filter((t) => t !== tool) : [...cur, tool],
      };
    });
  };

  const submit = async () => {
    if (!currentUserId || !name.trim()) return;
    const allSelected = Object.values(selected).flat();
    if (allSelected.length < 2) { toast.error("Pick at least 2 tools"); return; }
    setSubmitting(true);
    try {
      await supabase.from("dev_stacks").insert({
        user_id: currentUserId,
        name: name.trim(),
        description: description.trim() || null,
        tools: selected,
        upvotes_count: 0,
      });
      toast.success("Stack shared!");
      onDone();
    } catch {
      toast.error("Could not share — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#C5A059]/30 rounded-2xl p-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#C5A059] flex items-center justify-center">
          <Icon name="Layers" size={14} color="white" />
        </div>
        <h3 className="font-black text-[13px]">Share Your Stack</h3>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Stack name (e.g. My SaaS Stack) *"
        className="w-full text-[13px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2.5 outline-none font-medium focus:border-[#C5A059]"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What do you use it for?"
        className="w-full text-[12px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2.5 outline-none font-medium focus:border-[#C5A059]"
      />

      <div className="space-y-3">
        {TOOL_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: cat.color }}>{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.tools.map((tool) => {
                const active = (selected[cat.label] || []).includes(tool);
                return (
                  <button
                    key={tool}
                    onClick={() => toggleTool(cat.label, tool)}
                    className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                      active ? "border-transparent text-white" : "border-[#E5E3DB] text-[#7A7A7A] hover:border-[#C5A059]/30"
                    )}
                    style={active ? { background: cat.color } : {}}
                  >
                    {tool}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={submitting || !name.trim()} className="flex-1">
          {submitting ? "Sharing…" : "Share Stack"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </motion.div>
  );
}

export function StacksPanel({ currentUserId }: { currentUserId?: string }) {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("v_dev_stacks")
        .select("*")
        .order("upvotes_count", { ascending: false })
        .limit(30);

      if (data && currentUserId) {
        const ids = data.map((s: any) => s.id);
        const { data: votes } = await supabase
          .from("stack_upvotes")
          .select("stack_id")
          .eq("user_id", currentUserId)
          .in("stack_id", ids);
        const votedSet = new Set((votes || []).map((v: any) => v.stack_id));
        setStacks(data.map((s: any) => ({ ...s, user_voted: votedSet.has(s.id) })));
      } else {
        setStacks(data || []);
      }
    } catch {
      setStacks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [currentUserId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-[16px] text-[#202020]">Tech Stacks</h2>
          <p className="text-[11px] text-[#7A7A7A] font-medium mt-0.5">What the legion is shipping with</p>
        </div>
        <Button size="sm" onClick={() => setComposeOpen(true)} className="gap-1.5">
          <Icon name="Plus" size={13} />
          Share Stack
        </Button>
      </div>

      <AnimatePresence>
        {composeOpen && (
          <StackCompose
            currentUserId={currentUserId}
            onDone={() => { setComposeOpen(false); fetch(); }}
          />
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-[#F3F1EC] rounded-2xl animate-pulse" />)}
        </div>
      ) : stacks.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F3F1EC] flex items-center justify-center mx-auto mb-3">
            <Icon name="Layers" size={24} className="text-[#C5A059]" />
          </div>
          <p className="font-black text-[13px]">No stacks shared yet</p>
          <p className="text-[11px] text-[#7A7A7A] mt-1">Share your tech stack with the community</p>
          <Button size="sm" className="mt-4" onClick={() => setComposeOpen(true)}>Share Your Stack</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {stacks.map((s) => (
            <StackCard key={s.id} stack={s} currentUserId={currentUserId} onVote={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
