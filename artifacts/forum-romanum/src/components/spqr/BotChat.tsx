/**
 * BotChat — Full-featured SPQR Oracle chat UI.
 * Theme: cream / gold / black (matching Hatch app).
 *
 * Features:
 *  - Animated WorkflowMap showing every agent tool in real time
 *  - Copy / Share / Edit / Delete / Pin / Undo buttons per message
 *  - Smart context-aware follow-up suggestion chips after every response
 *  - Error cards (styled, not plain text)
 *  - Usage counter indicator
 *  - In-chat file/image upload
 *  - Search inside conversation history
 *  - Multi-step write confirmation: agent asks → user confirms → agent executes
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { supabase } from "../../integrations/supabase/client";
import { SpqrCardList, type SpqrCard } from "./SpqrCards";
import { WorkflowMap, type WorkflowStep } from "./WorkflowMap";
import { Icon } from "../UI";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SpqrMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: SpqrCard[];
  isError?: boolean;
  isPinned?: boolean;
  isDeleted?: boolean;
  timestamp: number;
  imageUrl?: string;
}

type Phase = "idle" | "thinking" | "working" | "composing";

interface AgentEvent {
  type: string;
  label?: string;
  toolName?: string;
  toolIcon?: string;
  step?: number;
  conversationId?: string;
  reply?: string;
  cards?: SpqrCard[];
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SPQR_KEY = "spqr-conversation-id";
const C = {
  bg: "#FAF9F6",
  s1: "#FFFFFF",
  s2: "#F3F1EC",
  border: "#E5E3DB",
  gold: "#C5A059",
  dark: "#8C6A32",
  ink: "#202020",
  muted: "#7A7A7A",
  green: "#10B981",
  red: "#EF4444",
};

// Context-aware suggestions generated from the last assistant reply
function generateSuggestions(reply: string, cards: SpqrCard[] = []): string[] {
  const lower = reply.toLowerCase();
  const hasCards = cards.length > 0;
  const cardType = cards[0]?.type;

  if (cardType === "launch" || lower.includes("launch")) {
    return ["Upvote the top one", "Bookmark this launch", "Who made this?", "Show me the latest launches"];
  }
  if (cardType === "bounty" || lower.includes("bounty") || lower.includes("bounties")) {
    return ["Create a new bounty", "Show open bounties only", "What are the highest-reward bounties?"];
  }
  if (cardType === "stack" || lower.includes("stack")) {
    return ["Create my own dev stack", "Show stacks with React", "Upvote this stack"];
  }
  if (cardType === "user" || lower.includes("follow")) {
    return ["Follow this person", "Show their launches", "Message them"];
  }
  if (lower.includes("post") || lower.includes("feed")) {
    return ["Post something to my feed", "What's trending today?"];
  }
  if (lower.includes("group") || lower.includes("channel")) {
    return ["Create a new group", "Join this group", "Show all channels"];
  }
  if (lower.includes("market") || lower.includes("product")) {
    return ["Show featured products", "Filter by price", "Top rated tools"];
  }
  if (hasCards) {
    return ["Tell me more", "Show the latest", "Show the top ones"];
  }
  return [
    "What's trending today?",
    "Show open bounties",
    "Latest product launches",
    "Create a bounty",
  ];
}

// ── Message actions menu ───────────────────────────────────────────────────────
function MessageActions({
  msg,
  onCopy,
  onPin,
  onDelete,
  onEdit,
  show,
}: {
  msg: SpqrMsg;
  onCopy: () => void;
  onPin: () => void;
  onDelete: () => void;
  onEdit: () => void;
  show: boolean;
}) {
  if (!show) return null;
  const isUser = msg.role === "user";

  const actions = [
    { icon: "Copy" as const, label: "Copy", fn: onCopy },
    { icon: "Pin" as const, label: msg.isPinned ? "Unpin" : "Pin", fn: onPin },
    ...(isUser ? [
      { icon: "Pencil" as const, label: "Edit", fn: onEdit },
      { icon: "Trash2" as const, label: "Delete", fn: onDelete, danger: true },
    ] : [
      { icon: "Share2" as const, label: "Share", fn: () => {
        navigator.clipboard?.writeText(msg.content).catch(() => {});
      }},
    ]),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 4 }}
      transition={{ duration: 0.12 }}
      className="flex gap-1 mt-1"
      style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.fn}
          title={a.label}
          className="w-7 h-7 rounded-full flex items-center justify-center border transition-all active:scale-90"
          style={{
            backgroundColor: (a as any).danger ? `${C.red}10` : C.s2,
            borderColor: (a as any).danger ? `${C.red}30` : C.border,
            color: (a as any).danger ? C.red : C.muted,
          }}
        >
          <Icon name={a.icon} size={12} />
        </button>
      ))}
    </motion.div>
  );
}

// ── Error card ────────────────────────────────────────────────────────────────
function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 bg-[#EF444408] border border-[#EF444430] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]"
    >
      <div className="w-8 h-8 rounded-full bg-[#EF444415] flex items-center justify-center shrink-0 mt-0.5">
        <Icon name="AlertTriangle" size={15} color={C.red} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-[#EF4444] uppercase tracking-widest mb-0.5">Oracle Error</p>
        <p className="text-[13px] text-[#202020] leading-snug">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-[11px] font-bold uppercase tracking-widest text-[#C5A059] flex items-center gap-1"
          >
            <Icon name="RefreshCw" size={10} color={C.gold} />
            Retry
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Pinned message banner ─────────────────────────────────────────────────────
function PinnedBanner({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-4 py-2 border-b text-left transition-colors hover:bg-[#C5A05908]"
      style={{ borderColor: `${C.gold}20`, backgroundColor: `${C.gold}06` }}
    >
      <Icon name="Pin" size={12} color={C.gold} />
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.gold }}>
        {count} pinned {count === 1 ? "message" : "messages"}
      </span>
      <Icon name="ChevronRight" size={10} color={C.gold} />
    </button>
  );
}

// ── SSE parser ────────────────────────────────────────────────────────────────
function parseSseChunk(buffer: string, onEvent: (data: AgentEvent) => void): string {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() || "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore */ }
  }
  return remainder;
}

