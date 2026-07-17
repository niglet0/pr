import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { Avatar, Icon, cn } from "./UI";

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  actor_id?: string | null;
  action_url?: string | null;
  read: boolean;
  created_at: string;
  actor?: { display_name: string; avatar_url: string | null; username: string } | null;
};

const KIND_META: Record<string, { icon: string; color: string; bg: string }> = {
  like:              { icon: "Heart",        color: "#EF4444", bg: "#FEF2F2"  },
  comment:           { icon: "MessageCircle",color: "#3B82F6", bg: "#EFF6FF"  },
  follow:            { icon: "UserPlus",     color: "#8B5CF6", bg: "#F5F3FF"  },
  bounty_claimed:    { icon: "Hand",         color: "#F59E0B", bg: "#FFFBEB"  },
  bounty_approved:   { icon: "Coins",        color: "#C5A059", bg: "#FDF8EE"  },
  bounty_cancelled:  { icon: "XCircle",      color: "#7A7A7A", bg: "#F3F1EC"  },
  marketplace_order: { icon: "ShoppingBag",  color: "#10B981", bg: "#ECFDF5"  },
  mention:           { icon: "AtSign",       color: "#6366F1", bg: "#EEF2FF"  },
  company_follow:    { icon: "Building2",    color: "#C5A059", bg: "#FDF8EE"  },
  repost:            { icon: "Repeat2",      color: "#0EA5E9", bg: "#F0F9FF"  },
};

function timeAgo(d: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationsDrawer({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        const actorIds = [...new Set(data.map((n: any) => n.actor_id).filter(Boolean))];
        let actorMap: Record<string, any> = {};
        if (actorIds.length > 0) {
          const { data: actors } = await supabase
            .from("users")
            .select("id, display_name, avatar_url, username")
            .in("id", actorIds);
          actorMap = Object.fromEntries((actors || []).map((a: any) => [a.id, a]));
        }
        setNotifications(
          data.map((n: any) => ({
            ...n,
            actor: n.actor_id ? actorMap[n.actor_id] ?? null : null,
          }))
        );
      } else {
        setNotifications([]);
      }
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif_drawer:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const markAllRead = async () => {
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("read", false);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const markRead = async (id: string) => {
    try {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {}
  };

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-[200] bg-black/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="absolute left-0 right-0 bottom-0 z-[210] bg-[#FAF9F6] rounded-t-3xl border-t border-[#C5A059]/20 shadow-2xl"
            style={{ maxHeight: "80vh" }}
          >
            <div className="w-10 h-1 rounded-full bg-[#E5E3DB] mx-auto mt-3 mb-1" />

            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E3DB]">
              <div className="flex items-center gap-2">
                <Icon name="Bell" size={17} className="text-[#C5A059]" />
                <h2 className="text-[15px] font-black tracking-tight serif">Dispatches</h2>
                {unread > 0 && (
                  <span className="text-[10px] font-black bg-[#C5A059] text-white px-2 py-0.5 rounded-full leading-none">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] font-bold uppercase tracking-widest text-[#C5A059] hover:text-[#C5A059]/70 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[#F3F1EC] transition-colors">
                  <Icon name="X" size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 80px)" }}>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Icon name="Loader2" size={24} className="animate-spin text-[#C5A059]" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-[#C5A059]/10 flex items-center justify-center mb-4">
                    <Icon name="Bell" size={28} className="text-[#C5A059]" />
                  </div>
                  <p className="font-bold text-[#202020] serif text-[17px]">Silence from the Senate</p>
                  <p className="text-[12px] text-[#7A7A7A] mt-1.5 leading-relaxed max-w-[220px]">
                    No dispatches yet. Engage with the Legion to receive updates.
                  </p>
                </div>
              ) : (
                <div>
                  {notifications.map((n) => {
                    const meta = KIND_META[n.kind] ?? KIND_META.mention;
                    return (
                      <button
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={cn(
                          "w-full flex items-start gap-3 px-5 py-4 text-left border-b border-[#E5E3DB]/60 transition-colors",
                          !n.read ? "bg-[#C5A059]/[0.04]" : "hover:bg-[#F3F1EC]/60"
                        )}
                      >
                        <div className="relative shrink-0">
                          {n.actor?.avatar_url ? (
                            <Avatar src={n.actor.avatar_url} seed={n.actor_id ?? ""} size={38} />
                          ) : (
                            <div
                              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
                              style={{ background: meta.bg }}
                            >
                              <Icon name={meta.icon as any} size={17} color={meta.color} />
                            </div>
                          )}
                          {n.actor && (
                            <div
                              className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#FAF9F6] flex items-center justify-center"
                              style={{ background: meta.bg, width: 18, height: 18 }}
                            >
                              <Icon name={meta.icon as any} size={9} color={meta.color} />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={cn("text-[13px] leading-snug", !n.read ? "font-bold" : "font-medium text-[#202020]")}>
                            {n.actor && (
                              <span className="font-black">{n.actor.display_name}{" "}</span>
                            )}
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-[11px] text-[#7A7A7A] mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-[#C5A059] font-bold mt-1">{timeAgo(n.created_at)}</p>
                        </div>

                        {!n.read && (
                          <div className="w-2 h-2 rounded-full bg-[#C5A059] mt-2 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function useUnreadCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { count: c } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false);
      setCount(c ?? 0);
    } catch {
      setCount(0);
    }
  }, [userId]);

  useEffect(() => {
    fetchCount();
    if (!userId) return;
    const channel = supabase
      .channel(`notif_count:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        fetchCount
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchCount]);

  return count;
}
