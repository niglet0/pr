import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../integrations/supabase/client";
import type { ChatTarget } from "../ChatRoom";

export type RoomMessage = any & { _status?: "pending" | "sent" | "failed" };

export interface UseRoomDataReturn {
  msgs: RoomMessage[];
  setMsgs: React.Dispatch<React.SetStateAction<RoomMessage[]>>;
  loading: boolean;
  profiles: Record<string, any>;
  ensureProfiles: (ids: string[]) => Promise<void>;
  reactions: Record<string, any[]>;
  loadReactions: (ids: string[]) => Promise<void>;
  readByOthers: Set<string>;
  typingUsers: Record<string, number>;
  presenceOnline: boolean;
  myRole: string;
  isAdmin: boolean;
  pinnedIds: string[];
  channelRef: React.MutableRefObject<any>;
  broadcastTyping: () => void;
  insertMessage: (payload: any, optimistic: any) => Promise<any>;
  toggleReaction: (msg: any, emoji: string) => Promise<void>;
  deleteMsg: (msg: any) => Promise<void>;
  pinMsg: (msg: any) => Promise<void>;
  unpinMsg: (msg: any) => Promise<void>;
  editMsg: (msg: any, text: string) => Promise<void>;
  retry: (msg: any) => Promise<void>;
  markVisible: (id: string) => void;
}

