// Specialised "System Contract" card rendered in the Home feed
// when a bounty transitions to Paid (status='approved').
import React from "react";
import { motion } from "motion/react";
import { Card, Avatar, Icon } from "./UI";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178C6", JavaScript: "#F7DF1E", Python: "#3776AB", Rust: "#DEA584",
  Go: "#00ADD8", Solidity: "#363636", Swift: "#FA7343", Kotlin: "#A97BFF",
  C: "#555555", "C++": "#F34B7D", Java: "#B07219", Ruby: "#CC342D", PHP: "#777BB4",
  HTML: "#E34F26", CSS: "#1572B6", Shell: "#89E051", Dart: "#00B4AB",
};

export type ContractEvent = {
  id: string;
  title: string;
  amount: number;
  language: string | null;
  difficulty: string | null;
  closed_at: string | null;
  submission_url: string | null;
  repo_url: string | null;
  poster_id: string;
  poster_github: string | null;
  poster_avatar: string | null;
  claimant_id: string | null;
  claimant_github: string | null;
  claimant_avatar: string | null;
};

export function SystemContractCard({ ev, onView }: { ev: ContractEvent; onView?: () => void }) {
  const lang = ev.language || "—";
  const langColor = LANG_COLORS[ev.language || ""] || "#C5A059";
  const codeHref = ev.submission_url || ev.repo_url || null;
  const stamp = ev.closed_at ? new Date(ev.closed_at) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <Card className="p-0 overflow-hidden rounded-3xl border-[#C5A059]/25 bg-gradient-to-b from-[#FFFBF2] to-white">
        {/* Header strip */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#202020] text-[#C5A059]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[#C5A059]/15 border border-[#C5A059]/40 flex items-center justify-center">
              <Icon name="Scroll" size={11} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.18em]">System Contract</span>
            <span className="text-[10px] font-bold tracking-tight text-[#C5A059]/70">· #{ev.id.slice(0, 6)}</span>
          </div>
          <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#10B981]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> Paid
          </div>
        </div>

        <div className="p-4 space-y-3">
          <h4 className="text-[14px] font-bold leading-snug line-clamp-2 text-[#202020]">{ev.title}</h4>

          {/* Transfer row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar src={ev.poster_avatar || undefined} seed={ev.poster_id} size={26} />
              <span className="text-[11px] font-bold truncate max-w-[90px]">
                {ev.poster_github ? `@${ev.poster_github}` : "anon"}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-1.5 px-2">
              <div className="flex-1 h-[1px] bg-[#C5A059]/30" />
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#C5A059]/12 border border-[#C5A059]/30 text-[#C5A059]">
                <Icon name="Coins" size={11} />
                <span className="text-[11px] font-black tracking-tight">{ev.amount}</span>
              </div>
              <Icon name="ArrowRight" size={12} className="text-[#C5A059]" />
              <div className="flex-1 h-[1px] bg-[#C5A059]/30" />
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar src={ev.claimant_avatar || undefined} seed={ev.claimant_id || ev.id} size={26} />
              <span className="text-[11px] font-bold truncate max-w-[90px]">
                {ev.claimant_github ? `@${ev.claimant_github}` : "anon"}
              </span>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border border-[#E5E3DB] bg-white">
              <span className="w-2 h-2 rounded-full" style={{ background: langColor }} />
              {lang}
            </span>
            {ev.difficulty && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">{ev.difficulty}</span>
            )}
            {stamp && (
              <span className="text-[10px] font-medium text-[#7A7A7A] ml-auto">
                {stamp.toLocaleDateString()}
              </span>
            )}
          </div>

          {codeHref && (
            <a
              href={codeHref}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { if (onView) { e.preventDefault(); onView(); } }}
              className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#C5A059] hover:underline"
            >
              <Icon name="Code2" size={12} />
              View code
            </a>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
