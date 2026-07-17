import React, { useEffect, useState } from "react";
import { Icon, cn } from "../../UI";
import { supabase } from "../../../integrations/supabase/client";

export function PollBubble({ messageId, meId, me }: { messageId: string; meId?: string; me?: boolean }) {
  const [poll, setPoll] = useState<any | null>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const { data: p } = await supabase.from("polls").select("*").eq("message_id", messageId).maybeSingle();
    if (!p) { setPoll(null); return; }
    setPoll(p);
    const { data: v } = await supabase.from("poll_votes").select("*").eq("poll_id", p.id);
    setVotes(v || []);
  };

  useEffect(() => { reload(); }, [messageId]);
  useEffect(() => {
    const ch = supabase.channel(`poll_${messageId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "polls", filter: `message_id=eq.${messageId}` }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [messageId]);

  if (!poll) {
    return <p className={cn("text-[12.5px] italic", me ? "text-white/80" : "text-[var(--ios-ink-3)]")}>Loading poll…</p>;
  }

  const options: string[] = Array.isArray(poll.options) ? poll.options : [];
  const total = votes.length;
  const counts = options.map((_, i) => votes.filter((v) => v.option_idx === i).length);
  const myVotes = new Set(votes.filter((v) => v.user_id === meId).map((v) => v.option_idx));

  const vote = async (idx: number) => {
    if (!meId || poll.closed || busy) return;
    setBusy(true);
    try {
      if (myVotes.has(idx)) {
        await supabase.from("poll_votes").delete().eq("poll_id", poll.id).eq("user_id", meId).eq("option_idx", idx);
      } else {
        if (!poll.multiple) {
          await supabase.from("poll_votes").delete().eq("poll_id", poll.id).eq("user_id", meId);
        }
        await supabase.from("poll_votes").insert({ poll_id: poll.id, user_id: meId, option_idx: idx });
      }
      await reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="min-w-[240px] space-y-2">
      <div>
        <p className={cn("text-[14.5px] font-bold leading-snug", me ? "text-white" : "text-[var(--ios-ink)]")}>{poll.question}</p>
        <p className={cn("text-[10.5px] uppercase tracking-wider mt-0.5", me ? "text-white/80" : "text-[var(--ios-ink-3)]")}>
          {poll.anonymous ? "Anonymous" : "Public"} {poll.multiple ? "· Multiple" : ""} {poll.closed ? "· Closed" : ""}
        </p>
      </div>
      <div className="space-y-1.5">
        {options.map((o, i) => {
          const c = counts[i] || 0;
          const pct = total ? Math.round((c / total) * 100) : 0;
          const mine = myVotes.has(i);
          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={poll.closed}
              className={cn(
                "relative w-full text-left px-3 py-2 rounded-xl overflow-hidden transition",
                me ? "bg-white/15 hover:bg-white/20" : "bg-[var(--ios-bg-soft)] hover:bg-[var(--ios-bg-soft)]/80",
                mine && "ring-2",
                mine && (me ? "ring-white/60" : "ring-[var(--ios-blue)]")
              )}
            >
              <span className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, background: me ? "rgba(255,255,255,0.18)" : "rgba(0,122,255,0.10)" }} />
              <span className="relative flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-[14px]">
                  {mine && <Icon name="CheckCircle2" size={14} className={me ? "text-white" : "text-[var(--ios-blue)]"} />}
                  {o}
                </span>
                <span className="text-[12px] font-bold tabular-nums">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={cn("text-[11px]", me ? "text-white/75" : "text-[var(--ios-ink-3)]")}>{total} vote{total === 1 ? "" : "s"}</p>
    </div>
  );
}
