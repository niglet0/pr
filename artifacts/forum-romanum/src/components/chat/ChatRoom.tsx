import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, Icon, cn } from "../UI";
import { supabase } from "../../integrations/supabase/client";
import { EMOJIS, clockTime, withDaySeparators, lastSeenLabel } from "../../lib/chatUtils";
import { GroupInfoSheet } from "./GroupInfoSheet";
import { ChannelPost } from "./parts/ChannelPost";
import { SystemNotice } from "./parts/SystemNotice";
import { MessageBubble } from "./bubbles/MessageBubble";
import { Composer, type SendPayload } from "./composer/Composer";
import { ForwardSheet } from "./sheets/ForwardSheet";
import { ChatHeaderMenu, type HeaderAction } from "./ChatHeaderMenu";
import { DMProfileSheet } from "./DMProfileSheet";
import { ImageLightbox } from "./ImageLightbox";
import { muteChat, unmuteChat, clearDmHistory, deleteConversation, leaveGroup } from "../../lib/chatActions";

export type ChatTarget =
  | { type: "dm"; conversation: any; otherUser: any }
  | { type: "group"; group: any };

export function ChatRoom({ target, currentUser, onBack, onOpenProfile }: { target: ChatTarget; currentUser: any; onBack: () => void; onOpenProfile?: (userId: string) => void }) {
  const isDM = target.type === "dm";
  const convId = isDM ? (target as any).conversation.id : null;
  const groupId = !isDM ? (target as any).group.id : null;
  const meId = currentUser?.id;
  const otherUser = isDM ? (target as any).otherUser : null;
  const group = !isDM ? (target as any).group : null;
  const isChannel = !!group?.is_channel;

  const [msgs, setMsgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [reactions, setReactions] = useState<Record<string, any[]>>({});
  const [readByOthers, setReadByOthers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const [myRole, setMyRole] = useState("member");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [activePinIdx, setActivePinIdx] = useState(0);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [muted, setMuted] = useState(false);

  const [replyTo, setReplyTo] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [menuMsg, setMenuMsg] = useState<any>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<any>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [showDMProfile, setShowDMProfile] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const typingTimers = useRef<Record<string, any>>({});
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isAdmin = myRole === "owner" || myRole === "admin" || group?.owner_id === meId;
  const canPost = isDM || !isChannel || isAdmin;

  // ===== load & subscribe =====
  useEffect(() => {
    let mounted = true;
    const baseCol = isDM ? "conversation_id" : "group_id";
    const baseId = isDM ? convId : groupId;

    (async () => {
      setLoading(true);
      const { data } = await supabase.from("messages").select("*").eq(baseCol, baseId).order("created_at", { ascending: true }).limit(500);
      if (!mounted) return;
      const rows = (data || []).map((m: any) => ({ ...m, _status: "sent" }));
      setMsgs(rows);
      setLoading(false);

      const ids = rows.map((m: any) => m.id);
      if (ids.length) {
        const { data: rx } = await supabase.from("message_reactions").select("*").in("message_id", ids);
        if (rx) {
          const map: Record<string, any[]> = {};
          rx.forEach((r: any) => { (map[r.message_id] = map[r.message_id] || []).push(r); });
          setReactions(map);
        }
        const { data: reads } = await supabase.from("message_reads").select("message_id, user_id").in("message_id", ids);
        if (reads) setReadByOthers(new Set(reads.filter((r: any) => r.user_id !== meId).map((r: any) => r.message_id)));
        const incoming = rows.filter((m: any) => m.sender_id !== meId).map((m: any) => ({ message_id: m.id, user_id: meId }));
        if (incoming.length) supabase.from("message_reads").upsert(incoming, { onConflict: "message_id,user_id" }).then(() => {});
      }
      if (!isDM) {
        const senderIds = [...new Set(rows.map((m: any) => m.sender_id))] as string[];
        if (senderIds.length) {
          const { data: u } = await supabase.from("users").select("id, display_name, username, avatar_url, verified").in("id", senderIds);
          if (u) setProfiles(Object.fromEntries(u.map((x: any) => [x.id, x])));
        }
        const pins = rows.filter((m: any) => m.is_pinned).map((m: any) => m.id);
        if (pins.length) setPinnedIds(pins);
        else if (group?.pinned_message_id) setPinnedIds([group.pinned_message_id]);

        supabase.from("group_members").update({ unread_count: 0, last_read_at: new Date().toISOString() }).eq("group_id", groupId).eq("user_id", meId).then(() => {});
        supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", meId).single().then(({ data }: any) => { if (data?.role) setMyRole(data.role); });
        supabase.from("group_members").select("user_id").eq("group_id", groupId).then(async ({ data }: any) => {
          const memIds = (data || []).map((x: any) => x.user_id);
          if (!memIds.length) return;
          const { data: u } = await supabase.from("users").select("id, display_name, username, avatar_url").in("id", memIds);
          setGroupMembers(u || []);
        });
      } else {
        const isP1 = (target as any).conversation.participant_1 === meId;
        supabase.from("conversations").update({ [isP1 ? "unread_count_1" : "unread_count_2"]: 0 }).eq("id", convId).then(() => {});
        if (otherUser?.id) {
          supabase.from("users").select("last_seen_at").eq("id", otherUser.id).maybeSingle().then(({ data }: any) => setOtherLastSeen(data?.last_seen_at || null));
        }
      }
      // mute state
      const chatKind = isDM ? "dm" : "group";
      const chatId = isDM ? convId : groupId;
      supabase.from("chat_mutes").select("mute_until").eq("user_id", meId).eq("chat_kind", chatKind).eq("chat_id", chatId).maybeSingle().then(({ data }: any) => {
        if (!data) return;
        const u = data.mute_until ? new Date(data.mute_until) : null;
        setMuted(!u || u.getTime() > Date.now());
      });
    })();

    const ch = supabase
      .channel(`room_${baseId}`, { config: { presence: { key: meId || "anon" } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `${baseCol}=eq.${baseId}` }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new;
          setMsgs((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const idx = prev.findIndex((m) => m._status === "pending" && m.sender_id === row.sender_id && m.content === row.content && m.type === row.type);
            if (idx !== -1) { const next = [...prev]; next[idx] = { ...row, _status: "sent" }; return next; }
            return [...prev, { ...row, _status: "sent" }];
          });
          if (!isDM && row.sender_id && !profiles[row.sender_id]) {
            supabase.from("users").select("id, display_name, username, avatar_url, verified").eq("id", row.sender_id).single().then(({ data }: any) => {
              if (data) setProfiles((p) => ({ ...p, [data.id]: data }));
            });
          }
          if (row.sender_id !== meId) supabase.from("message_reads").upsert({ message_id: row.id, user_id: meId }, { onConflict: "message_id,user_id" }).then(() => {});
        } else if (payload.eventType === "UPDATE") {
          setMsgs((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new, _status: "sent" } : m)));
          setPinnedIds((p) => payload.new.is_pinned ? (p.includes(payload.new.id) ? p : [...p, payload.new.id]) : p.filter((id) => id !== payload.new.id));
        } else if (payload.eventType === "DELETE") {
          setMsgs((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload: any) => {
        const mid = (payload.new || payload.old)?.message_id; if (!mid) return;
        supabase.from("message_reactions").select("*").eq("message_id", mid).then(({ data }: any) => {
          setReactions((prev) => ({ ...prev, [mid]: data || [] }));
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload: any) => {
        if (payload.new.user_id !== meId) setReadByOthers((prev) => new Set(prev).add(payload.new.message_id));
      })
      .on("broadcast", { event: "typing" }, (p: any) => {
        const uid = p?.payload?.userId, name = p?.payload?.name;
        if (uid && uid !== meId) {
          setTypingUsers((prev) => ({ ...prev, [uid]: Date.now() }));
          if (name && !profiles[uid]) setProfiles((pr) => ({ ...pr, [uid]: { display_name: name } }));
          clearTimeout(typingTimers.current[uid]);
          typingTimers.current[uid] = setTimeout(() => setTypingUsers((prev) => { const n = { ...prev }; delete n[uid]; return n; }), 3500);
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        if (isDM && otherUser) setOnline(!!state[otherUser.id]?.length);
        else setOnline(Object.keys(state).length > 1);
      })
      .subscribe(async (status: string) => { if (status === "SUBSCRIBED") await ch.track({ userId: meId, at: Date.now() }); });
    channelRef.current = ch;

    return () => {
      mounted = false;
      Object.values(typingTimers.current).forEach(clearTimeout);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, groupId]);

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight + 9999, behavior: smooth ? "smooth" : "auto" });
      // double-rAF for late image/voice layout
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight + 9999; });
    });
  };
  useEffect(() => { scrollToBottom(true); }, [msgs.length, typingUsers]);
  useEffect(() => { scrollToBottom(false); }, [loading]);

  // ===== send =====
  const broadcastTyping = () => {
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: meId, name: currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] } });
  };

  const insertMessage = async (payload: any, optimistic: any) => {
    setMsgs((prev) => [...prev, optimistic]);
    const { data, error } = await supabase.from("messages").insert(payload).select().single();
    if (error) { setMsgs((prev) => prev.map((m) => (m.id === optimistic.id ? { ...m, _status: "failed" } : m))); return null; }
    if (data) setMsgs((prev) => prev.some((m) => m.id === data.id) ? prev.filter((m) => m.id !== optimistic.id) : prev.map((m) => (m.id === optimistic.id ? { ...data, _status: "sent" } : m)));
    return data;
  };

  const baseRouting = () => isDM ? { conversation_id: convId, receiver_id: otherUser?.id } : { group_id: groupId };

  const uploadMedia = async (file: File, bucket: string, type: string) => {
    const path = `${meId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) {
      // fallback to chat-media if dedicated bucket missing
      if (bucket !== "chat-media") return uploadMedia(file, "chat-media", type);
      throw error;
    }
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return pub.publicUrl;
  };

  const handleSend = async (p: SendPayload) => {
    if (!canPost) return;
    const base: any = { sender_id: meId, reply_to: replyTo?.id || null, ...baseRouting() };
    if (group?.sign_messages && !isDM) base.author_signature = currentUser?.user_metadata?.display_name || null;

    if (p.type === "text") {
      const optimistic = { id: `tmp-${Date.now()}`, ...base, content: p.content, type: "text", created_at: new Date().toISOString(), _status: "pending" };
      setReplyTo(null);
      await insertMessage({ ...base, content: p.content, type: "text" }, optimistic);
      return;
    }
    if (p.type === "voice") {
      try {
        const file = new File([p.blob], `voice-${Date.now()}.webm`, { type: p.blob.type || "audio/webm" });
        const url = await uploadMedia(file, "voice-notes", "voice");
        const payload = { ...base, content: "", type: "voice", media_url: url, media_meta: { duration: p.duration, waveform: p.waveform, size: file.size } };
        const optimistic = { id: `tmp-${Date.now()}`, ...payload, created_at: new Date().toISOString(), _status: "pending" };
        setReplyTo(null);
        await insertMessage(payload, optimistic);
      } catch (e) { console.error(e); }
      return;
    }
    if (p.type === "image" || p.type === "video" || p.type === "file") {
      try {
        const url = await uploadMedia(p.file, "chat-media", p.type);
        const payload = { ...base, content: "", type: p.type, media_url: url, media_meta: { name: p.file.name, size: p.file.size, mime: p.file.type } };
        const optimistic = { id: `tmp-${Date.now()}`, ...payload, created_at: new Date().toISOString(), _status: "pending" };
        setReplyTo(null);
        await insertMessage(payload, optimistic);
      } catch (e) { console.error(e); }
      return;
    }
    if (p.type === "poll") {
      const payload = { ...base, content: p.question, type: "poll" };
      const msg = await insertMessage(payload, { id: `tmp-${Date.now()}`, ...payload, created_at: new Date().toISOString(), _status: "pending" });
      if (msg) await supabase.from("polls").insert({ message_id: msg.id, question: p.question, options: p.options, multiple: p.multiple, anonymous: p.anonymous });
      setReplyTo(null);
      return;
    }
  };

  const onEditDone = async (text: string) => {
    if (!editing) return;
    const id = editing.id;
    setEditing(null);
    const editedAt = new Date().toISOString();
    setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, content: text, edited_at: editedAt } : m));
    await supabase.from("messages").update({ content: text, edited_at: editedAt }).eq("id", id);
  };

  const toggleReaction = async (msg: any, emoji: string) => {
    setMenuMsg(null);
    const mine = (reactions[msg.id] || []).find((r) => r.user_id === meId && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => ({ ...prev, [msg.id]: (prev[msg.id] || []).filter((r) => !(r.user_id === meId && r.emoji === emoji)) }));
      await supabase.from("message_reactions").delete().eq("message_id", msg.id).eq("user_id", meId).eq("emoji", emoji);
    } else {
      setReactions((prev) => ({ ...prev, [msg.id]: [...(prev[msg.id] || []), { message_id: msg.id, user_id: meId, emoji }] }));
      await supabase.from("message_reactions").insert({ message_id: msg.id, user_id: meId, emoji });
    }
  };

  const deleteMsg = async (msg: any) => {
    setMenuMsg(null);
    setMsgs((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_deleted: true, content: "", media_url: null } : m)));
    await supabase.from("messages").update({ is_deleted: true, content: "", media_url: null }).eq("id", msg.id);
  };

  const pinMsg = async (msg: any) => {
    setMenuMsg(null);
    setMsgs((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_pinned: true } : m));
    setPinnedIds((p) => p.includes(msg.id) ? p : [...p, msg.id]);
    await supabase.from("messages").update({ is_pinned: true }).eq("id", msg.id);
    if (groupId) await supabase.from("groups").update({ pinned_message_id: msg.id }).eq("id", groupId);
  };
  const unpinMsg = async (id: string) => {
    setPinnedIds((p) => p.filter((x) => x !== id));
    setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, is_pinned: false } : m));
    await supabase.from("messages").update({ is_pinned: false }).eq("id", id);
  };

  const retry = async (msg: any) => {
    setMsgs((prev) => prev.filter((m) => m.id !== msg.id));
    const { _status, id, created_at, ...payload } = msg;
    const optimistic = { ...msg, id: `tmp-${Date.now()}`, _status: "pending" };
    await insertMessage(payload, optimistic);
  };

  const jumpTo = (id: string) => {
    const el = msgRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1500);
  };

  const shareMsg = (m: any) => setForwardMsg(m);

  const toggleMute = async () => {
    const kind = isDM ? "dm" : "group";
    const id = isDM ? convId : groupId;
    if (muted) { await unmuteChat(meId, kind as any, id); setMuted(false); }
    else { await muteChat(meId, kind as any, id, null); setMuted(true); }
  };

  const handleHeaderAction = async (a: HeaderAction) => {
    const kind = isDM ? "dm" : "group";
    const id = isDM ? convId : groupId;
    if (a === "search") { setSearch(search === null ? "" : null); return; }
    if (a === "info") { setShowInfo(true); return; }
    if (a === "unmute") { await unmuteChat(meId, kind as any, id); setMuted(false); return; }
    if (a === "mute-forever") { await muteChat(meId, kind as any, id, null); setMuted(true); return; }
    if (a === "mute-1h" || a === "mute-8h" || a === "mute-1d") {
      const hours = a === "mute-1h" ? 1 : a === "mute-8h" ? 8 : 24;
      await muteChat(meId, kind as any, id, new Date(Date.now() + hours * 3600 * 1000));
      setMuted(true); return;
    }
    if (a === "clear" && isDM) { await clearDmHistory(convId, meId); setMsgs([]); return; }
    if (a === "block" && isDM) { await deleteConversation(convId); onBack(); return; }
    if (a === "leave" && !isDM) { await leaveGroup(groupId, meId); onBack(); return; }
    if (a === "report") { alert("Thanks — this conversation has been flagged for review."); return; }
  };


  // ===== derived =====
  const typingNames = useMemo(() => Object.keys(typingUsers).filter((id) => id !== meId).map((id) => profiles[id]?.display_name || (isDM ? otherUser?.display_name : "Someone")), [typingUsers, profiles, otherUser, isDM, meId]);
  const headerName = isDM ? otherUser?.display_name : group?.name;
  const headerSub = (() => {
    if (typingNames.length) return isDM ? "typing…" : `${typingNames[0]} is typing…`;
    if (isDM) return online ? "online" : lastSeenLabel(otherLastSeen);
    return `${group?.members_count ?? 0} ${isChannel ? "subscribers" : "members"}`;
  })();

  const filtered = useMemo(() => search ? msgs.filter((m) => (m.content || "").toLowerCase().includes(search.toLowerCase())) : msgs, [msgs, search]);
  const items = withDaySeparators(filtered);
  const currentPin = pinnedIds[activePinIdx] ? msgs.find((m) => m.id === pinnedIds[activePinIdx]) : null;

  return (
    <div className="absolute inset-0 z-[60] flex flex-col chat-ios chat-ios-bg">
      {/* Header */}
      <div className="border-b border-[var(--ios-sep)] glass shrink-0 z-20">
        <div className="h-14 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 min-w-0 cursor-pointer flex-1" onClick={() => isDM ? setShowDMProfile(true) : setShowInfo(true)}>
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onBack(); }} className="w-9 h-9 flex items-center justify-center text-[var(--ios-blue)] ios-tap">
              <Icon name="ChevronLeft" size={26} />
            </button>
            <div className="relative shrink-0">
              <Avatar src={isDM ? otherUser?.avatar_url : group?.avatar_url} seed={isDM ? otherUser?.username : group?.id} size={36} />
              {isDM && online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--ios-green)] border-2 border-white" />}
            </div>
            <div className="min-w-0 leading-tight">
              <h4 className="font-bold text-[15.5px] truncate flex items-center gap-1 text-[var(--ios-ink)]">
                {headerName}
                {isChannel && <Icon name="Megaphone" size={12} className="text-[var(--ios-blue)]" />}
                {muted && <Icon name="BellOff" size={12} className="text-[var(--ios-ink-4)]" />}
              </h4>
              <span className={cn("text-[11.5px]", typingNames.length ? "text-[var(--ios-blue)]" : "text-[var(--ios-ink-3)]")}>{headerSub}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setSearch(search === null ? "" : null)} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ios-blue)] ios-tap">
              <Icon name="Search" size={19} />
            </button>
            <button onClick={() => setHeaderMenu(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ios-blue)] ios-tap">
              <Icon name="MoreHorizontal" size={20} />
            </button>
          </div>
        </div>
        {search !== null && (
          <div className="px-3 pb-2">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in chat" className="w-full bg-[var(--ios-bg-soft)] rounded-xl px-3 py-2 text-[14px] outline-none" />
          </div>
        )}
      </div>

      {/* Pinned banner */}
      {currentPin && !currentPin.is_deleted && (
        <div className="px-3 py-2 flex items-center gap-2 bg-white border-b border-[var(--ios-sep)]">
          <button onClick={() => setActivePinIdx((i) => (i + 1) % pinnedIds.length)} className="text-[var(--ios-blue)] shrink-0">
            <Icon name="Pin" size={14} />
          </button>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => jumpTo(currentPin.id)}>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--ios-blue)]">Pinned {pinnedIds.length > 1 ? `${activePinIdx + 1}/${pinnedIds.length}` : ""}</p>
            <p className="text-[12.5px] truncate text-[var(--ios-ink)]">{currentPin.type === "image" ? "🖼 Photo" : currentPin.type === "voice" ? "🎤 Voice message" : currentPin.content}</p>
          </div>
          {isAdmin && (
            <button onClick={() => unpinMsg(currentPin.id)} className="text-[var(--ios-ink-3)] hover:text-[var(--ios-red)] ios-tap">
              <Icon name="X" size={15} />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1 no-scrollbar" onClick={() => menuMsg && setMenuMsg(null)}>
        {loading && <div className="flex justify-center py-10"><Icon name="Loader2" className="animate-spin text-[var(--ios-blue)]" size={22} /></div>}
        {!loading && msgs.length === 0 && (
          <div className="text-center py-20 opacity-50">
            <Icon name="MessageCircle" size={42} className="mx-auto mb-2 text-[var(--ios-blue)]" />
            <p className="text-[13px] text-[var(--ios-ink-3)]">Say hi</p>
          </div>
        )}
        {items.map((it: any, i) => {
          if (it._sep) return (
            <div key={`sep-${i}`} className="flex justify-center my-3">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--ios-ink-3)] bg-white/70 px-3 py-1 rounded-full">{it._sep}</span>
            </div>
          );
          const m = it;
          if (m.type === "system") return <SystemNotice key={m.id} text={m.content || ""} />;
          if (isChannel) {
            return (
              <div key={m.id} ref={(el) => { msgRefs.current[m.id] = el; }} className={cn(highlightId === m.id ? "ring-2 ring-[var(--ios-blue)]/60 rounded-2xl" : "")}>
                <ChannelPost
                  msg={m} channel={group} meId={meId} reactions={reactions[m.id] || []}
                  onMenu={() => { if (!String(m.id).startsWith("tmp")) setMenuMsg(m); }}
                  onReact={(e) => toggleReaction(m, e)}
                  onAddReaction={() => setMenuMsg(m)}
                  onShare={() => shareMsg(m)}
                />
              </div>
            );
          }
          const me = m.sender_id === meId;
          const showSender = !isDM && !me;
          const senderProfile = profiles[m.sender_id];
          const replied = m.reply_to ? msgs.find((x) => x.id === m.reply_to) : null;
          const repliedSenderName = replied ? (replied.sender_id === meId ? "You" : profiles[replied.sender_id]?.display_name || otherUser?.display_name || "Reply") : undefined;

          return (
            <div key={m.id} ref={(el) => { msgRefs.current[m.id] = el; }} className={cn("px-1 transition-colors rounded-2xl", highlightId === m.id ? "bg-[var(--ios-blue-soft)]" : "")}>
              <MessageBubble
                msg={m} me={me} meId={meId}
                showSender={showSender} senderProfile={senderProfile}
                repliedMsg={replied} repliedSenderName={repliedSenderName}
                reactions={reactions[m.id] || []}
                seen={me && readByOthers.has(m.id)}
                onMenu={() => { if (!m.is_deleted && !String(m.id).startsWith("tmp")) setMenuMsg(m); }}
                onClick={() => { if (m.type === "image" && m.media_url) setLightboxUrl(m.media_url); }}
                onReply={() => setReplyTo(m)}
                onRetry={() => retry(m)}
                onJumpReply={() => replied && jumpTo(replied.id)}
              />
            </div>
          );
        })}
        {typingNames.length > 0 && (
          <div className="flex justify-start pt-1">
            <div className="bg-[var(--ios-bubble-other)] rounded-2xl rounded-bl-[6px] px-3.5 py-2.5 flex gap-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ios-ink-3)] animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ios-ink-3)] animate-bounce [animation-delay:0.18s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ios-ink-3)] animate-bounce [animation-delay:0.36s]" />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Message action sheet */}
      <AnimatePresence>
        {menuMsg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[70] bg-black/35 backdrop-blur-[2px] flex items-end" onClick={() => setMenuMsg(null)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={(e) => e.stopPropagation()} className="w-full bg-[var(--ios-bg-soft)] rounded-t-3xl pt-3 pb-8 px-3 space-y-2 chat-ios">
              <div className="w-10 h-1 bg-[var(--ios-ink-4)] rounded-full mx-auto" />
              <div className="bg-white rounded-2xl p-3 flex justify-around">
                {EMOJIS.slice(0, 7).map((e) => (
                  <button key={e} onClick={() => toggleReaction(menuMsg, e)} className="text-2xl hover:scale-125 transition-transform">{e}</button>
                ))}
              </div>
              <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
                <Row icon="Reply" label="Reply" onClick={() => { setReplyTo(menuMsg); setMenuMsg(null); }} />
                <Row icon="CornerUpRight" label="Forward" onClick={() => { setForwardMsg(menuMsg); setMenuMsg(null); }} />
                {menuMsg.content && <Row icon="Copy" label="Copy" onClick={() => { navigator.clipboard?.writeText(menuMsg.content); setMenuMsg(null); }} />}
                {menuMsg.sender_id === meId && menuMsg.type === "text" && (
                  <Row icon="Pencil" label="Edit" onClick={() => { setEditing(menuMsg); setMenuMsg(null); }} />
                )}
                {!isDM && isAdmin && !menuMsg.is_pinned && <Row icon="Pin" label="Pin" onClick={() => pinMsg(menuMsg)} />}
                {!isDM && isAdmin && menuMsg.is_pinned && <Row icon="PinOff" label="Unpin" onClick={() => { unpinMsg(menuMsg.id); setMenuMsg(null); }} />}
                {(menuMsg.sender_id === meId || (!isDM && isAdmin)) && (
                  <Row icon="Trash2" label="Delete" danger onClick={() => deleteMsg(menuMsg)} />
                )}
              </div>
              <button onClick={() => setMenuMsg(null)} className="w-full bg-white rounded-2xl py-3 text-[16px] font-bold text-[var(--ios-blue)] ios-tap">Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply / edit preview */}
      <AnimatePresence>
        {(replyTo || editing) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-3 py-2 bg-white border-t border-[var(--ios-sep)] flex items-center gap-3 overflow-hidden chat-ios">
            <Icon name={editing ? "Pencil" : "Reply"} size={16} className="text-[var(--ios-blue)] shrink-0" />
            <div className="min-w-0 flex-1 border-l-2 border-[var(--ios-blue)] pl-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--ios-blue)]">{editing ? "Editing" : "Reply to"}</p>
              <p className="text-[12.5px] truncate text-[var(--ios-ink-3)]">{(editing || replyTo).type === "image" ? "🖼 Photo" : (editing || replyTo).content}</p>
            </div>
            <button onClick={() => { setReplyTo(null); setEditing(null); }} className="text-[var(--ios-ink-3)] ios-tap"><Icon name="X" size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer or channel notice */}
      {!canPost ? (
        <div className="bg-white border-t border-[var(--ios-sep)] px-4 py-3 pb-6 flex items-center justify-between gap-2 shrink-0 chat-ios">
          <span className="text-[13px] text-[var(--ios-ink-3)] flex items-center gap-1.5">
            <Icon name="Megaphone" size={13} /> Only admins can post
          </span>
          <button onClick={toggleMute} className={cn("flex items-center gap-1.5 text-[13.5px] font-bold ios-tap", muted ? "text-[var(--ios-blue)]" : "text-[var(--ios-ink-3)]")}>
            <Icon name={muted ? "Bell" : "BellOff"} size={15} />
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      ) : (
        <Composer
          onSend={handleSend}
          onTyping={broadcastTyping}
          editingText={editing ? editing.content : null}
          onEditDone={onEditDone}
          onEditCancel={() => setEditing(null)}
          groupMembers={!isDM ? groupMembers : []}
          showPoll={!isDM}
        />
      )}

      {showInfo && group && (
        <GroupInfoSheet group={group} currentUser={currentUser} isAdmin={isAdmin} onClose={() => setShowInfo(false)} onLeft={onBack} />
      )}
      <AnimatePresence>
        {forwardMsg && (
          <ForwardSheet meId={meId} message={forwardMsg} originName={isDM ? otherUser?.display_name : group?.name} onClose={() => setForwardMsg(null)} />
        )}
        {headerMenu && (
          <ChatHeaderMenu
            isDM={isDM} isChannel={isChannel} muted={muted} isAdmin={isAdmin}
            onClose={() => setHeaderMenu(false)}
            onAction={handleHeaderAction}
          />
        )}
        {isDM && showDMProfile && otherUser && (
          <DMProfileSheet
            otherUser={otherUser}
            conversationId={convId}
            meId={meId}
            muted={muted}
            onClose={() => setShowDMProfile(false)}
            onMuteChange={setMuted}
            onCleared={() => setMsgs([])}
            onDeleted={() => { setShowDMProfile(false); onBack(); }}
            onOpenProfile={otherUser?.id && onOpenProfile ? () => { setShowDMProfile(false); onOpenProfile(otherUser.id); } : undefined}
          />
        )}
      </AnimatePresence>
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function Row({ icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 px-4 py-3 text-[15.5px] ios-tap", danger ? "text-[var(--ios-red)]" : "text-[var(--ios-ink)]")}>
      <Icon name={icon} size={19} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
