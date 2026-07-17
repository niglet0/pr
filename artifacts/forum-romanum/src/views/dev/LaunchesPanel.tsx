import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Icon, cn } from "../../components/UI";
import { ImageUploader } from "../../components/marketplace/ImageUploader";
import { toast } from "sonner";
import * as Cache from "../../lib/cache";
import SandboxIDE from "../../components/sandbox/SandboxIDE";
import SandboxZipUploader from "../../components/marketplace/SandboxZipUploader";

// ─── constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Web App","Mobile App","CLI Tool","Library / SDK",
  "API","Browser Extension","AI Tool","Game",
  "Design Tool","Content","Service","Other",
];
const PLATFORMS = ["Web","iOS","Android","Desktop","Chrome Extension","Open Source"];
const PRICING = [
  { id:"free",        label:"Free",        color:"#10B981" },
  { id:"freemium",    label:"Freemium",    color:"#3B82F6" },
  { id:"paid",        label:"Paid",        color:"#F59E0B" },
  { id:"open_source", label:"Open Source", color:"#8B5CF6" },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function pricingMeta(id?: string) {
  return PRICING.find((p) => p.id === id) ?? PRICING[0];
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ images, startIndex, onClose }: {
  images: string[]; startIndex: number; onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % images.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [images.length, onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 backdrop-blur-md"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/25 transition-colors"
      >
        <Icon name="X" size={16} color="white" />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/70 text-[12px] font-bold">
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <motion.img
        key={idx}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        src={images[idx]}
        alt={`Screenshot ${idx + 1}`}
        className="max-w-[92vw] max-h-[82vh] object-contain rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Prev / Next — inside the overlay, not outside */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + images.length) % images.length); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <Icon name="ChevronLeft" size={22} color="white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <Icon name="ChevronRight" size={22} color="white" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx ? "bg-white w-5" : "bg-white/40 w-1.5"
                )}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>,
    document.body
  );
}

// ─── CommentsSection ──────────────────────────────────────────────────────────