export function useRoomData(target: ChatTarget, currentUser: any): UseRoomDataReturn {
  const isDM = target.type === "dm";
  const convId = isDM ? (target as any).conversation.id : null;
  const groupId = !isDM ? (target as any).group.id : null;
  const meId = currentUser?.id;
  const otherUser = isDM ? (target as any).otherUser : null;
  const group = !isDM ? (target as any).group : null;

  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [reactions, setReactions] = useState<Record<string, any[]>>({});
  const [readByOthers, setReadByOthers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [presenceOnline, setPresenceOnline] = useState(false);
  const [myRole, setMyRole] = useState<string>("member");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const channelRef = useRef<any>(null);
  const typingTimers = useRef<Record<string, any>>({});

  const isAdmin = myRole === "owner" || myRole === "admin" || group?.owner_id === meId;

  const ensureProfiles = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => id && !profiles[id]);
    if (!missing.length) return;
    const { data } = await supabase
      .from("users")
      .select("id, display_name, username, avatar_url, verified")
      .in("id", missing);
    if (data) setProfiles((p) => ({ ...p, ...Object.fromEntries(data.map((u: any) => [u.id, u])) }));
  }, [profiles]);

  const loadReactions = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await supabase.from("message_reactions").select("*").in("message_id", ids);
    if (data) {
      const map: Record<string, any[]> = {};
      data.forEach((r: any) => {
        (map[r.message_id] = map[r.message_id] || []).push(r);
      });
      setReactions((prev) => ({ ...prev, ...map }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const baseCol = isDM ? "conversation_id" : "group_id";
    const baseId = isDM ? convId : groupId;

    const init = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq(baseCol, baseId)
        .order("created_at", { ascending: true })
        .limit(300);
      if (!mounted) return;
      const rows = (data || []).map((m: any) => ({ ...m, _status: "sent" }));
      setMsgs(rows);
      setLoading(false);

      const ids = rows.map((m: any) => m.id);
      loadReactions(ids);
      if (!isDM) ensureProfiles([...new Set(rows.map((m: any) => m.sender_id))] as string[]);

      const { data: reads } = await supabase
        .from("message_reads")
        .select("message_id, user_id")
        .in("message_id", ids);
      if (reads) setReadByOthers(new Set(reads.filter((r: any) => r.user_id !== meId).map((r: any) => r.message_id)));

      const incoming = rows
        .filter((m: any) => m.sender_id !== meId)
        .map((m: any) => ({ message_id: m.id, user_id: meId }));
      if (incoming.length) {
        supabase.from("message_reads").upsert(incoming, { onConflict: "message_id,user_id" }).then(() => {});
      }
      if (isDM) {
        const isP1 = (target as any).conversation.participant_1 === meId;
        supabase.from("conversations").update({ [isP1 ? "unread_count_1" : "unread_count_2"]: 0 }).eq("id", convId).then(() => {});
      } else {
        supabase.from("group_members").update({ unread_count: 0, last_read_at: new Date().toISOString() })
          .eq("group_id", groupId).eq("user_id", meId).then(() => {});
        supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", meId).single().then(({ data }: any) => {
          if (data?.role) setMyRole(data.role);
        });
        const pinned = rows.filter((m: any) => m.is_pinned).map((m: any) => m.id);
        if (pinned.length) setPinnedIds(pinned);
        else if (group?.pinned_message_id) setPinnedIds([group.pinned_message_id]);
      }
    };
    init();

    const ch = supabase
      .channel(`room_${baseId}`, { config: { presence: { key: meId || "anon" } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `${baseCol}=eq.${baseId}` }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new;
          setMsgs((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const idx = prev.findIndex((m) => m._status === "pending" && m.sender_id === row.sender_id && m.content === row.content && m.type === row.type);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = { ...row, _status: "sent" };
              return next;
            }
            return [...prev, { ...row, _status: "sent" }];
          });
          if (!isDM) ensureProfiles([row.sender_id]);
          if (row.sender_id !== meId) {
            supabase.from("message_reads").upsert({ message_id: row.id, user_id: meId }, { onConflict: "message_id,user_id" }).then(() => {});
          }
        } else if (payload.eventType === "UPDATE") {
          setMsgs((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new, _status: "sent" } : m)));
          if (payload.new.is_pinned) {
            setPinnedIds((p) => (p.includes(payload.new.id) ? p : [...p, payload.new.id]));
          } else {
            setPinnedIds((p) => p.filter((id) => id !== payload.new.id));
          }
        } else if (payload.eventType === "DELETE") {
          setMsgs((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload: any) => {
        const mid = (payload.new || payload.old)?.message_id;
        if (mid) loadReactions([mid]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload: any) => {
        if (payload.new.user_id !== meId) {
          setReadByOthers((prev) => new Set(prev).add(payload.new.message_id));
        }
      })
      .on("broadcast", { event: "typing" }, (p: any) => {
        const uid = p?.payload?.userId;
        const name = p?.payload?.name;
        if (uid && uid !== meId) {
          setTypingUsers((prev) => ({ ...prev, [uid]: Date.now() }));
          if (name) setProfiles((pr) => (pr[uid] ? pr : { ...pr, [uid]: { display_name: name } }));
          clearTimeout(typingTimers.current[uid]);
          typingTimers.current[uid] = setTimeout(() => {
            setTypingUsers((prev) => {
              const n = { ...prev };
              delete n[uid];
              return n;
            });
          }, 3500);
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        if (isDM && otherUser) setPresenceOnline(!!(state[otherUser.id] && state[otherUser.id].length));
        else setPresenceOnline(Object.keys(state).length > 1);
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") await ch.track({ userId: meId, at: Date.now() });
      });
    channelRef.current = ch;

    return () => {
      mounted = false;
      Object.values(typingTimers.current).forEach(clearTimeout);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, groupId]);

  const broadcastTyping = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: meId, name: currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] },
    });
  }, [meId, currentUser]);

  const insertMessage = useCallback(async (payload: any, optimistic: any) => {
    setMsgs((prev) => [...prev, optimistic]);
    const { data, error } = await supabase.from("messages").insert(payload).select().single();
    if (error) {
      setMsgs((prev) => prev.map((m) => (m.id === optimistic.id ? { ...m, _status: "failed" } : m)));
      return null;
    }
    if (data) {
      setMsgs((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev.filter((m) => m.id !== optimistic.id);
        return prev.map((m) => (m.id === optimistic.id ? { ...data, _status: "sent" } : m));
      });
      return data;
    }
    return null;
  }, []);

  const toggleReaction = useCallback(async (msg: any, emoji: string) => {
    const mine = (reactions[msg.id] || []).find((r) => r.user_id === meId && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => ({ ...prev, [msg.id]: (prev[msg.id] || []).filter((r) => !(r.user_id === meId && r.emoji === emoji)) }));
      await supabase.from("message_reactions").delete().eq("message_id", msg.id).eq("user_id", meId).eq("emoji", emoji);
    } else {
      const optimistic = { message_id: msg.id, user_id: meId, emoji };
      setReactions((prev) => ({ ...prev, [msg.id]: [...(prev[msg.id] || []), optimistic] }));
      await supabase.from("message_reactions").insert(optimistic);
    }
  }, [reactions, meId]);

  const deleteMsg = useCallback(async (msg: any) => {
    setMsgs((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_deleted: true } : m)));
    await supabase.from("messages").update({ is_deleted: true, content: "", media_url: null }).eq("id", msg.id);
  }, []);

  const pinMsg = useCallback(async (msg: any) => {
    setMsgs((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: true } : m)));
    setPinnedIds((p) => (p.includes(msg.id) ? p : [...p, msg.id]));
    await supabase.from("messages").update({ is_pinned: true }).eq("id", msg.id);
    if (groupId) await supabase.from("groups").update({ pinned_message_id: msg.id }).eq("id", groupId);
  }, [groupId]);

  const unpinMsg = useCallback(async (msg: any) => {
    setMsgs((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned: false } : m)));
    setPinnedIds((p) => p.filter((id) => id !== msg.id));
    await supabase.from("messages").update({ is_pinned: false }).eq("id", msg.id);
    if (groupId && group?.pinned_message_id === msg.id) {
      await supabase.from("groups").update({ pinned_message_id: null }).eq("id", groupId);
    }
  }, [groupId, group?.pinned_message_id]);

  const editMsg = useCallback(async (msg: any, text: string) => {
    const editedAt = new Date().toISOString();
    setMsgs((prev) => prev.map((m) => (m.id === msg.id ? { ...m, content: text, edited_at: editedAt } : m)));
    await supabase.from("messages").update({ content: text, edited_at: editedAt }).eq("id", msg.id);
  }, []);

  const retry = useCallback(async (msg: any) => {
    setMsgs((prev) => prev.filter((m) => m.id !== msg.id));
    const { _status, id, created_at, ...payload } = msg;
    await insertMessage(payload, { ...msg, id: `tmp-${Date.now()}`, _status: "pending" });
  }, [insertMessage]);

  const markVisible = useCallback((id: string) => {
    if (String(id).startsWith("tmp")) return;
    supabase.from("message_views").upsert({ message_id: id, user_id: meId }, { onConflict: "message_id,user_id" }).then(() => {});
  }, [meId]);

  return {
    msgs, setMsgs, loading,
    profiles, ensureProfiles,
    reactions, loadReactions,
    readByOthers, typingUsers, presenceOnline,
    myRole, isAdmin, pinnedIds, channelRef,
    broadcastTyping, insertMessage, toggleReaction,
    deleteMsg, pinMsg, unpinMsg, editMsg, retry, markVisible,
  };
}
