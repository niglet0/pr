import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Avatar, Card, Icon, cn } from "./UI";

type Period = "week" | "month" | "alltime";

type Leader = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  earned: number;
  bounties: number;
};

function getRankTier(bounties: number) {
  if (bounties >= 31) return { label: "Consul",    color: "#6B3FB0" };
  if (bounties >= 11) return { label: "Senator",   color: "#A07A2E" };
  if (bounties >= 3)  return { label: "Tribune",   color: "#5B6470" };
  return               { label: "Plebeian",  color: "#8C5A2B" };
}

export function LeaderboardPanel({ currentUserId }: { currentUserId?: string }) {
  const [period, setPeriod] = useState<Period>("week");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("dev_bounties")
          .select("claimant_id, amount, closed_at")
          .eq("status", "approved")
          .not("claimant_id", "is", null);

        if (period === "week") {
          const since = new Date();
          since.setDate(since.getDate() - 7);
          query = query.gte("closed_at", since.toISOString());
        } else if (period === "month") {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          query = query.gte("closed_at", since.toISOString());
        }

        const { data: rows } = await query.limit(300);

        if (!rows || rows.length === 0) {
          setLeaders([]);
          setLoading(false);
          return;
        }

        const agg: Record<string, { earned: number; bounties: number }> = {};
        rows.forEach((r: any) => {
          if (!r.claimant_id) return;
          if (!agg[r.claimant_id]) agg[r.claimant_id] = { earned: 0, bounties: 0 };
          agg[r.claimant_id].earned += r.amount || 0;
          agg[r.claimant_id].bounties += 1;
        });

        const sorted = Object.entries(agg)
          .sort((a, b) => b[1].earned - a[1].earned)
          .slice(0, 10);

        const ids = sorted.map(([id]) => id);
        const { data: users } = await supabase
          .from("users")
          .select("id, display_name, username, avatar_url")
          .in("id", ids);
        const userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]));

        setLeaders(
          sorted.map(([id, stats]) => ({
            user_id: id,
            display_name: userMap[id]?.display_name || "Citizen",
            username: userMap[id]?.username || id.slice(0, 6),
            avatar_url: userMap[id]?.avatar_url || null,
            earned: stats.earned,
            bounties: stats.bounties,
          }))
        );
      } catch {
        setLeaders([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [period]);

  const PERIOD_LABELS: Record<Period, string> = {
    week: "This Week",
    month: "This Month",
    alltime: "All Time",
  };

  return (
    <div className="px-4 pb-8">
      {/* Period selector */}
      <div className="flex gap-1.5 mb-4">
        {(["week", "month", "alltime"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "flex-1 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              period === p
                ? "bg-[#C5A059] text-white shadow-sm shadow-[#C5A059]/30"
                : "bg-white border border-[#E5E3DB] text-[#7A7A7A] hover:border-[#C5A059]/40"
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Icon name="Loader2" size={24} className="animate-spin text-[#C5A059]" />
        </div>
      ) : leaders.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#C5A059]/10 mx-auto flex items-center justify-center mb-4">
            <Icon name="Trophy" size={28} className="text-[#C5A059]" />
          </div>
          <p className="font-bold text-[#202020] serif text-[17px]">No conquests recorded</p>
          <p className="text-[12px] text-[#7A7A7A] mt-1">
            Solve bounties this {period === "week" ? "week" : period === "month" ? "month" : "season"} to claim glory.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaders.map((leader, idx) => {
            const isMe = leader.user_id === currentUserId;
            const tier = getRankTier(leader.bounties);
            const podiumColors = ["#C5A059", "#9CA3AF", "#8C5A2B"];
            const podiumColor = idx < 3 ? podiumColors[idx] : undefined;

            return (
              <motion.div
                key={leader.user_id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
              >
                <Card
                  className={cn(
                    "p-3 flex items-center gap-3 bg-white transition-all",
                    isMe && "border-[#C5A059]/40 bg-[#C5A059]/[0.03]",
                    idx === 0 && "border-[#C5A059]/30 shadow-sm"
                  )}
                >
                  {/* Rank badge */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black shrink-0"
                    style={
                      podiumColor
                        ? { background: `${podiumColor}20`, color: podiumColor }
                        : { background: "#F3F1EC", color: "#7A7A7A" }
                    }
                  >
                    {idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : (
                      <span className="text-[11px]">{idx + 1}</span>
                    )}
                  </div>

                  <Avatar src={leader.avatar_url ?? undefined} seed={leader.username} size={36} ring={isMe} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-[13px] font-bold truncate", isMe ? "text-[#C5A059]" : "text-[#202020]")}>
                        {leader.display_name}
                      </span>
                      {isMe && (
                        <span className="text-[9px] font-black bg-[#C5A059] text-white px-1.5 py-0.5 rounded-full shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: tier.color }}>
                        {tier.label}
                      </span>
                      <span className="text-[9px] text-[#7A7A7A]">·</span>
                      <span className="text-[9px] text-[#7A7A7A]">{leader.bounties} bounties</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[15px] font-black text-[#C5A059] serif leading-none">
                      {leader.earned.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-[#7A7A7A] font-bold uppercase tracking-wider mt-0.5">credits</div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
