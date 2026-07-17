import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Avatar, Icon, cn } from "../../UI";
import { supabase } from "../../../integrations/supabase/client";

export function ForwardSheet({
  meId,
  message,
  originName,
  onClose,
  onForwarded,
}: {
  meId: string;
  message: any;
  originName?: string;
  onClose: () => void;
  onForwarded?: () => void;
}) {
  const [convs, setConvs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("conversations").select("*").or(`participant_1.eq.${meId},participant_2.eq.${meId}`).order("last_message_at", { ascending: false });
      const ids = (c || []).map((x: any) => x.participant_1 === meId ? x.participant_2 : x.participant_1);
      const { data: u } = ids.length ? await supabase.from("users").select("id, display_name, username, avatar_url").in("id", ids) : { data: [] as any[] };
      setConvs((c || []).map((x: any) => ({ ...x, other: (u || []).find((y: any) => y.id === (x.participant_1 === meId ? x.participant_2 : x.participant_1)) })));
      const { data: mem } = await supabase.from("group_members").select("group_id").eq("user_id", meId);
      const gids = (mem || []).map((m: any) => m.group_id);
      if (gids.length) {
        const { data: gs } = await supabase.from("groups").select("*").in("id", gids);
        setGroups(gs || []);
      }
    })();
  }, [meId]);

  const sendTo = async (target: { kind: "dm" | "group"; id: string; convId?: string; receiverId?: string; groupId?: string }) => {
    setSending(target.id);
    const base: any = {
      sender_id: meId,
      content: message.content || "",
      type: message.type || "text",
      media_url: message.media_url || null,
      media_meta: message.media_meta || null,
      forward_from_chat: message.group_id || message.conversation_id || null,
      forward_from_name: originName || null,
    };
    if (target.kind === "dm") { base.conversation_id = target.convId; base.receiver_id = target.receiverId; }
    else base.group_id = target.groupId;
    await supabase.from("messages").insert(base);
    setSending(null);
    onForwarded?.();
    onClose();
  };

  const filt = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-[85] bg-black/40 flex items-end chat-ios">
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }} onClick={(e) => e.stopPropagation()} className="w-full bg-[var(--ios-bg-soft)] rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--ios-sep)] flex items-center justify-between">
          <button onClick={onClose} className="text-[var(--ios-blue)] text-[15px] font-medium">Cancel</button>
          <h3 className="font-bold text-[15px]">Forward to…</h3>
          <span className="w-12" />
        </div>
        <div className="px-3 py-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full bg-white rounded-xl px-3 py-2 text-[14px] outline-none border border-[var(--ios-sep)]" />
        </div>
        <div className="overflow-y-auto flex-1 pb-6 px-2">
          {convs.filter((c) => filt(c.other?.display_name || "")).map((c) => (
            <button key={c.id} disabled={sending === c.id} onClick={() => sendTo({ kind: "dm", id: c.id, convId: c.id, receiverId: c.other?.id })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-white ios-tap">
              <Avatar src={c.other?.avatar_url} seed={c.other?.username} size={42} />
              <span className="flex-1 text-left text-[15px] font-bold truncate">{c.other?.display_name || "User"}</span>
              {sending === c.id && <Icon name="Loader2" size={16} className="animate-spin text-[var(--ios-blue)]" />}
            </button>
          ))}
          {groups.filter((g) => filt(g.name || "")).map((g) => (
            <button key={g.id} disabled={sending === g.id} onClick={() => sendTo({ kind: "group", id: g.id, groupId: g.id })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-white ios-tap">
              <Avatar src={g.avatar_url} seed={g.id} size={42} />
              <div className="flex-1 text-left min-w-0">
                <p className="text-[15px] font-bold truncate flex items-center gap-1">{g.name}{g.is_channel && <Icon name="Megaphone" size={12} className="text-[var(--ios-blue)]" />}</p>
                <p className="text-[11.5px] text-[var(--ios-ink-3)]">{g.is_channel ? "Channel" : "Group"}</p>
              </div>
              {sending === g.id && <Icon name="Loader2" size={16} className="animate-spin text-[var(--ios-blue)]" />}
            </button>
          ))}
          {convs.length === 0 && groups.length === 0 && (
            <p className="text-center text-[var(--ios-ink-3)] py-12 text-[13px]">No chats yet</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
