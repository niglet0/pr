// Distraction-free sandbox shown when Deep Focus is ON.
// Renders only the developer's currently-claimed bounty (status = 'claimed')
// plus a pure-frontend Pomodoro countdown. Mounts in place of the
// regular shell (nav + header are hidden by AppShell).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Avatar, Button, Card, Icon, Skeleton } from "./UI";
import { focusStore } from "../lib/focusStore";

const DEFAULT_MIN = 25;
const fmt = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
};

type Claimed = {
  id: string;
  title: string;
  description: string;
  amount: number;
  language: string | null;
  difficulty: string | null;
  repo_url: string | null;
  poster_id: string;
  poster_github: string | null;
  poster_avatar: string | null;
  claimed_at: string | null;
};

export function FocusSandbox({ userId }: { userId: string }) {
  const [items, setItems] = useState<Claimed[] | null>(null);
  const [minutes, setMinutes] = useState(DEFAULT_MIN);
  const [remaining, setRemaining] = useState(DEFAULT_MIN * 60);
  const [running, setRunning] = useState(false);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("v_dev_bounties")
        .select("id,title,description,amount,language,difficulty,repo_url,poster_id,poster_github,poster_avatar,claimed_at")
        .eq("claimant_id", userId)
        .eq("status", "claimed")
        .order("claimed_at", { ascending: false });
      if (alive) setItems((data as Claimed[]) || []);
    })();
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => { setRemaining(minutes * 60); }, [minutes]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { setRunning(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [running]);

  const pct = useMemo(() => 1 - remaining / (minutes * 60 || 1), [remaining, minutes]);
  const circumference = 2 * Math.PI * 86;

  const exit = () => focusStore.set({ active: false });

  return (
    <div className="fixed inset-0 z-[200] bg-[#0F0F10] text-white overflow-y-auto no-scrollbar">
      {/* subtle imperial vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, rgba(197,160,89,0.18), transparent 60%), radial-gradient(80% 60% at 50% 110%, rgba(120,72,176,0.10), transparent 60%)",
        }}
      />

      <div className="relative max-w-[480px] mx-auto px-5 pt-10 pb-16 min-h-screen flex flex-col">
        {/* Top strip */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#C5A059] text-[#0F0F10] flex items-center justify-center font-black text-[10px] tracking-tighter">
              SPQR
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#C5A059]">Deep Focus</p>
              <p className="text-[10px] font-medium text-white/50 tracking-tight -mt-0.5">All channels silenced</p>
            </div>
          </div>
          <button
            onClick={exit}
            className="text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white px-3 py-1.5 rounded-full border border-white/15 active:scale-95"
          >
            Exit
          </button>
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center mt-2 mb-10">
          <div className="relative w-[200px] h-[200px]">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              <circle cx="100" cy="100" r="86" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
              <circle
                cx="100" cy="100" r="86"
                stroke="#C5A059" strokeWidth="6" fill="none" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                style={{ transition: "stroke-dashoffset 0.6s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[44px] font-black tabular-nums tracking-tight">{fmt(remaining)}</span>
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50 mt-1">
                {running ? "Flow" : remaining === 0 ? "Done" : "Ready"}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            {[15, 25, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => { setMinutes(m); setRunning(false); }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  minutes === m
                    ? "bg-[#C5A059] text-[#0F0F10] border-[#C5A059]"
                    : "bg-white/5 text-white/70 border-white/15 hover:text-white"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setRunning((r) => !r)}
              className="!bg-[#C5A059] !text-[#0F0F10]"
            >
              <Icon name={running ? "Pause" : "Play"} size={13} />
              {running ? "Pause" : remaining === 0 ? "Restart" : "Start"}
            </Button>
            <button
              onClick={() => { setRemaining(minutes * 60); setRunning(false); }}
              className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white border border-white/15"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Claimed bounty(ies) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">
              Your Claimed Contract{items && items.length > 1 ? "s" : ""}
            </span>
            <div className="flex-1 h-[1px] bg-white/10" />
          </div>

          {items === null && (
            <Card className="p-4 bg-white/5 border-white/10">
              <Skeleton width="60%" height={14} className="mb-2" />
              <Skeleton width="100%" height={10} />
            </Card>
          )}

          {items && items.length === 0 && (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
              <div className="w-12 h-12 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center mx-auto mb-3">
                <Icon name="Target" size={20} className="text-[#C5A059]" />
              </div>
              <p className="text-[12px] font-black uppercase tracking-widest text-white/80">No active claim</p>
              <p className="text-[11px] text-white/50 mt-1.5 leading-relaxed">
                Claim a bounty in the Coders Hub to lock into deep work.
              </p>
            </div>
          )}

          {items?.map((b) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-4 bg-white/[0.04] border-white/10 rounded-2xl">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#3B82F6] bg-[#3B82F6]/15 px-1.5 py-0.5 rounded">
                        Claimed
                      </span>
                      {b.language && (
                        <span className="text-[10px] text-white/60 font-bold">{b.language}</span>
                      )}
                      {b.difficulty && (
                        <span className="text-[10px] text-white/40 font-bold">· {b.difficulty}</span>
                      )}
                    </div>
                    <h3 className="text-[14px] font-bold leading-snug text-white line-clamp-2">{b.title}</h3>
                  </div>
                  <div className="shrink-0 inline-flex items-center gap-1 bg-[#C5A059]/15 text-[#C5A059] px-2.5 py-1 rounded-lg border border-[#C5A059]/30">
                    <Icon name="Coins" size={11} />
                    <span className="text-[13px] font-black">{b.amount}</span>
                  </div>
                </div>
                {b.description && (
                  <p className="text-[12px] text-white/65 leading-relaxed whitespace-pre-wrap line-clamp-5">{b.description}</p>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                  <Avatar src={b.poster_avatar || undefined} seed={b.poster_id} size={20} />
                  <span className="text-[11px] text-white/60 font-bold truncate">
                    {b.poster_github ? `@${b.poster_github}` : "Anonymous"}
                  </span>
                  <div className="flex-1" />
                  {b.repo_url && (
                    <a
                      href={b.repo_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#C5A059]"
                    >
                      <Icon name="GitBranch" size={11} /> repo
                    </a>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-auto pt-10 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
          Notifications · Feed · Chats — muted
        </div>
      </div>
    </div>
  );
}