// ── Unique ID helper ──────────────────────────────────────────────────────────
let _uid = 0;
function uid() { return `m${++_uid}_${Date.now()}`; }

// ── BotChat component ─────────────────────────────────────────────────────────
interface Props {
  onBack: () => void;
}

export function BotChat({ onBack }: Props) {
  const [msgs, setMsgs] = useState<SpqrMsg[]>([{
    id: uid(),
    role: "assistant",
    content: "I am the SPQR Oracle. I have live access to Hatch — launches, bounties, dev stacks, marketplace, your network — and I remember what you tell me across sessions. What do you seek?",
    timestamp: Date.now(),
  }]);
  const [inp, setInp] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentLabel, setCurrentLabel] = useState<string | undefined>();
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [undoStack, setUndoStack] = useState<SpqrMsg[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([
    "What are the top launches right now?",
    "Any open bounties worth checking?",
    "Show me the latest dev stacks",
    "Create a new bounty for me",
  ]);
  const [lastRetry, setLastRetry] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedHistory = useRef(false);
  const activeStepRef = useRef<string | null>(null);

  // Scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, workflowSteps.length]);

  // Load conversation history on mount
  useEffect(() => {
    if (loadedHistory.current) return;
    loadedHistory.current = true;
    const conversationId = localStorage.getItem(SPQR_KEY);
    if (!conversationId) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/spqr/conversations/${conversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.messages) && json.messages.length > 0) {
          setMsgs(json.messages.map((m: any, i: number) => ({
            id: uid(),
            role: m.role,
            content: m.content,
            cards: m.cards,
            timestamp: Date.now() - (json.messages.length - i) * 1000,
          })));
        }
      } catch { /* keep fresh greeting */ }
    })();
  }, []);

  const sendMessage = useCallback(async (text?: string, imageUrl?: string) => {
    const userMsg = (text ?? inp).trim();
    if (!userMsg || busy) return;
    setInp("");
    setUploadPreview(null);
    setIsSearching(false);
    setWorkflowSteps([]);
    setLastRetry(userMsg);

    const userEntry: SpqrMsg = {
      id: uid(), role: "user", content: userMsg,
      imageUrl, timestamp: Date.now(),
    };
    setMsgs((prev) => [...prev, userEntry]);
    setBusy(true);
    setPhase("thinking");
    setCurrentLabel("The Oracle is deliberating…");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMsgs((prev) => [...prev, {
          id: uid(), role: "assistant",
          content: "Sign in to consult the Oracle.",
          isError: true, timestamp: Date.now(),
        }]);
        return;
      }

      const conversationId = localStorage.getItem(SPQR_KEY) || undefined;
      const res = await fetch("/api/spqr/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, conversationId }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "The Oracle is unreachable.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      const activeStepId = uid();

      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseChunk(buffer, (event) => {
          if (event.conversationId) {
            localStorage.setItem(SPQR_KEY, event.conversationId);
          }

          if (event.type === "thinking") {
            setPhase("thinking");
            setCurrentLabel(event.label || "Deliberating…");
          } else if (event.type === "tool_start") {
            setPhase("working");
            setCurrentLabel(event.label);
            const stepId = `${activeStepId}_${event.step}`;
            activeStepRef.current = stepId;
            setWorkflowSteps((prev) => {
              // mark previous active as pending (will be resolved by tool_done)
              const updated = prev.map((s) =>
                s.status === "active" ? { ...s, status: "pending" as const } : s
              );
              return [...updated, {
                id: stepId,
                toolName: event.toolName || "",
                icon: event.toolIcon || "Zap",
                label: event.label || "Working",
                status: "active" as const,
                startedAt: Date.now(),
              }];
            });
          } else if (event.type === "tool_done") {
            setWorkflowSteps((prev) =>
              prev.map((s) =>
                s.status === "active" ? { ...s, status: "done" as const } : s
              )
            );
          } else if (event.type === "composing") {
            setPhase("composing");
            setCurrentLabel("Composing the response…");
          } else if (event.type === "done") {
            const newMsg: SpqrMsg = {
              id: uid(), role: "assistant",
              content: event.reply || "The Oracle is silent.",
              cards: event.cards,
              timestamp: Date.now(),
            };
            setMsgs((prev) => [...prev, newMsg]);
            setSuggestions(generateSuggestions(event.reply || "", event.cards || []));
            finished = true;
          } else if (event.type === "error") {
            setMsgs((prev) => [...prev, {
              id: uid(), role: "assistant",
              content: event.error || "The Oracle is unreachable.",
              isError: true, timestamp: Date.now(),
            }]);
            finished = true;
          }
        });
      }
    } catch (err: any) {
      setMsgs((prev) => [...prev, {
        id: uid(), role: "assistant",
        content: err?.message || "The Oracle is unreachable. Retry.",
        isError: true, timestamp: Date.now(),
      }]);
    } finally {
      setBusy(false);
      setPhase("idle");
      setCurrentLabel(undefined);
      setWorkflowSteps((prev) => prev.map((s) => s.status === "active" ? { ...s, status: "done" as const } : s));
    }
  }, [inp, busy]);

  // ── Message actions ──────────────────────────────────────────────────────
  const copyMsg = (msg: SpqrMsg) => {
    navigator.clipboard?.writeText(msg.content).catch(() => {});
  };

  const pinMsg = (id: string) => {
    setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, isPinned: !m.isPinned } : m));
  };

  const deleteMsg = (id: string) => {
    setMsgs((prev) => {
      const target = prev.find((m) => m.id === id);
      if (target) setUndoStack((u) => [target, ...u.slice(0, 4)]);
      return prev.map((m) => m.id === id ? { ...m, isDeleted: true } : m);
    });
  };

  const undoDelete = () => {
    const last = undoStack[0];
    if (!last) return;
    setUndoStack((u) => u.slice(1));
    setMsgs((prev) => prev.map((m) => m.id === last.id ? { ...m, isDeleted: false } : m));
  };

  const startEdit = (msg: SpqrMsg) => {
    setEditingId(msg.id);
    setEditValue(msg.content);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const newContent = editValue.trim();
    setMsgs((prev) => prev.map((m) => m.id === editingId ? { ...m, content: newContent } : m));
    setEditingId(null);
    setEditValue("");
    // Re-send the edited message
    sendMessage(newContent);
  };

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const visibleMsgs = msgs.filter((m) => !m.isDeleted);
  const pinnedMsgs = visibleMsgs.filter((m) => m.isPinned);
  const searchResults = isSearching && search.trim()
    ? visibleMsgs.filter((m) => m.content.toLowerCase().includes(search.toLowerCase()))
    : visibleMsgs;
  const msgCount = visibleMsgs.length;
  const showSuggestions = !busy && msgCount <= 2;

  // Show undo toast
  const showUndoToast = undoStack.length > 0;

  const scrollToPinned = () => {
    setShowPinned((p) => !p);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: C.bg }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="h-14 border-b flex items-center gap-3 px-4 shrink-0"
        style={{ borderColor: `${C.gold}25`, backgroundColor: `${C.bg}f0`, backdropFilter: "blur(12px)" }}
      >
        <button onClick={onBack} className="p-2 -ml-2 transition-opacity hover:opacity-70">
          <Icon name="ArrowLeft" size={20} color={C.gold} />
        </button>

        {/* Oracle avatar with pulse */}
        <motion.div
          animate={{ boxShadow: busy ? [`0 0 0 0px ${C.gold}30`, `0 0 0 6px ${C.gold}20`, `0 0 0 0px ${C.gold}30`] : `0 0 0 0px ${C.gold}00` }}
          transition={{ duration: 1.5, repeat: busy ? Infinity : 0, ease: "easeInOut" }}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.dark})` }}
        >
          <Icon name="Sparkles" size={18} color="white" />
        </motion.div>

        <div className="flex-1 min-w-0">
          <h4 className="font-black text-[14px] tracking-tight" style={{ color: C.ink }}>SPQR Oracle</h4>
          <AnimatePresence mode="wait">
            <motion.span
              key={busy ? "thinking" : "active"}
              initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }}
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: busy ? C.gold : C.green }}
            >
              {busy ? "CONSULTING…" : "READY"}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Message count */}
        <div
          className="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider"
          style={{ borderColor: `${C.gold}30`, color: C.muted, backgroundColor: `${C.gold}08` }}
        >
          {msgCount} msg{msgCount !== 1 ? "s" : ""}
        </div>

        {/* Search toggle */}
        <button
          onClick={() => { setIsSearching(!isSearching); if (!isSearching) setTimeout(() => inputRef.current?.focus(), 50); }}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-70"
          style={{ backgroundColor: isSearching ? `${C.gold}15` : "transparent", color: isSearching ? C.gold : C.muted }}
        >
          <Icon name="Search" size={16} />
        </button>
      </div>

      {/* ── Pinned message banner ─────────────────────────────────────── */}
      <PinnedBanner count={pinnedMsgs.length} onClick={scrollToPinned} />

      {/* ── Search bar (expandable) ──────────────────────────────────── */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 48, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-b shrink-0"
            style={{ borderColor: `${C.gold}20` }}
          >
            <div className="flex items-center gap-2 px-4 h-12">
              <Icon name="Search" size={15} color={C.gold} />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversation…"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#9A9A9A]"
                style={{ color: C.ink }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-[#9A9A9A] hover:opacity-70">
                  <Icon name="X" size={13} />
                </button>
              )}
              <span className="text-[10px] font-bold" style={{ color: C.muted }}>
                {search ? `${searchResults.length} found` : ""}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pinned panel ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPinned && pinnedMsgs.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b shrink-0"
            style={{ borderColor: `${C.gold}20`, backgroundColor: `${C.gold}05` }}
          >
            <div className="p-3 space-y-2 max-h-32 overflow-y-auto">
              {pinnedMsgs.map((m) => (
                <div key={m.id} className="flex items-start gap-2">
                  <Icon name="Pin" size={10} color={C.gold} />
                  <p className="text-[11px] text-[#202020] line-clamp-1 flex-1">{m.content}</p>
                  <button onClick={() => pinMsg(m.id)} className="text-[#7A7A7A] hover:opacity-70">
                    <Icon name="X" size={10} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">

        {/* Initial suggestions (when fresh) */}
        {showSuggestions && !isSearching && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 pb-2"
          >
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="text-[11px] font-bold px-3.5 py-2 rounded-full border transition-all hover:brightness-95 active:scale-95"
                style={{
                  backgroundColor: `${C.gold}0c`,
                  borderColor: `${C.gold}30`,
                  color: C.dark,
                }}
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}

        {/* Message list */}
        {searchResults.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: 1, y: 0,
              ...(isSearching && search && m.content.toLowerCase().includes(search.toLowerCase())
                ? { backgroundColor: `${C.gold}15` }
                : {}),
            }}
            transition={{ duration: 0.2 }}
            className="flex flex-col"
            style={{ alignItems: m.role === "user" ? "flex-end" : "flex-start" }}
            onMouseEnter={() => setHoveredId(m.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Editing state */}
            {editingId === m.id ? (
              <div className="max-w-[85%] space-y-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-2xl p-3 text-[13px] border resize-none outline-none"
                  style={{ borderColor: `${C.gold}40`, backgroundColor: C.s2, color: C.ink, minHeight: 80 }}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setEditingId(null); setEditValue(""); }}
                    className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border"
                    style={{ borderColor: C.border, color: C.muted }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={commitEdit}
                    className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white"
                    style={{ backgroundColor: C.gold }}
                  >
                    Re-send
                  </button>
                </div>
              </div>
            ) : m.isError ? (
              /* Error card */
              <ErrorCard message={m.content} onRetry={lastRetry ? () => sendMessage(lastRetry!) : undefined} />
            ) : (
              /* Normal bubble */
              <div className="max-w-[85%]">
                {/* Image preview */}
                {m.imageUrl && (
                  <div className="mb-1.5 rounded-xl overflow-hidden border" style={{ borderColor: C.border }}>
                    <img src={m.imageUrl} alt="attachment" className="max-h-48 w-full object-cover" />
                  </div>
                )}
                {/* Bubble */}
                <div
                  className="rounded-2xl p-3.5 text-[13.5px] leading-relaxed shadow-sm"
                  style={m.role === "user"
                    ? { backgroundColor: C.gold, color: "white", borderRadius: "16px 16px 4px 16px" }
                    : { backgroundColor: C.s2, border: `1px solid ${C.border}`, color: C.ink, borderRadius: "4px 16px 16px 16px" }
                  }
                >
                  {m.isPinned && (
                    <div className="flex items-center gap-1 mb-1.5 opacity-60">
                      <Icon name="Pin" size={10} color={m.role === "user" ? "white" : C.gold} />
                      <span className="text-[9px] font-bold uppercase tracking-widest">Pinned</span>
                    </div>
                  )}
                  <div className="markdown-body text-[13.5px]">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>

                {/* Cards — form cards are full-width; regular cards scroll horizontally */}
                {m.role === "assistant" && m.cards && m.cards.length > 0 && (
                  <div className="max-w-full w-full">
                    <SpqrCardList
                      cards={m.cards}
                      onAction={(action, card, data) => {
                        if (action === "form_submit" && data) {
                          // Serialize form data into a structured message the Oracle can parse
                          const payload = JSON.stringify({ _form: data.formType, data: (() => {
                            const { formType, ...rest } = data;
                            return rest;
                          })() });
                          sendMessage(payload);
                        } else if (action === "upvote") {
                          sendMessage(`Please upvote launch "${card.title}" (id: ${card.id})`);
                        } else if (action === "bookmark") {
                          sendMessage(`Please bookmark launch "${card.title}" (id: ${card.id})`);
                        }
                      }}
                    />
                  </div>
                )}

                {/* Per-message timestamp */}
                <div
                  className="mt-1 text-[9px] font-medium"
                  style={{ color: C.muted, textAlign: m.role === "user" ? "right" : "left" }}
                >
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            )}

            {/* Action buttons (shown on hover) */}
            <AnimatePresence>
              {hoveredId === m.id && !m.isDeleted && editingId !== m.id && (
                <MessageActions
                  msg={m}
                  show={true}
                  onCopy={() => copyMsg(m)}
                  onPin={() => pinMsg(m.id)}
                  onDelete={() => deleteMsg(m.id)}
                  onEdit={() => startEdit(m)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        {/* Follow-up suggestion chips (after last assistant message) */}
        {!busy && !isSearching && msgCount > 2 && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-2 pt-1"
          >
            {suggestions.slice(0, 4).map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all hover:brightness-95 active:scale-95"
                style={{
                  backgroundColor: `${C.gold}08`,
                  borderColor: `${C.gold}25`,
                  color: C.dark,
                }}
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}

        {/* Workflow map (shown while busy) */}
        <AnimatePresence>
          {busy && (
            <WorkflowMap
              steps={workflowSteps}
              phase={phase}
              currentLabel={currentLabel}
            />
          )}
        </AnimatePresence>

        <div ref={scrollRef} />
      </div>

      {/* ── Undo toast ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showUndoToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full shadow-lg border"
            style={{ backgroundColor: C.ink, borderColor: `${C.gold}40` }}
          >
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">Message deleted</span>
            <button
              onClick={undoDelete}
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: C.gold }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Image upload preview ─────────────────────────────────────────── */}
      <AnimatePresence>
        {uploadPreview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="px-4 pt-2 pb-0 shrink-0 flex items-start gap-2"
          >
            <div className="relative">
              <img src={uploadPreview} className="h-16 w-16 rounded-xl object-cover border" style={{ borderColor: C.border }} />
              <button
                onClick={() => setUploadPreview(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
                style={{ backgroundColor: C.ink }}
              >
                <Icon name="X" size={10} color="white" />
              </button>
            </div>
            <p className="text-[11px] text-[#7A7A7A] pt-1">Image attached</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input bar ────────────────────────────────────────────────────── */}
      <div
        className="px-3 py-2.5 pb-6 border-t shrink-0 flex items-end gap-2"
        style={{ borderColor: C.border, backgroundColor: C.bg }}
      >
        {/* File upload button */}
        <button
          onClick={() => fileRef.current?.click()}
          className="w-9 h-9 rounded-full flex items-center justify-center border shrink-0 transition-all hover:opacity-70 active:scale-95"
          style={{ borderColor: C.border, backgroundColor: C.s2, color: C.muted }}
        >
          <Icon name="Paperclip" size={15} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

        {/* Text input */}
        <div
          className="flex-1 rounded-2xl flex items-center px-4 py-2.5 border transition-all focus-within:border-[#C5A05970]"
          style={{ backgroundColor: C.s2, borderColor: C.border }}
        >
          <input
            value={inp}
            onChange={(e) => setInp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask the Oracle…"
            disabled={busy}
            className="flex-1 bg-transparent outline-none text-[13.5px] py-0.5 placeholder:text-[#9A9A9A] disabled:opacity-60"
            style={{ color: C.ink }}
          />
        </div>

        {/* Send button */}
        <motion.button
          onClick={() => sendMessage(undefined, uploadPreview || undefined)}
          disabled={busy || (!inp.trim() && !uploadPreview)}
          whileTap={{ scale: 0.9 }}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.dark})` }}
        >
          <Icon name="Send" size={16} color="white" />
        </motion.button>
      </div>
    </div>
  );
}
