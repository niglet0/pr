import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../integrations/supabase/client";

const WEEKS = 26;
const DAYS = 7;

function getColor(count: number): string {
  if (count === 0) return "#F3F1EC";
  if (count === 1) return "rgba(197,160,89,0.30)";
  if (count === 2) return "rgba(197,160,89,0.50)";
  if (count <= 4) return "rgba(197,160,89,0.75)";
  return "#C5A059";
}

export function ActivityHeatmap({ userId }: { userId: string }) {
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - WEEKS * 7);
        const { data: rows } = await supabase
          .from("activity_log")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", since.toISOString());
        const counts: Record<string, number> = {};
        (rows || []).forEach((r: any) => {
          const day = r.created_at.slice(0, 10);
          counts[day] = (counts[day] || 0) + 1;
        });
        setData(counts);
      } catch {
        setData({});
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [userId]);

  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    const weeks: string[][] = [];
    const cur = new Date(start);
    for (let w = 0; w < WEEKS; w++) {
      const week: string[] = [];
      for (let d = 0; d < DAYS; d++) {
        week.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, []);

  const monthLabels = useMemo(() => {
    const labels: { label: string; wi: number }[] = [];
    let last = -1;
    grid.forEach((week, wi) => {
      const month = new Date(week[0]).getMonth();
      if (month !== last) {
        labels.push({ label: new Date(week[0]).toLocaleString("default", { month: "short" }), wi });
        last = month;
      }
    });
    return labels;
  }, [grid]);

  const total = useMemo(() => Object.values(data).reduce((a, b) => a + b, 0), [data]);

  if (loading) return null;

  return (
    <div className="mt-4 bg-white border border-[#E5E3DB] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-[#7A7A7A]">Activity</span>
        <span className="text-[10px] font-bold text-[#C5A059]">
          {total === 0 ? "Start engaging to build your heatmap" : `${total} actions · 6 months`}
        </span>
      </div>

      <div>
        {/* Month labels */}
        <div className="flex gap-[3px] mb-[3px]">
          {grid.map((_, wi) => {
            const label = monthLabels.find((m) => m.wi === wi);
            return (
              <div key={wi} style={{ width: 10, minWidth: 10, flexShrink: 0 }}>
                {label && (
                  <span className="text-[8px] text-[#7A7A7A] font-bold">{label.label}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Cells */}
        <div className="flex gap-[3px]">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => {
                const count = data[day] || 0;
                return (
                  <div
                    key={day}
                    title={`${day}: ${count} action${count !== 1 ? "s" : ""}`}
                    className="w-[10px] h-[10px] rounded-[2px] cursor-default transition-transform hover:scale-125"
                    style={{ background: getColor(count) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-[9px] text-[#7A7A7A]">Less</span>
        {[0, 1, 2, 4, 6].map((v) => (
          <div key={v} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: getColor(v) }} />
        ))}
        <span className="text-[9px] text-[#7A7A7A]">More</span>
      </div>
    </div>
  );
}
