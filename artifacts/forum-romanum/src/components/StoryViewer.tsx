import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon, Avatar } from "./UI";
import { supabase } from "../integrations/supabase/client";

type Story = {
  id: string;
  author_id: string;
  username?: string;
  avatar_url?: string;
  media_url: string;
  caption?: string;
  link_url?: string;
  created_at?: string;
};

const STORY_MS = 6000;

function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function StoryViewer({
  stories,
  initialId,
  currentUserId,
  onClose,
  onDeleted,
}: {
  stories: Story[];
  initialId: string;
  currentUserId?: string;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  // group by author, preserve order of stories list
  const groups = useMemo(() => {
    const map = new Map<string, Story[]>();
    for (const s of stories) {
      const arr = map.get(s.author_id) || [];
      arr.push(s);
      map.set(s.author_id, arr);
    }
    return Array.from(map.entries()).map(([author_id, items]) => ({ author_id, items }));
  }, [stories]);

  const initial = useMemo(() => {
    for (let g = 0; g < groups.length; g++) {
      const idx = groups[g].items.findIndex((s) => s.id === initialId);
      if (idx >= 0) return { g, idx };
    }
    return { g: 0, idx: 0 };
  }, [groups, initialId]);

  const [gIdx, setGIdx] = useState(initial.g);
  const [iIdx, setIIdx] = useState(initial.idx);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [viewCount, setViewCount] = useState<number | null>(null);

  const group = groups[gIdx];
  const story = group?.items[iIdx];
  const isOwner = !!story && currentUserId === story.author_id;

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number>(0);

  // advance helpers
  const next = () => {
    if (!group) return;
    if (iIdx < group.items.length - 1) {
      setIIdx(iIdx + 1);
    } else if (gIdx < groups.length - 1) {
      setGIdx(gIdx + 1);
      setIIdx(0);
    } else {
      onClose();
    }
    setProgress(0);
  };
  const prev = () => {
    if (iIdx > 0) setIIdx(iIdx - 1);
    else if (gIdx > 0) {
      const ng = gIdx - 1;
      setGIdx(ng);
      setIIdx(groups[ng].items.length - 1);
    }
    setProgress(0);
  };

  // progress timer
  useEffect(() => {
    startRef.current = Date.now() - progress * STORY_MS;
    const tick = () => {
      if (paused) {
        pausedAtRef.current = Date.now();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = (Date.now() - startRef.current) / STORY_MS;
      if (elapsed >= 1) {
        setProgress(0);
        next();
      } else {
        setProgress(elapsed);
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gIdx, iIdx, paused]);

  // record view + fetch viewers
  useEffect(() => {
    if (!story) return;
    setViewCount(null);
    setViewers([]);
    (async () => {
      if (currentUserId && currentUserId !== story.author_id) {
        try {
          await supabase
            .from("story_views")
            .upsert(
              { story_id: story.id, viewer_id: currentUserId },
              { onConflict: "story_id,viewer_id" }
            );
        } catch {}
      }
      if (isOwner) {
        const { count } = await supabase
          .from("story_views")
          .select("viewer_id", { count: "exact", head: true })
          .eq("story_id", story.id);
        setViewCount(count ?? 0);
      }
    })();
  }, [story?.id]);

  const openViewers = async () => {
    if (!story) return;
    setPaused(true);
    setShowViewers(true);
    const { data } = await supabase
      .from("story_views")
      .select("viewer_id, created_at, users:viewer_id(username, display_name, avatar_url)")
      .eq("story_id", story.id)
      .order("created_at", { ascending: false });
    setViewers(data || []);
  };

  const handleDelete = async () => {
    if (!story) return;
    if (!confirm("Delete this story?")) return;
    setPaused(true);
    await supabase.from("stories").delete().eq("id", story.id);
    onDeleted?.(story.id);
    // remove locally
    const newItems = group.items.filter((s) => s.id !== story.id);
    if (newItems.length === 0) {
      if (gIdx < groups.length - 1) {
        setGIdx(gIdx + 1);
        setIIdx(0);
      } else if (gIdx > 0) {
        setGIdx(gIdx - 1);
        setIIdx(0);
      } else {
        onClose();
        return;
      }
    } else if (iIdx >= newItems.length) {
      setIIdx(newItems.length - 1);
    }
    group.items.splice(0, group.items.length, ...newItems);
    setPaused(false);
    setProgress(0);
  };

  if (!story) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="story-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] bg-black flex items-center justify-center select-none"
      >
        <div className="relative w-full max-w-[440px] h-full max-h-[900px] bg-black overflow-hidden">
          {/* progress bars */}
          <div className="absolute top-2 left-2 right-2 z-30 flex gap-1">
            {group.items.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-[2.5px] bg-white/25 rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-white"
                  style={{
                    width:
                      i < iIdx
                        ? "100%"
                        : i === iIdx
                          ? `${Math.min(100, progress * 100)}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* header */}
          <div className="absolute top-6 left-3 right-3 z-30 flex items-center gap-3">
            <Avatar src={story.avatar_url} seed={story.author_id} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-[13px] font-bold truncate">
                {story.username || "unknown"}
              </div>
              <div className="text-white/60 text-[10px] font-medium">
                {timeAgo(story.created_at)}
              </div>
            </div>
            {isOwner && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-full bg-white/10 backdrop-blur-md text-white"
                aria-label="Delete story"
              >
                <Icon name="Trash2" size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 backdrop-blur-md text-white"
              aria-label="Close"
            >
              <Icon name="X" size={18} />
            </button>
          </div>

          {/* media */}
          <img
            src={story.media_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />

          {/* tap zones */}
          <button
            className="absolute left-0 top-0 bottom-0 w-1/3 z-20"
            onClick={prev}
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
            aria-label="Previous"
          />
          <button
            className="absolute right-0 top-0 bottom-0 w-1/3 z-20"
            onClick={next}
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
            aria-label="Next"
          />
          <div
            className="absolute left-1/3 right-1/3 top-1/4 bottom-1/4 z-20"
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
          />

          {/* caption + link */}
          {(story.caption || story.link_url) && (
            <div className="absolute bottom-20 left-4 right-4 z-30 space-y-2">
              {story.caption && (
                <div className="text-white text-[14px] font-medium bg-black/40 backdrop-blur-md rounded-xl px-3 py-2">
                  {story.caption}
                </div>
              )}
              {story.link_url && (
                <a
                  href={story.link_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 bg-white text-black text-[12px] font-bold px-3 py-2 rounded-full"
                >
                  <Icon name="Link" size={14} /> Open link
                </a>
              )}
            </div>
          )}

          {/* footer: owner sees view count */}
          {isOwner && (
            <button
              onClick={openViewers}
              className="absolute bottom-4 left-4 z-30 flex items-center gap-2 text-white bg-black/40 backdrop-blur-md px-3 py-2 rounded-full"
            >
              <Icon name="Eye" size={14} />
              <span className="text-[12px] font-bold">
                {viewCount ?? 0} {viewCount === 1 ? "view" : "views"}
              </span>
            </button>
          )}
        </div>

        {/* viewers sheet */}
        <AnimatePresence>
          {showViewers && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              className="absolute bottom-0 left-0 right-0 max-h-[60%] bg-[#FAF9F6] rounded-t-[28px] z-40 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E3DB]">
                <h3 className="text-sm font-bold uppercase tracking-widest">
                  Viewers · {viewers.length}
                </h3>
                <button
                  onClick={() => {
                    setShowViewers(false);
                    setPaused(false);
                  }}
                  className="p-2 rounded-xl hover:bg-[#E5E3DB]"
                >
                  <Icon name="X" size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {viewers.length === 0 && (
                  <p className="text-center text-[12px] text-[#7A7A7A] py-10">
                    No views yet.
                  </p>
                )}
                {viewers.map((v: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white"
                  >
                    <Avatar
                      src={v.users?.avatar_url}
                      seed={v.viewer_id}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate">
                        {v.users?.display_name || v.users?.username || "user"}
                      </div>
                      <div className="text-[10px] text-[#7A7A7A] uppercase tracking-widest">
                        {timeAgo(v.created_at)} ago
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}