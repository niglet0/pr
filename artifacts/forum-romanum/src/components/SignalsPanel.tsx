import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Icon, Card, cn } from "./UI";

interface Metric {
  label: string;
  value: string | number;
  sub?: string;
  icon: any;
  color: string;
  trend?: "up" | "down" | "flat";
  delta?: string;
}

function MetricCard({ metric, delay }: { metric: Metric; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white border border-[#E5E3DB] rounded-2xl p-4"
    >
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${metric.color}18` }}
        >
          <Icon name={metric.icon} size={15} color={metric.color} />
        </div>
        {metric.trend && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-[9px] font-black px-2 py-0.5 rounded-full",
              metric.trend === "up" ? "text-emerald-600 bg-emerald-50" :
              metric.trend === "down" ? "text-red-500 bg-red-50" :
              "text-[#7A7A7A] bg-[#F3F1EC]"
            )}
          >
            <Icon
              name={metric.trend === "up" ? "TrendingUp" : metric.trend === "down" ? "TrendingDown" : "Minus"}
              size={9}
            />
            {metric.delta}
          </div>
        )}
      </div>
      <div className="text-[22px] font-black text-[#202020] leading-none">{metric.value}</div>
      <div className="text-[10px] font-bold text-[#7A7A7A] uppercase tracking-widest mt-1">{metric.label}</div>
      {metric.sub && <div className="text-[9px] text-[#7A7A7A] mt-0.5">{metric.sub}</div>}
    </motion.div>
  );
}

function SparkBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all"
          style={{
            height: `${Math.max(4, (v / max) * 100)}%`,
            background: i === values.length - 1 ? color : `${color}50`,
          }}
        />
      ))}
    </div>
  );
}

export function SignalsPanel({ currentUserId }: { currentUserId?: string }) {
  const [stats, setStats] = useState({
    posts: 0,
    likes: 0,
    comments: 0,
    followers: 0,
    following: 0,
    listings: 0,
    revenue: 0,
    bounties: 0,
    bountiesOpen: 0,
    topPost: null as any,
    weekPosts: [] as number[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const [postsRes, followersRes, followingRes, listingsRes, bountiesRes] = await Promise.all([
          supabase.from("posts").select("id,likes_count,comments_count,created_at").eq("author_id", currentUserId),
          supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", currentUserId),
          supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", currentUserId),
          supabase.from("marketplace_listings").select("id,revenue_cents,status").eq("seller_id", currentUserId),
          supabase.from("dev_bounties").select("id,status,amount").eq("poster_id", currentUserId),
        ]);

        const posts = postsRes.data || [];
        const totalLikes = posts.reduce((a: number, p: any) => a + (p.likes_count || 0), 0);
        const totalComments = posts.reduce((a: number, p: any) => a + (p.comments_count || 0), 0);
        const topPost = posts.sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0))[0] || null;

        const listings = listingsRes.data || [];
        const revenue = listings.reduce((a: number, l: any) => a + (l.revenue_cents || 0), 0);

        const bounties = bountiesRes.data || [];
        const bountiesOpen = bounties.filter((b: any) => b.status === "open").length;

        // posts per day last 7 days
        const now = Date.now();
        const weekPosts = Array.from({ length: 7 }, (_, i) => {
          const day = new Date(now - (6 - i) * 86400000).toISOString().split("T")[0];
          return posts.filter((p: any) => p.created_at?.startsWith(day)).length;
        });

        setStats({
          posts: posts.length,
          likes: totalLikes,
          comments: totalComments,
          followers: followersRes.count || 0,
          following: followingRes.count || 0,
          listings: listings.filter((l: any) => l.status === "active").length,
          revenue,
          bounties: bounties.length,
          bountiesOpen,
          topPost,
          weekPosts,
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [currentUserId]);

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-[#F3F1EC] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const metrics: Metric[] = [
    {
      label: "Total Posts",
      value: stats.posts,
      icon: "FileText",
      color: "#C5A059",
      trend: stats.posts > 0 ? "up" : "flat",
      delta: stats.posts > 0 ? `+${stats.weekPosts[stats.weekPosts.length - 1]} today` : "–",
    },
    {
      label: "Likes Received",
      value: stats.likes,
      icon: "Heart",
      color: "#EC4899",
      trend: stats.likes > 0 ? "up" : "flat",
      delta: stats.posts > 0 ? `avg ${(stats.likes / Math.max(1, stats.posts)).toFixed(1)}/post` : "–",
    },
    {
      label: "Comments",
      value: stats.comments,
      icon: "MessageCircle",
      color: "#3B82F6",
    },
    {
      label: "Followers",
      value: stats.followers,
      icon: "Users",
      color: "#10B981",
      trend: stats.followers > 0 ? "up" : "flat",
      delta: `${stats.following} following`,
    },
    {
      label: "Active Listings",
      value: stats.listings,
      icon: "Store",
      color: "#8B5CF6",
      sub: stats.revenue > 0 ? `$${(stats.revenue / 100).toFixed(0)} earned` : "No revenue yet",
    },
    {
      label: "Bounties Posted",
      value: stats.bounties,
      icon: "Target",
      color: "#F59E0B",
      sub: stats.bountiesOpen > 0 ? `${stats.bountiesOpen} still open` : "All closed",
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      {/* Post activity sparkline */}
      <div className="bg-white border border-[#E5E3DB] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-black text-[13px] text-[#202020]">Post Activity</p>
            <p className="text-[10px] text-[#7A7A7A]">Last 7 days</p>
          </div>
          <div className="text-right">
            <p className="font-black text-[18px] text-[#C5A059]">{stats.weekPosts.reduce((a, b) => a + b, 0)}</p>
            <p className="text-[9px] text-[#7A7A7A] uppercase tracking-widest">This week</p>
          </div>
        </div>
        <SparkBar values={stats.weekPosts} color="#C5A059" />
        <div className="flex justify-between mt-1.5">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="text-[8px] font-bold text-[#7A7A7A] flex-1 text-center">{d}</span>
          ))}
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m, i) => (
          <MetricCard key={m.label} metric={m} delay={i * 0.05} />
        ))}
      </div>

      {/* Top post */}
      {stats.topPost && (
        <div className="bg-gradient-to-br from-[#1A1A1A] to-[#111] rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-[#C5A059] flex items-center justify-center">
              <Icon name="Star" size={12} color="white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059]">Top Post</span>
          </div>
          <p className="text-[12px] text-white/80 line-clamp-3 leading-relaxed">{stats.topPost.content}</p>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-[11px] font-black text-[#C5A059]">{stats.topPost.likes_count || 0} ♥</span>
            <span className="text-[11px] text-white/50">{stats.topPost.comments_count || 0} comments</span>
          </div>
        </div>
      )}

      {/* Engagement rate */}
      {stats.posts > 0 && (
        <div className="bg-white border border-[#E5E3DB] rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-3">Engagement Breakdown</p>
          {[
            { label: "Likes per post", value: (stats.likes / stats.posts).toFixed(1), max: 10, color: "#EC4899" },
            { label: "Comments per post", value: (stats.comments / stats.posts).toFixed(1), max: 5, color: "#3B82F6" },
          ].map((item) => (
            <div key={item.label} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-[#555]">{item.label}</span>
                <span className="text-[12px] font-black text-[#202020]">{item.value}</span>
              </div>
              <div className="h-1.5 bg-[#F3F1EC] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: item.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (parseFloat(item.value) / item.max) * 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