function CommentsSection({
  launchId, currentUserId, launcherName, onCountChange,
}: {
  launchId: string; currentUserId?: string; launcherName?: string;
  onCountChange?: (n: number) => void;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("launch_comments")
      .select("*, users:user_id(id, display_name, username, avatar_url)")
      .eq("launch_id", launchId)
      .order("created_at", { ascending: true })
      .limit(50);
    const list = data || [];
    setComments(list);
    onCountChange?.(list.length);
    setLoading(false);
  };

  useEffect(() => { load(); }, [launchId]);

  const submit = async () => {
    if (!text.trim() || !currentUserId) return;
    setSubmitting(true);
    const body = text.trim();
    setText("");
    const { data: inserted } = await supabase
      .from("launch_comments")
      .insert({ launch_id: launchId, user_id: currentUserId, body })
      .select("*, users:user_id(id, display_name, username, avatar_url)")
      .single();
    if (inserted) {
      setComments((c) => [...c, inserted]);
      onCountChange?.(comments.length + 1);
    }
    setSubmitting(false);
  };

  const deleteComment = async (id: string) => {
    await supabase.from("launch_comments").delete().eq("id", id);
    const next = comments.filter((c) => c.id !== id);
    setComments(next);
    onCountChange?.(next.length);
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    await supabase.from("launch_comments").update({ body: editText.trim() }).eq("id", id);
    setComments((c) => c.map((x) => x.id === id ? { ...x, body: editText.trim() } : x));
    setEditId(null);
  };

  if (loading) return (
    <div className="flex justify-center py-4">
      <Icon name="Loader2" size={16} className="animate-spin text-[#C5A059]" />
    </div>
  );

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-center text-[11px] text-[#B0ADA5] py-2">
          Be first to comment
        </p>
      )}

      {comments.map((c) => {
        const isOwn = c.user_id === currentUserId;
        return (
          <div key={c.id} className="flex gap-2 group">
            <div className="shrink-0 mt-0.5">
              <Avatar src={c.users?.avatar_url} seed={c.user_id} size={24} className="rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-[#F3F1EC] rounded-xl rounded-tl-sm px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[10px] font-black text-[#202020]">
                    {c.users?.display_name || c.users?.username || "Anonymous"}
                  </p>
                  {isOwn && editId !== c.id && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditId(c.id); setEditText(c.body); }}
                        className="text-[9px] font-bold text-[#7A7A7A] hover:text-[#C5A059] transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="Pencil" size={9} />Edit
                      </button>
                      <button
                        onClick={() => deleteComment(c.id)}
                        className="text-[9px] font-bold text-[#7A7A7A] hover:text-red-500 transition-colors flex items-center gap-0.5"
                      >
                        <Icon name="Trash2" size={9} />Del
                      </button>
                    </div>
                  )}
                </div>
                {editId === c.id ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      className="w-full text-[12px] bg-white border border-[#E5E3DB] rounded-lg px-2 py-1.5 outline-none resize-none focus:border-[#C5A059]"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => saveEdit(c.id)}
                        className="text-[10px] font-black text-[#C5A059] hover:underline">Save</button>
                      <button onClick={() => setEditId(null)}
                        className="text-[10px] font-bold text-[#B0ADA5] hover:text-[#7A7A7A]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-[#444] leading-relaxed">{c.body}</p>
                )}
              </div>
              <p className="text-[9px] text-[#B0ADA5] mt-0.5 ml-1">{timeAgo(c.created_at)}</p>
            </div>
          </div>
        );
      })}

      {currentUserId && (
        <div className="flex gap-2 items-end pt-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={`Reply to ${launcherName || "the founder"}…`}
            rows={1}
            className="flex-1 text-[12px] bg-[#F3F1EC] rounded-xl px-3 py-2 outline-none font-medium focus:ring-1 focus:ring-[#C5A059]/40 resize-none"
          />
          <button
            onClick={submit}
            disabled={!text.trim() || submitting}
            className="w-9 h-9 rounded-xl bg-[#C5A059] flex items-center justify-center hover:bg-[#B8943F] transition-colors disabled:opacity-40 shrink-0"
          >
            {submitting
              ? <Icon name="Loader2" size={13} color="white" className="animate-spin" />
              : <Icon name="Send" size={13} color="white" />
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ─── LaunchCard ───────────────────────────────────────────────────────────────

function LaunchCard({
  launch, currentUserId, rank, onOpenProfile, forceExpanded,
}: {
  launch: any; currentUserId?: string; rank?: number;
  onOpenProfile?: (userId: string) => void;
  forceExpanded?: boolean;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const voteKey = `vote:${launch.id}:${currentUserId ?? ""}`;
  const bkKey   = `bk:${launch.id}:${currentUserId ?? ""}`;
  const [voted,     setVoted]     = useState(() => Cache.ixGet(voteKey) ?? !!launch.user_voted);
  const [count,     setCount]     = useState(launch.upvotes_count ?? 0);
  const [bookmarked,setBookmarked]= useState(() => Cache.ixGet(bkKey)  ?? !!launch.user_bookmarked);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!forceExpanded) return;
    setExpanded(true);
    const scroll = () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    scroll();
    const t1 = setTimeout(scroll, 250);
    const t2 = setTimeout(scroll, 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [forceExpanded]);
  const [showComments, setShowComments] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [commentCount, setCommentCount] = useState(launch.comments_count ?? 0);

  const pricing = pricingMeta(launch.pricing_model);
  const isWinner = !!launch.is_pinned;
  const name = launch.headline || launch.product_title || "Untitled";
  const tagline = launch.tagline ?? "";
  const launcher = launch.launcher_name || launch.launcher_username || "Anonymous";

  // Build ordered gallery: cover first, then distinct screenshots
  const allImages: string[] = [];
  if (launch.cover_url) allImages.push(launch.cover_url);
  for (const s of (launch.screenshots ?? [])) {
    if (s && !allImages.includes(s)) allImages.push(s);
  }
  const coverThumb = allImages[0] ?? null;

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { toast.error("Sign in to upvote"); return; }
    const next = !voted;
    setVoted(next);
    Cache.ixSet(voteKey, next);
    Cache.invalidate("launches:");
    const nextCount = count + (next ? 1 : -1);
    setCount(nextCount);
    if (next) {
      await supabase.from("launch_upvotes").insert({ launch_id: launch.id, user_id: currentUserId });
    } else {
      await supabase.from("launch_upvotes").delete().eq("launch_id", launch.id).eq("user_id", currentUserId);
    }
    await supabase.from("product_launches").update({ upvotes_count: nextCount }).eq("id", launch.id);
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { toast.error("Sign in to save"); return; }
    const next = !bookmarked;
    setBookmarked(next);
    Cache.ixSet(bkKey, next);
    if (next) {
      await supabase.from("launch_bookmarks").insert({ launch_id: launch.id, user_id: currentUserId });
      toast.success("Saved to library");
    } else {
      await supabase.from("launch_bookmarks").delete().eq("launch_id", launch.id).eq("user_id", currentUserId);
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = launch.website_url
      ? (launch.website_url.startsWith("http") ? launch.website_url : `https://${launch.website_url}`)
      : window.location.href;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!")).catch(() => {});
  };

  return (
    <>
      <AnimatePresence>
        {lightboxIdx !== null && allImages.length > 0 && (
          <Lightbox images={allImages} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}
      </AnimatePresence>

      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "bg-white border rounded-2xl overflow-hidden",
          isWinner
            ? "border-[#C5A059] ring-1 ring-[#C5A059]/30 shadow-lg shadow-[#C5A059]/10"
            : "border-[#E5E3DB] hover:shadow-md transition-shadow"
        )}
      >
        {/* Winner banner */}
        {isWinner && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#C5A059]/15 to-transparent border-b border-[#C5A059]/20">
            <Icon name="Trophy" size={13} color="#C5A059" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059]">
              🏆 Today's Winner · Hall of Fame
            </span>
          </div>
        )}

        {/* Main row */}
        <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded((x) => !x)}>
          <div className="flex items-start gap-3">
            {rank != null && (
              <span className="text-[13px] font-black text-[#C5A059]/50 w-5 text-right shrink-0 pt-2">{rank}</span>
            )}

            {/* Cover — opens lightbox */}
            <button
              onClick={(e) => { e.stopPropagation(); if (allImages.length) setLightboxIdx(0); }}
              className="w-14 h-14 rounded-xl overflow-hidden bg-[#F3F1EC] border border-[#E5E3DB] shrink-0 flex items-center justify-center relative group"
            >
              {coverThumb
                ? <img src={coverThumb} alt={name} className="w-full h-full object-cover" />
                : <Icon name="Rocket" size={22} color="#C5A059" />
              }
              {allImages.length > 0 && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                  <Icon name="Maximize2" size={12} color="white" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </button>

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-[14px] text-[#202020] leading-tight truncate">{name}</h3>
                  {tagline && <p className="text-[12px] text-[#7A7A7A] mt-0.5 line-clamp-2 leading-relaxed">{tagline}</p>}
                </div>

                {/* Upvote */}
                <button
                  onClick={handleVote}
                  className={cn(
                    "shrink-0 flex flex-col items-center justify-center w-12 py-2 px-2 rounded-xl border-2 transition-all",
                    voted
                      ? "border-[#C5A059] bg-[#C5A059]/10 text-[#C5A059]"
                      : "border-[#E5E3DB] text-[#7A7A7A] hover:border-[#C5A059]/60 hover:text-[#C5A059]"
                  )}
                >
                  <Icon name="ChevronUp" size={18} />
                  <span className="text-[13px] font-black leading-none">{count}</span>
                </button>
              </div>

              {/* Badge row */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span
                  className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ color: pricing.color, background: `${pricing.color}18` }}
                >{pricing.label}</span>
                {launch.category && (
                  <span className="text-[9px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-2 py-0.5 rounded-full">{launch.category}</span>
                )}
                {(launch.platform ?? []).slice(0, 2).map((p: string) => (
                  <span key={p} className="text-[9px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-2 py-0.5 rounded-full">{p}</span>
                ))}
                {allImages.length > 1 && (
                  <span className="text-[9px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Icon name="Image" size={8} />{allImages.length}
                  </span>
                )}
                {(launch.sandbox_zip_url || launch.sandbox_config) && (
                  <LaunchForgeButton launch={launch} compact />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-[#F3F1EC]">

                {/* Screenshot gallery */}
                {allImages.length > 0 && (
                  <div className="px-4 pt-3 pb-0">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      {allImages.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setLightboxIdx(i)}
                          className="shrink-0 w-32 h-20 rounded-xl overflow-hidden border border-[#E5E3DB] hover:border-[#C5A059]/60 transition-colors relative group"
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                            <Icon name="Maximize2" size={14} color="white" className="opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                          </div>
                          {i === 0 && (
                            <span className="absolute bottom-1 left-1 text-[7px] font-black uppercase tracking-widest bg-black/55 text-white px-1.5 py-0.5 rounded-full">Cover</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 py-3 space-y-3">
                  {/* Description */}
                  {launch.description && (
                    <p className="text-[13px] text-[#444] leading-relaxed">{launch.description}</p>
                  )}

                  {/* Tech stack */}
                  {(launch.tech_stack?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {launch.tech_stack.map((t: string) => (
                        <span key={t} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F3F1EC] text-[#555] border border-[#E5E3DB]">{t}</span>
                      ))}
                    </div>
                  )}

                  {/* CTA buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {launch.website_url && (
                      <a
                        href={launch.website_url.startsWith("http") ? launch.website_url : `https://${launch.website_url}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C5A059] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#B8943F] transition-colors"
                      >
                        <Icon name="ExternalLink" size={12} /> Visit
                      </a>
                    )}
                    {launch.github_url && (
                      <a href={launch.github_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#202020] text-white text-[11px] font-bold hover:bg-[#333] transition-colors">
                        <Icon name="Github" size={13} /> Source
                      </a>
                    )}
                    {launch.app_store_url && (
                      <a href={launch.app_store_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F3F1EC] text-[#202020] text-[11px] font-bold hover:bg-[#E5E3DB] transition-colors">
                        <Icon name="Smartphone" size={13} /> App Store
                      </a>
                    )}
                    {(launch.sandbox_zip_url || launch.sandbox_config) && (
                      <LaunchForgeButton launch={launch} />
                    )}
                  </div>

                  {/* Launcher row — clickable */}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (launch.launcher_id && onOpenProfile) {
                          onOpenProfile(launch.launcher_id);
                        }
                      }}
                      className="flex items-center gap-2 group min-w-0"
                    >
                      <Avatar src={launch.launcher_avatar} seed={launch.launcher_id} size={26} className="rounded-full shrink-0" />
                      <div className="min-w-0 text-left">
                        <p className="text-[12px] font-black text-[#202020] group-hover:text-[#C5A059] transition-colors truncate leading-tight">{launcher}</p>
                        {launch.launcher_username && (
                          <p className="text-[10px] text-[#B0ADA5] leading-tight">@{launch.launcher_username}</p>
                        )}
                      </div>
                    </button>
                    <span className="text-[10px] text-[#B0ADA5] ml-auto shrink-0">{timeAgo(launch.created_at)}</span>
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-0.5 pt-1 border-t border-[#F3F1EC] -mx-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowComments((x) => !x); }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-colors",
                        showComments ? "bg-[#C5A059]/10 text-[#C5A059]" : "text-[#7A7A7A] hover:bg-[#F3F1EC] hover:text-[#202020]"
                      )}
                    >
                      <Icon name="MessageCircle" size={14} />
                      {commentCount > 0 ? commentCount : ""}
                      {" "}Comment{commentCount !== 1 ? "s" : ""}
                    </button>

                    <button
                      onClick={handleBookmark}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-colors",
                        bookmarked ? "bg-[#C5A059]/10 text-[#C5A059]" : "text-[#7A7A7A] hover:bg-[#F3F1EC] hover:text-[#202020]"
                      )}
                    >
                      <Icon name={bookmarked ? "BookmarkCheck" : "Bookmark"} size={14} />
                      {bookmarked ? "Saved" : "Save"}
                    </button>

                    <button
                      onClick={handleShare}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold text-[#7A7A7A] hover:bg-[#F3F1EC] hover:text-[#202020] transition-colors ml-auto"
                    >
                      <Icon name="Share2" size={14} />
                      Share
                    </button>
                  </div>

                  {/* Inline comments */}
                  <AnimatePresence>
                    {showComments && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden pt-1"
                      >
                        <CommentsSection
                          launchId={launch.id}
                          currentUserId={currentUserId}
                          launcherName={launcher}
                          onCountChange={setCommentCount}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// ─── LaunchCompose ────────────────────────────────────────────────────────────

function LaunchCompose({ currentUserId, onDone }: { currentUserId?: string; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [sandboxZipUrl, setSandboxZipUrl] = useState("");
  const [category, setCategory] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["Web"]);
  const [pricing, setPricing] = useState("free");
  const [priceDisplay, setPriceDisplay] = useState("");
  const [techStack, setTechStack] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>(["", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);

  const togglePlatform = (p: string) =>
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const setScreenshot = (i: number, url: string) =>
    setScreenshots((prev) => { const n = [...prev]; n[i] = url; return n; });

  const validScreenshots = screenshots.filter(Boolean);

  const submit = async () => {
    if (!currentUserId || !name.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("product_launches").insert({
        launcher_id: currentUserId,
        headline: name.trim(),
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        cover_url: coverUrl || validScreenshots[0] || null,
        website_url: websiteUrl.trim() || null,
        github_url: githubUrl.trim() || null,
        app_store_url: appStoreUrl.trim() || null,
        sandbox_zip_url: sandboxZipUrl.trim() || null,
        category: category || null,
        platform: selectedPlatforms.length ? selectedPlatforms : null,
        pricing_model: pricing,
        price_display: pricing !== "free" && priceDisplay.trim() ? priceDisplay.trim() : null,
        tech_stack: techStack.split(",").map((t) => t.trim()).filter(Boolean),
        screenshots: validScreenshots.length ? validScreenshots : null,
        launch_date: new Date().toISOString().split("T")[0],
        upvotes_count: 0,
        is_pinned: false,
        comments_count: 0,
      });
      if (error) throw error;
      toast.success("🚀 Launched! Top product in 24h gets pinned.");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Launch failed — check migration was run");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full text-[13px] bg-[#FAF9F6] border border-[#E5E3DB] rounded-xl px-3 py-2.5 outline-none font-medium focus:border-[#C5A059] transition-colors placeholder:text-[#B0ADA5]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#C5A059]/30 rounded-2xl overflow-hidden shadow-lg shadow-[#C5A059]/5"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#F3F1EC]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-[#C5A059] flex items-center justify-center shrink-0">
            <Icon name="Rocket" size={16} color="white" />
          </div>
          <div>
            <h3 className="font-black text-[14px] text-[#202020]">Launch a Product</h3>
            <p className="text-[10px] text-[#7A7A7A] font-medium">Top voted in 24h gets pinned on the home feed</p>
          </div>
        </div>
        {/* Step progress */}
        <div className="flex gap-1">
          {[1,2,3].map((s) => (
            <div key={s} className={cn("flex-1 h-1 rounded-full transition-all", s <= step ? "bg-[#C5A059]" : "bg-[#E5E3DB]")} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          {["Basics","Details","Links & Media"].map((l, i) => (
            <span key={l} className={cn("text-[9px] font-bold uppercase tracking-widest", i + 1 <= step ? "text-[#C5A059]" : "text-[#B0ADA5]")}>{l}</span>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Step 1: Basics ── */}
        {step === 1 && (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name *" className={inputClass} />
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One-liner tagline" className={inputClass} />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does it do? Who is it for? What problem does it solve?"
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Cover Image</p>
              {currentUserId ? (
                <ImageUploader
                  bucket="forum-media"
                  pathPrefix={`launches/${currentUserId}/cover`}
                  existingUrl={coverUrl || null}
                  onUploaded={setCoverUrl}
                  onClear={() => setCoverUrl("")}
                  aspect="wide"
                  label="Upload cover image"
                  maxMB={8}
                />
              ) : (
                <p className="text-[11px] text-[#B0ADA5]">Sign in to upload images</p>
              )}
            </div>
          </>
        )}

        {/* ── Step 2: Details ── */}
        {step === 2 && (
          <>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Category</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c} onClick={() => setCategory(c === category ? "" : c)}
                    className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                      category === c ? "bg-[#C5A059] text-white border-transparent" : "border-[#E5E3DB] text-[#7A7A7A] hover:border-[#C5A059]/50")}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Platform</p>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => (
                  <button key={p} onClick={() => togglePlatform(p)}
                    className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                      selectedPlatforms.includes(p) ? "bg-[#202020] text-white border-transparent" : "border-[#E5E3DB] text-[#7A7A7A] hover:border-[#202020]/30")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">Pricing</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PRICING.map((pr) => (
                  <button key={pr.id} onClick={() => setPricing(pr.id)}
                    className={cn("py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border-2 transition-all",
                      pricing === pr.id ? "text-white border-transparent" : "border-[#E5E3DB] text-[#7A7A7A]")}
                    style={pricing === pr.id ? { background: pr.color, borderColor: pr.color } : {}}>
                    {pr.label}
                  </button>
                ))}
              </div>
              {pricing === "paid" && (
                <input value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value)}
                  placeholder='Price display (e.g. "$9/mo")' className={`${inputClass} mt-2`} />
              )}
            </div>
            <input value={techStack} onChange={(e) => setTechStack(e.target.value)}
              placeholder="Tech stack (comma-separated: React, Node, Postgres…)" className={inputClass} />
          </>
        )}

        {/* ── Step 3: Links + Screenshots ── */}
        {step === 3 && (
          <>
            <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="Website URL" className={inputClass} />
            <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="GitHub repo URL (optional)" className={inputClass} />
            <input value={appStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} placeholder="App Store / Play Store URL (optional)" className={inputClass} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">⚡ Forge Sandbox (optional)</p>
              <SandboxZipUploader
                value={sandboxZipUrl}
                onChange={setSandboxZipUrl}
                userId={currentUserId ?? undefined}
                pathPrefix="launches"
                hint="Users can run your project live in the browser from the launches feed"
              />
            </div>

            {/* Screenshots — up to 5 via ImageUploader */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] mb-2">
                Screenshots ({validScreenshots.length}/5)
              </p>
              {currentUserId ? (
                <div className="grid grid-cols-3 gap-2">
                  {[0,1,2,3,4].map((i) => (
                    <ImageUploader
                      key={i}
                      bucket="forum-media"
                      pathPrefix={`launches/${currentUserId}/ss${i}`}
                      existingUrl={screenshots[i] || null}
                      onUploaded={(url) => setScreenshot(i, url)}
                      onClear={() => setScreenshot(i, "")}
                      aspect="wide"
                      label={`Shot ${i + 1}`}
                      maxMB={8}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#B0ADA5]">Sign in to upload screenshots</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex gap-2 items-center">
        {step > 1 && (
          <button onClick={() => setStep((s) => s - 1)}
            className="w-9 h-9 rounded-xl border border-[#E5E3DB] flex items-center justify-center hover:bg-[#F3F1EC] transition-colors">
            <Icon name="ChevronLeft" size={15} />
          </button>
        )}
        <button onClick={onDone} className="text-[11px] font-bold text-[#7A7A7A] hover:text-[#202020] transition-colors px-1">
          Cancel
        </button>
        <div className="flex-1" />
        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 1 && !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C5A059] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#B8943F] transition-colors disabled:opacity-40"
          >
            Next <Icon name="ChevronRight" size={13} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C5A059] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#B8943F] transition-colors disabled:opacity-50"
          >
            {submitting
              ? <><Icon name="Loader2" size={13} className="animate-spin" /> Launching…</>
              : <><Icon name="Rocket" size={13} /> Launch 🚀</>
            }
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── LaunchesPanel ────────────────────────────────────────────────────────────

export function LaunchesPanel({
  currentUserId,
  onOpenListing,
  onOpenProfile,
  forceCompose,
  onComposeClose,
  forceLaunchId,
  onForceLaunchConsumed,
}: {
  currentUserId?: string;
  onOpenListing?: (id: string) => void;
  onOpenProfile?: (userId: string) => void;
  forceCompose?: boolean;
  onComposeClose?: () => void;
  forceLaunchId?: string | null;
  onForceLaunchConsumed?: () => void;
}) {
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [tab, setTab] = useState<"today" | "week" | "all" | "winners">("today");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLaunches = async (force = false) => {
    const cacheKey = `launches:${tab}:${categoryFilter}:${currentUserId ?? ""}`;
    if (!force) {
      const cached = Cache.get<any[]>(cacheKey, 30_000);
      if (cached) { setLaunches(cached); setLoading(false); return; }
    }
    setLoading(true);
    try {
      let q = supabase.from("v_launches").select("*").order("upvotes_count", { ascending: false });
      if (tab === "today") q = q.eq("launch_date", new Date().toISOString().split("T")[0]);
      else if (tab === "week") q = q.gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      else if (tab === "winners") q = q.eq("is_pinned", true);
      if (categoryFilter) q = q.eq("category", categoryFilter);
      const { data } = await q.limit(30);

      let result: any[] = data ?? [];
      if (data && currentUserId) {
        const ids = data.map((l: any) => l.id);
        const [votesRes, bookRes] = await Promise.all([
          ids.length ? supabase.from("launch_upvotes").select("launch_id").eq("user_id", currentUserId).in("launch_id", ids) : { data: [] },
          ids.length ? supabase.from("launch_bookmarks").select("launch_id").eq("user_id", currentUserId).in("launch_id", ids) : { data: [] },
        ]);
        const voted = new Set((votesRes.data ?? []).map((v: any) => v.launch_id));
        const saved = new Set((bookRes.data ?? []).map((v: any) => v.launch_id));
        result = data.map((l: any) => ({ ...l, user_voted: voted.has(l.id), user_bookmarked: saved.has(l.id) }));
      }
      Cache.set(cacheKey, result);
      setLaunches(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLaunches(); }, [tab, currentUserId, categoryFilter]);
  useEffect(() => { if (forceCompose) setComposeOpen(true); }, [forceCompose]);
  useEffect(() => {
    if (!forceLaunchId) return;
    setTab("all");
    setExpandedId(forceLaunchId);
    onForceLaunchConsumed?.();
  }, [forceLaunchId]);

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const winner = launches.find((l) => l.is_pinned);
  const rest   = launches.filter((l) => !l.is_pinned);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-[16px] text-[#202020] flex items-center gap-2">
            <Icon name="Rocket" size={16} color="#C5A059" />
            Launches
          </h2>
          <p className="text-[11px] text-[#7A7A7A] font-medium mt-0.5">{todayStr} · Top in 24h gets pinned</p>
        </div>
        <button
          onClick={() => setComposeOpen((x) => !x)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C5A059] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#B8943F] transition-colors shrink-0"
        >
          <Icon name="Rocket" size={12} /> Launch
        </button>
      </div>

      <AnimatePresence>
        {composeOpen && (
          <LaunchCompose
            currentUserId={currentUserId}
            onDone={() => { setComposeOpen(false); onComposeClose?.(); fetchLaunches(); }}
          />
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F3F1EC] p-1 rounded-xl">
        {(["today","week","all","winners"] as const).map((id) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              tab === id ? "bg-white text-[#202020] shadow-sm" : "text-[#7A7A7A] hover:text-[#202020]"
            )}
          >
            {id === "today" ? "Today" : id === "week" ? "Week" : id === "all" ? "All Time" : "🏆 Winners"}
          </button>
        ))}
      </div>

      {/* Category filter */}
      {tab !== "winners" && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {["", ...CATEGORIES].map((c) => (
            <button key={c || "all"}
              onClick={() => setCategoryFilter(c)}
              className={cn(
                "shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full transition-all",
                categoryFilter === c
                  ? (c ? "bg-[#C5A059] text-white" : "bg-[#202020] text-white")
                  : "bg-[#F3F1EC] text-[#7A7A7A] hover:bg-[#E5E3DB]"
              )}
            >{c || "All"}</button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <Icon name="Loader2" size={24} className="animate-spin text-[#C5A059]" />
        </div>
      )}

      {/* Empty */}
      {!loading && launches.length === 0 && (
        <div className="py-14 text-center space-y-3">
          <Icon name="Rocket" size={32} className="mx-auto text-[#C5A059]/30" />
          <p className="font-black text-[14px] text-[#202020]">No launches yet today</p>
          <p className="text-[12px] text-[#7A7A7A]">Be the first to ship something</p>
          <button onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C5A059] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#B8943F] transition-colors">
            <Icon name="Rocket" size={12} /> Launch Now
          </button>
        </div>
      )}

      {/* Winner pinned first */}
      {!loading && winner && (
        <LaunchCard
          key={winner.id}
          launch={winner}
          currentUserId={currentUserId}
          onOpenProfile={onOpenProfile}
          forceExpanded={expandedId === winner.id}
        />
      )}

      {/* Ranked list */}
      {!loading && rest.map((launch, i) => (
        <LaunchCard
          key={launch.id}
          launch={launch}
          currentUserId={currentUserId}
          rank={tab !== "winners" ? i + 1 : undefined}
          onOpenProfile={onOpenProfile}
          forceExpanded={expandedId === launch.id}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Forge Try Button (for launches with sandbox_zip_url)                       */
/* -------------------------------------------------------------------------- */

function LaunchForgeButton({ launch, compact }: { launch: any; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {compact ? (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors"
          style={{ color: "#C5A059", background: "rgba(197,160,89,0.12)", border: "1px solid rgba(197,160,89,0.25)" }}
        >
          ⚡ Try in Forge
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
          style={{ color: "#C5A059", background: "rgba(197,160,89,0.08)", border: "1px solid rgba(197,160,89,0.3)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(197,160,89,0.15)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(197,160,89,0.08)")}
        >
          ⚡ Try in Forge
        </button>
      )}
      <React.Suspense fallback={null}>
        <SandboxIDE
          open={open}
          onClose={() => setOpen(false)}
          namespace={`launch-${launch.id}`}
          initialZipUrl={launch.sandbox_zip_url}
          title={launch.headline ?? launch.product_title ?? launch.name ?? "Launch"}
        />
      </React.Suspense>
    </>
  );
}
