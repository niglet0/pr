import React, { useState, useEffect } from "react";
import { Card, Avatar, Icon, Skeleton, cn } from "../components/UI";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { useDeepFocus } from "../lib/focusStore";
import * as Cache from "../lib/cache";
import { SystemContractCard, type ContractEvent } from "../components/SystemContractCard";
import { StoryComposer } from "../components/StoryComposer";
import { StoryViewer } from "../components/StoryViewer";
import { LaunchesPanel } from "./dev/LaunchesPanel";
import SandboxIDE from "../components/sandbox/SandboxIDE";
import { CollabPanel } from "./dev/CollabPanel";


function timeAgo(date: string | number | Date) {
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  const w = Math.floor(days / 7);
  if (w < 5) return `${w}w`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HomeForgeButton({ listing }: { listing: any }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
        style={{
          color: "#C5A059",
          background: "rgba(197,160,89,0.08)",
          border: "1px solid rgba(197,160,89,0.28)",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(197,160,89,0.16)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(197,160,89,0.08)")}
      >
        ⚡ Try
      </button>
      <React.Suspense fallback={null}>
        <SandboxIDE
          open={open}
          onClose={() => setOpen(false)}
          namespace={`listing-${listing.id}`}
          initialZipUrl={listing.sandbox_zip_url}
          title={listing.title}
        />
      </React.Suspense>
    </>
  );
}

export function HomeView({
  onOpenContent,
  currentUser,
  forceAction,
  clearAction,
  onOpenCompany,
  onOpenListing,
  onGoToHub,
  onOpenEntity,
}: {
  onOpenContent: (item: any) => void;
  currentUser?: any;
  forceAction?: string | null;
  clearAction?: () => void;
  onOpenCompany?: (companyId: string) => void;
  onOpenListing?: (listingId: string) => void;
  onGoToHub?: (launchId?: string) => void;
  onOpenEntity?: (ref: { type: "user" | "company" | "channel"; id: string }) => void;
}) {
  const [posts, setPosts] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [contracts, setContracts] = useState<ContractEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");
  const [newPostImage, setNewPostImage] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [postCategory, setPostCategory] = useState<"decree" | "question" | "quote" | "insight" | "log">("decree");
  const [postAudience, setPostAudience] = useState<"public" | "legion" | "inner">("public");
  const [quoteAuthor, setQuoteAuthor] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const MAX_LEN = 500;
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const { active: deepFocus, toggle: toggleFocus } = useDeepFocus();
  const [showNewBubble, setShowNewBubble] = useState(false);

  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [reposted, setReposted] = useState<Set<string>>(new Set());
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Phase 2 — smart mixed feed
  const [feedTab, setFeedTab] = useState<"foryou" | "following" | "companies" | "bounties" | "launches" | "collab">("foryou");
  const [hotBounties, setHotBounties] = useState<any[]>([]);
  const [featuredListings, setFeaturedListings] = useState<any[]>([]);
  const [companyAnnouncements, setCompanyAnnouncements] = useState<any[]>([]);
  const [suggestedEntities, setSuggestedEntities] = useState<any[]>([]);
  const [followedCompanies, setFollowedCompanies] = useState<Set<string>>(new Set());
  const [feedLaunches, setFeedLaunches] = useState<any[]>([]);
  const [feedCollab, setFeedCollab] = useState<any[]>([]);
  const [topLaunch, setTopLaunch] = useState<any>(null);
  const [topLaunchIsWinner, setTopLaunchIsWinner] = useState(false);

  useEffect(() => {
    if (forceAction === "new_post") {
      setIsComposerOpen(true);
      if (clearAction) clearAction();
    }
  }, [forceAction]);

  useEffect(() => {
    const fetchPosts = async (force = false) => {
      const ck = `posts:${currentUser?.id ?? "guest"}`;
      if (!force) {
        const c = Cache.get<any[]>(ck, 30_000);
        if (c) { setPosts(c); setLoading(false); return; }
      }
      try {
        const { data } = await supabase
          .from("v_posts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30);
        if (data) { Cache.set(ck, data); setPosts(data); }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    const fetchStories = async (force = false) => {
      const ck = "stories";
      if (!force) {
        const c = Cache.get<any[]>(ck, 60_000);
        if (c) { setStories(c); return; }
      }
      try {
        const { data } = await supabase
          .from("v_stories")
          .select("*")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });
        if (data) { Cache.set(ck, data); setStories(data); }
      } catch {}
    };
    const fetchLikes = async () => {
      if (!currentUser) return;
      const ck = `likes:${currentUser.id}`;
      const c = Cache.get<string[]>(ck, 60_000);
      if (c) { setLikedPosts(new Set(c)); return; }
      try {
        const { data } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", currentUser.id);
        if (data) {
          const ids = data.map((l: any) => l.post_id);
          Cache.set(ck, ids);
          setLikedPosts(new Set(ids));
        }
      } catch {}
    };
    const fetchContracts = async (force = false) => {
      const ck = "contracts";
      if (!force) {
        const c = Cache.get<ContractEvent[]>(ck, 60_000);
        if (c) { setContracts(c); return; }
      }
      try {
        const { data } = await supabase
          .from("v_dev_bounties")
          .select(
            "id,title,amount,language,difficulty,closed_at,submission_url,repo_url,poster_id,poster_github,poster_avatar,claimant_id,claimant_github,claimant_avatar,status"
          )
          .eq("status", "approved")
          .order("closed_at", { ascending: false })
          .limit(20);
        if (data) { Cache.set(ck, data as ContractEvent[]); setContracts(data as ContractEvent[]); }
      } catch {}
    };
    const fetchHotBounties = async () => {
      const ck = "hotBounties";
      const c = Cache.get<any[]>(ck, 60_000);
      if (c) { setHotBounties(c); return; }
      try {
        const { data } = await supabase
          .from("dev_bounties")
          .select("id,title,amount,language,difficulty,deadline,repo_url,poster_id,status,created_at")
          .eq("status", "open")
          .order("amount", { ascending: false })
          .limit(6);
        if (data) { Cache.set(ck, data); setHotBounties(data); }
      } catch {}
    };
    const fetchFeaturedListings = async () => {
      const ck = "featuredListings";
      const c = Cache.get<any[]>(ck, 120_000);
      if (c) { setFeaturedListings(c); return; }
      try {
        const { data } = await supabase
          .from("marketplace_listings")
          .select("id,title,cover_url,price_cents,kind,status,views_count,seller_id,created_at")
          .eq("status", "active")
          .order("views_count", { ascending: false })
          .limit(8);
        if (data) { Cache.set(ck, data); setFeaturedListings(data); }
      } catch {}
    };
    const fetchCompanyAnnouncements = async () => {
      const ck = "companyAnnouncements";
      const c = Cache.get<any[]>(ck, 120_000);
      if (c) { setCompanyAnnouncements(c); return; }
      try {
        const { data } = await supabase
          .from("posts")
          .select("id,content,image_url,created_at,author_entity_id,author_entity_type,likes_count,comments_count")
          .eq("author_entity_type", "company")
          .order("created_at", { ascending: false })
          .limit(10);
        if (data && data.length > 0) {
          const ids = [...new Set(data.map((p: any) => p.author_entity_id).filter(Boolean))];
          const { data: cos } = await supabase
            .from("company_profiles")
            .select("id,name,slug,logo_url,is_verified,industry")
            .in("id", ids);
          const coMap = Object.fromEntries((cos || []).map((c: any) => [c.id, c]));
          const result = data.map((p: any) => ({ ...p, company: coMap[p.author_entity_id] }));
          Cache.set(ck, result);
          setCompanyAnnouncements(result);
        }
      } catch {}
    };
    const fetchSuggested = async () => {
      const ck = "suggestedEntities";
      const c = Cache.get<any[]>(ck, 300_000);
      if (c) { setSuggestedEntities(c); return; }
      try {
        const { data } = await supabase
          .from("company_profiles")
          .select("id,name,slug,logo_url,is_verified,industry,followers_count,tagline")
          .order("followers_count", { ascending: false })
          .limit(5);
        if (data) { Cache.set(ck, data); setSuggestedEntities(data); }
      } catch {}
    };
    const fetchFeedLaunches = async (force = false) => {
      const ck = "feedLaunches";
      if (!force) {
        const c = Cache.get<any[]>(ck, 30_000);
        if (c) { setFeedLaunches(c); return; }
      }
      try {
        const { data } = await supabase
          .from("v_launches")
          .select("*")
          .order("upvotes_count", { ascending: false })
          .limit(4);
        if (data) { Cache.set(ck, data); setFeedLaunches(data); }
      } catch {}
    };
    const fetchFeedCollab = async (force = false) => {
      const ck = "feedCollab";
      if (!force) {
        const c = Cache.get<any[]>(ck, 30_000);
        if (c) { setFeedCollab(c); return; }
      }
      try {
        const { data } = await supabase
          .from("v_collab_requests")
          .select("*")
          .eq("status", "open")
          .order("upvotes_count", { ascending: false })
          .limit(3);
        if (data) { Cache.set(ck, data); setFeedCollab(data); }
      } catch {}
    };

    const fetchTopLaunch = async (force = false) => {
      const ck = "topLaunch";
      if (!force) {
        const cv = Cache.get<{ launch: any; isWinner: boolean }>(ck, 15_000);
        if (cv) { setTopLaunch(cv.launch); setTopLaunchIsWinner(cv.isWinner); return; }
      }
      try {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

        // 1. Explicit pinned winner (any date)
        const { data: pinned } = await supabase
          .from("v_launches")
          .select("*")
          .eq("is_pinned", true)
          .order("upvotes_count", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pinned) {
          Cache.set(ck, { launch: pinned, isWinner: true });
          setTopLaunch(pinned); setTopLaunchIsWinner(true); return;
        }

        // 2. Yesterday's top-voted (computed winner)
        const { data: yTop } = await supabase
          .from("v_launches")
          .select("*")
          .eq("launch_date", yesterday)
          .order("upvotes_count", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (yTop && yTop.upvotes_count > 0) {
          Cache.set(ck, { launch: yTop, isWinner: true });
          setTopLaunch(yTop); setTopLaunchIsWinner(true);
          supabase.from("product_launches").update({ is_pinned: true }).eq("id", yTop.id).then();
          return;
        }

        // 3. Today's live leader
        const { data: leader } = await supabase
          .from("v_launches")
          .select("*")
          .eq("launch_date", today)
          .order("upvotes_count", { ascending: false })
          .limit(1)
          .maybeSingle();
        Cache.set(ck, { launch: leader || null, isWinner: false });
        setTopLaunch(leader || null);
        setTopLaunchIsWinner(false);
      } catch {}
    };

    fetchPosts();
    fetchStories();
    fetchLikes();
    fetchContracts();
    fetchHotBounties();
    fetchFeaturedListings();
    fetchCompanyAnnouncements();
    fetchSuggested();
    fetchFeedLaunches();
    fetchFeedCollab();
    fetchTopLaunch();

    const channel = supabase
      .channel("feed_updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => { Cache.invalidate(`posts:${currentUser?.id ?? "guest"}`); fetchPosts(true); })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => { Cache.invalidate(`posts:`); fetchPosts(true); })
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => { Cache.invalidate("stories"); fetchStories(true); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dev_bounties" }, () => { Cache.invalidate("contracts"); fetchContracts(true); })
      .on("postgres_changes", { event: "*", schema: "public", table: "launch_upvotes" }, () => { Cache.invalidate("topLaunch"); Cache.invalidate("feedLaunches"); fetchTopLaunch(true); fetchFeedLaunches(true); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "product_launches" }, () => { Cache.invalidate("topLaunch"); Cache.invalidate("feedLaunches"); fetchTopLaunch(true); fetchFeedLaunches(true); })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };

  }, [currentUser]);

  const composedContent = () => {
    const body = newPost.trim();
    if (!body) return "";
    const tag =
      postCategory === "decree" ? "" :
      postCategory === "question" ? "❓ Question · " :
      postCategory === "quote" ? "❝ " :
      postCategory === "insight" ? "✦ Insight · " :
      "⚒ Build Log · ";
    const suffix =
      postCategory === "quote" && quoteAuthor.trim()
        ? `❞\n— ${quoteAuthor.trim()}`
        : "";
    return `${tag}${body}${suffix}`;
  };

  const createPost = async () => {
    if ((!newPost.trim() && !newPostImage.trim()) || !currentUser) return;
    const content = composedContent();
    const imgUrl = newPostImage;
    setNewPost("");
    setNewPostImage("");
    setQuoteAuthor("");
    setPostCategory("decree");
    setPostAudience("public");
    setIsComposerOpen(false);
    try { localStorage.removeItem("fr-draft"); } catch {}
    const tempPost = {
      id: Math.random().toString(),
      author_id: currentUser.id,
      content,
      image_url: imgUrl || null,
      created_at: new Date().toISOString(),
      display_name: currentUser.email,
      username: currentUser.email?.split("@")[0],
      likes_count: 0,
      comments_count: 0,
    };
    setPosts((prev) => [tempPost, ...prev]);
    const { error } = await supabase.from("posts").insert({
      author_id: currentUser.id,
      content,
      image_url: imgUrl || null,
    });
    if (error) {
      setPosts((prev) => prev.filter((p) => p.id !== tempPost.id));
      setToast("Could not publish. Draft kept.");
      setNewPost(content);
    } else {
      setToast("Decree published");
      try {
        await supabase.from("activity_log").insert({ user_id: currentUser.id, kind: "post" });
      } catch {}
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!file || !currentUser) return;
    if (file.size > 5 * 1024 * 1024) { setToast("Image must be under 5MB"); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("post-media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("post-media").getPublicUrl(path);
      setNewPostImage(publicUrl);
    } catch {
      setNewPostImage(URL.createObjectURL(file));
      setToast("Preview only — storage bucket not configured");
    } finally {
      setUploadingImage(false);
    }
  };

  // Draft autosave + restore
  useEffect(() => {
    if (!isComposerOpen) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem("fr-draft", JSON.stringify({
          newPost, newPostImage, postCategory, postAudience, quoteAuthor,
        }));
      } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [newPost, newPostImage, postCategory, postAudience, quoteAuthor, isComposerOpen]);

  useEffect(() => {
    if (!isComposerOpen) return;
    try {
      const raw = localStorage.getItem("fr-draft");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.newPost && !newPost) setNewPost(d.newPost);
      if (d.newPostImage && !newPostImage) setNewPostImage(d.newPostImage);
      if (d.postCategory) setPostCategory(d.postCategory);
      if (d.postAudience) setPostAudience(d.postAudience);
      if (d.quoteAuthor) setQuoteAuthor(d.quoteAuthor);
    } catch {}
  }, [isComposerOpen]);

  const handleLike = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    const isLiked = likedPosts.has(postId);
    const newLiked = new Set(likedPosts);
    if (isLiked) newLiked.delete(postId);
    else newLiked.add(postId);
    setLikedPosts(newLiked);
    setPosts(
      posts.map((p) =>
        p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + (isLiked ? -1 : 1) } : p
      )
    );
    const { data: existing } = await supabase
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", currentUser.id)
      .single();
    if (existing) {
      await supabase.from("post_likes").delete().eq("id", existing.id);
    } else {
      await supabase.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
    }
  };

  // Load bookmarks from Supabase (with localStorage fallback)
  useEffect(() => {
    const load = async () => {
      // Immediate localStorage restore
      try {
        const saved = JSON.parse(localStorage.getItem("fr-bookmarks") || "[]");
        if (Array.isArray(saved)) setBookmarked(new Set(saved));
      } catch {}
      // Then sync from DB
      if (!currentUser) return;
      try {
        const { data } = await supabase
          .from("post_bookmarks")
          .select("post_id")
          .eq("user_id", currentUser.id);
        if (data && data.length > 0) {
          const ids = data.map((r: any) => r.post_id);
          const next = new Set(ids);
          setBookmarked(next);
          try { localStorage.setItem("fr-bookmarks", JSON.stringify(ids)); } catch {}
        }
      } catch {}
      // Load reposts
      try {
        const { data } = await supabase
          .from("post_reposts")
          .select("post_id")
          .eq("user_id", currentUser.id);
        if (data) setReposted(new Set(data.map((r: any) => r.post_id)));
      } catch {}
    };
    load();
  }, [currentUser]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const ensureLiked = async (postId: string) => {
    if (!currentUser || likedPosts.has(postId)) return;
    const newLiked = new Set(likedPosts);
    newLiked.add(postId);
    setLikedPosts(newLiked);
    setPosts(posts.map((p) => (p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p)));
    await supabase.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });
  };

  const handleDoubleLike = (post: any) => {
    setBurstId(post.id);
    setTimeout(() => setBurstId((cur) => (cur === post.id ? null : cur)), 850);
    ensureLiked(post.id);
  };

  const toggleBookmark = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(bookmarked);
    if (next.has(postId)) {
      next.delete(postId);
      setToast("Removed from saved");
    } else {
      next.add(postId);
      setToast("Saved to your scrolls");
    }
    setBookmarked(next);
    try { localStorage.setItem("fr-bookmarks", JSON.stringify([...next])); } catch {}
    if (!currentUser) return;
    if (next.has(postId)) {
      await supabase.from("post_bookmarks").upsert(
        { user_id: currentUser.id, post_id: postId },
        { onConflict: "user_id,post_id" }
      );
    } else {
      await supabase.from("post_bookmarks").delete()
        .eq("user_id", currentUser.id).eq("post_id", postId);
    }
  };

  const handleRepost = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    const isReposted = reposted.has(postId);
    const next = new Set(reposted);
    if (isReposted) {
      next.delete(postId);
      setToast("Repost removed");
      await supabase.from("post_reposts").delete()
        .eq("user_id", currentUser.id).eq("post_id", postId);
    } else {
      next.add(postId);
      setToast("Reposted to your followers");
      await supabase.from("post_reposts").upsert(
        { user_id: currentUser.id, post_id: postId },
        { onConflict: "user_id,post_id" }
      );
      await supabase.from("activity_log").insert({ user_id: currentUser.id, kind: "repost" });
    }
    setReposted(next);
    setPosts(posts.map((p) =>
      p.id === postId ? { ...p, reposts_count: (p.reposts_count || 0) + (isReposted ? -1 : 1) } : p
    ));
  };

  const handleShare = async (post: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPostId(null);
    const url = `${window.location.origin}/?post=${post.id}`;
    const text = post.content?.slice(0, 80) || "A decree from the Forum Romanum";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Forum Romanum", text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied to clipboard");
      }
    } catch {}
  };

  const copyLink = async (post: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPostId(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`);
      setToast("Link copied to clipboard");
    } catch {}
  };


  const openPost = async (post: any) => {
    setSelectedPost(post);
    setComments([]);
    try {
      const { data } = await supabase
        .from("v_post_comments")
        .select("*")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });
      if (data) setComments(data);
    } catch {}
  };

  const submitComment = async () => {
    if (!newComment.trim() || !currentUser || !selectedPost) return;
    const content = newComment;
    setNewComment("");
    const tempComment = {
      id: Math.random().toString(),
      post_id: selectedPost.id,
      author_id: currentUser.id,
      content,
      created_at: new Date().toISOString(),
      display_name: currentUser.email,
      username: currentUser.email?.split("@")[0],
    };
    setComments((prev) => [...prev, tempComment]);
    try {
      const { error } = await supabase
        .from("post_comments")
        .insert({ post_id: selectedPost.id, author_id: currentUser.id, content });
      if (error) setComments((prev) => prev.filter((c) => c.id !== tempComment.id));
      else {
        const { data } = await supabase
          .from("v_post_comments")
          .select("*")
          .eq("post_id", selectedPost.id)
          .order("created_at", { ascending: true });
        if (data) setComments(data);
      }
    } catch {}
  };

  const handleCreateStory = () => setStoryComposerOpen(true);
  const refetchStories = async () => {
    const { data } = await supabase
      .from("v_stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (data) setStories(data);
  };

  return (
    <div className="flex-1 overflow-y-auto pb-32 bg-[#FAF9F6] -mx-2.5">

      {/* ── Launch of the Day ─────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-[#C5A059]/20 bg-[#FAF9F6]">
        {topLaunch ? (
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => onGoToHub?.(topLaunch.id)}
          >
            {/* Thumbnail */}
            {topLaunch.cover_url ? (
              <img
                src={topLaunch.cover_url}
                alt={topLaunch.headline || topLaunch.product_title}
                className="w-[52px] h-[52px] rounded-xl object-cover border border-[#E5E3DB] shrink-0 bg-[#F3F1EC]"
              />
            ) : (
              <div className="w-[52px] h-[52px] rounded-xl border border-[#E5E3DB] bg-[#F3F1EC] flex items-center justify-center shrink-0">
                <Icon name="Rocket" size={22} color="#C5A059" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon
                  name={topLaunchIsWinner ? "Trophy" : "TrendingUp"}
                  size={10}
                  color="#C5A059"
                />
                <p className="text-[10px] font-bold text-[#C5A059] uppercase tracking-widest leading-none">
                  {topLaunchIsWinner ? "Launch of the Day" : "Top Today"}
                </p>
              </div>
              <p className="text-[14px] font-black tracking-tight text-[#202020] truncate leading-tight">
                {topLaunch.headline || topLaunch.product_title}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-[#7A7A7A] font-bold flex items-center gap-0.5">
                  <Icon name="ChevronUp" size={11} color="#C5A059" />
                  {topLaunch.upvotes_count ?? 0}
                </span>
                {topLaunch.website_url && (
                  <a href={topLaunch.website_url} target="_blank" rel="noreferrer"
                    className="text-[#B0ADA5] hover:text-[#C5A059] transition-colors"
                    onClick={(e) => e.stopPropagation()}>
                    <Icon name="Globe" size={12} />
                  </a>
                )}
                {topLaunch.github_url && (
                  <a href={topLaunch.github_url} target="_blank" rel="noreferrer"
                    className="text-[#B0ADA5] hover:text-[#C5A059] transition-colors"
                    onClick={(e) => e.stopPropagation()}>
                    <Icon name="Github" size={12} />
                  </a>
                )}
                {topLaunch.app_store_url && (
                  <a href={topLaunch.app_store_url} target="_blank" rel="noreferrer"
                    className="text-[#B0ADA5] hover:text-[#C5A059] transition-colors"
                    onClick={(e) => e.stopPropagation()}>
                    <Icon name="Smartphone" size={12} />
                  </a>
                )}
              </div>
            </div>

            <div className="shrink-0 w-7 h-7 rounded-full bg-[#C5A059]/10 border border-[#C5A059]/20 flex items-center justify-center">
              <Icon name="ChevronRight" size={13} color="#C5A059" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 opacity-50">
            <div className="w-[52px] h-[52px] rounded-xl border border-dashed border-[#C5A059]/30 flex items-center justify-center shrink-0">
              <Icon name="Rocket" size={20} color="#C5A059" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon name="Trophy" size={10} color="#C5A059" />
                <p className="text-[10px] font-bold text-[#C5A059] uppercase tracking-widest">Launch of the Day</p>
              </div>
              <p className="text-[13px] font-medium text-[#7A7A7A]">No launches today — be first</p>
            </div>
          </div>
        )}
      </div>

      <div className="py-4 border-b border-[#C5A059]/10 bg-[#FAF9F6]">
        <div className="flex gap-4 px-5 overflow-x-auto no-scrollbar">
          <div
            onClick={handleCreateStory}
            className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full border border-dashed border-[#C5A059] flex items-center justify-center p-0.5">
              <div className="w-full h-full bg-[#FAF9F6] rounded-full flex items-center justify-center">
                <Icon name="Plus" className="text-[#C5A059]" size={24} />
              </div>
            </div>
            <span className="text-[10px] font-bold text-[#202020]">Your Story</span>
          </div>
          {stories.map((story) => (
            <div
              key={story.id}
              onClick={() => setActiveStoryId(story.id)}
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full border-[2.5px] border-[#C5A059] p-0.5">
                <Avatar
                  src={story.media_url || story.avatar_url}
                  seed={story.author_id}
                  size={54}
                  className="h-full w-full"
                />
              </div>
              <span className="text-[10px] font-medium text-[#7A7A7A] w-16 truncate text-center">
                {story.username}
              </span>
            </div>
          ))}
          {stories.length === 0 && (
            <div className="flex items-center pl-2 text-xs font-medium text-[#7A7A7A] italic">
              No stories from the legion yet…
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pt-3 space-y-3.5">

        {/* Feed tabs */}
        <div className="flex gap-1.5 mb-1 overflow-x-auto no-scrollbar pb-1">
          {(
            [
              { id: "foryou",    label: "For You",   icon: "Sparkles"  },
              { id: "following", label: "Following", icon: "Users"     },
              { id: "launches",  label: "Launches",  icon: "Rocket"    },
              { id: "collab",    label: "Collab",    icon: "Handshake" },
              { id: "companies", label: "Companies", icon: "Building2" },
              { id: "bounties",  label: "Bounties",  icon: "Zap"       },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFeedTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shrink-0",
                feedTab === tab.id
                  ? "bg-[#C5A059] text-white shadow-md shadow-[#C5A059]/30"
                  : "bg-white border border-[#E5E3DB] text-[#7A7A7A] hover:border-[#C5A059]/50 hover:text-[#C5A059]"
              )}
            >
              <Icon name={tab.icon} size={12} />
              {tab.label}
            </button>
          ))}
          <button
            onClick={toggleFocus}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shrink-0",
              deepFocus
                ? "bg-[#202020] text-white"
                : "bg-white border border-[#E5E3DB] text-[#7A7A7A] hover:border-[#202020]/30"
            )}
          >
            <Icon name="Target" size={12} />
            Focus
          </button>
        </div>

        {showNewBubble && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
            <Card className="p-4 bg-gradient-to-br from-[#8B5CF6]/10 to-transparent border-[#8B5CF6]/30 border-2">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-sm text-[#8B5CF6] flex items-center gap-2">
                  <Icon name="Bot" size={16} /> Oracle Digest
                </h3>
                <button
                  onClick={() => setShowNewBubble(false)}
                  className="text-[#8B5CF6]/60 hover:text-[#8B5CF6]"
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
              <p className="text-[12px] text-[#202020] leading-relaxed">
                <span className="font-bold">Summary:</span> The Legion is currently active discussing
                React Server Components and Rust memory safety. 3 new bounties were posted in the
                Coders Hub.
              </p>
            </Card>
          </motion.div>
        )}

        {feedTab === "launches" && (
          <motion.div key="launches" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <LaunchesPanel
              currentUserId={currentUser?.id}
              onOpenListing={onOpenListing}
              onOpenProfile={(userId) => onOpenEntity?.({ type: "user", id: userId })}
            />
          </motion.div>
        )}

        {feedTab === "collab" && (
          <motion.div key="collab" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <CollabPanel currentUserId={currentUser?.id} />
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {feedTab !== "launches" && feedTab !== "collab" && (loading ? (
            Array(3)
              .fill(0)
              .map((_, i) => (
                <Card
                  key={`skel-${i}`}
                  className="p-4 space-y-3 bg-white border-[#C5A059]/10 rounded-2xl"
                >
                  <div className="flex gap-3 items-center">
                    <Skeleton width={42} height={42} rounded={21} />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton width="40%" height={14} />
                      <Skeleton width="25%" height={10} />
                    </div>
                  </div>
                  <Skeleton width="90%" height={16} />
                  <Skeleton width="70%" height={16} />
                  <Skeleton width="100%" height={180} rounded={16} />
                </Card>
              ))
          ) : (
            (() => {
              type FeedItem =
                | { kind: "post";             ts: number; data: any }
                | { kind: "contract";         ts: number; data: ContractEvent }
                | { kind: "bounty";           ts: number; data: any }
                | { kind: "listing";          ts: number; data: any }
                | { kind: "company_post";     ts: number; data: any }
                | { kind: "suggest";          ts: number; data: any[] }
                | { kind: "launches_preview"; ts: number; data: any[] }
                | { kind: "collab_preview";   ts: number; data: any[] };

              // ── base user posts ──────────────────────────────────────
              const postItems: FeedItem[] = posts
                .filter((p) => {
                  if (deepFocus && p.author_id === currentUser?.id) return false;
                  if (feedTab === "bounties" || feedTab === "companies") return false;
                  return true;
                })
                .map((p) => ({ kind: "post", ts: new Date(p.created_at).getTime(), data: p }));

              // ── closed contracts (completed bounties) ─────────────────
              const contractItems: FeedItem[] = feedTab !== "companies"
                ? contracts.map((c) => ({
                    kind: "contract",
                    ts: new Date(c.closed_at || 0).getTime(),
                    data: c,
                  }))
                : [];

              // ── open bounties ─────────────────────────────────────────
              const bountyItems: FeedItem[] =
                feedTab === "foryou" || feedTab === "following" || feedTab === "bounties"
                  ? hotBounties.map((b) => ({
                      kind: "bounty",
                      ts: new Date(b.created_at).getTime(),
                      data: b,
                    }))
                  : [];

              // ── product listings ──────────────────────────────────────
              const listingItems: FeedItem[] =
                feedTab === "foryou"
                  ? featuredListings.slice(0, 3).map((l) => ({
                      kind: "listing",
                      ts: new Date(l.created_at).getTime(),
                      data: l,
                    }))
                  : [];

              // ── company announcements ─────────────────────────────────
              const companyPostItems: FeedItem[] =
                feedTab === "foryou" || feedTab === "companies"
                  ? companyAnnouncements.map((p) => ({
                      kind: "company_post",
                      ts: new Date(p.created_at).getTime(),
                      data: p,
                    }))
                  : [];

              // ── merge & sort ──────────────────────────────────────────
              const all: FeedItem[] = [
                ...postItems,
                ...contractItems,
                ...bountyItems,
                ...listingItems,
                ...companyPostItems,
              ].sort((a, b) => b.ts - a.ts);

              // inject suggested-follows card at index 4 (foryou only)
              const withSuggested: FeedItem[] = [...all];
              if (feedTab === "foryou" && suggestedEntities.length > 0 && all.length >= 4) {
                withSuggested.splice(4, 0, {
                  kind: "suggest",
                  ts: 0,
                  data: suggestedEntities,
                });
              }

              // inject launches preview at position 2 (foryou only)
              if (feedTab === "foryou" && feedLaunches.length > 0) {
                withSuggested.splice(2, 0, { kind: "launches_preview", ts: 0, data: feedLaunches });
              }
              // inject collab preview ~8 items in
              if (feedTab === "foryou" && feedCollab.length > 0) {
                const idx = Math.min(8, withSuggested.length);
                withSuggested.splice(idx, 0, { kind: "collab_preview", ts: 0, data: feedCollab });
              }

              if (withSuggested.length === 0) {
                return (
                  <div className="py-16 text-center text-[#7A7A7A]">
                    <Icon name="Inbox" size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nothing here yet</p>
                  </div>
                );
              }

              return withSuggested.map((item, idx) => {
                // ── Suggested companies card ──────────────────────────
                if (item.kind === "suggest") {
                  return (
                    <motion.div
                      key="suggest-card"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="p-4 bg-gradient-to-br from-[#8B5CF6]/5 to-transparent border-[#8B5CF6]/20 rounded-3xl">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6] mb-3 flex items-center gap-1.5">
                          <Icon name="Building2" size={12} />
                          Companies to Follow
                        </p>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                          {(item.data as any[]).map((co: any) => (
                            <div
                              key={co.id}
                              onClick={() => onOpenCompany?.(co.id)}
                              className="flex flex-col items-center gap-1.5 shrink-0 w-[88px] text-center cursor-pointer group"
                            >
                              <div className="w-14 h-14 rounded-2xl bg-[#8B5CF6]/10 mx-auto overflow-hidden flex items-center justify-center mb-1.5">
                                {co.logo_url
                                  ? <img src={co.logo_url} alt={co.name} className="w-full h-full object-cover" />
                                  : <span className="font-black text-[#8B5CF6] text-lg">{co.name[0]}</span>
                                }
                              </div>
                              <p className="text-[10px] font-bold text-[#202020] truncate">{co.name}</p>
                              <p className="text-[9px] text-[#7A7A7A] truncate">{co.industry || "Tech"}</p>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!currentUser) return;
                                  const already = followedCompanies.has(co.id);
                                  const next = new Set(followedCompanies);
                                  if (already) {
                                    next.delete(co.id);
                                    await supabase.from("company_follows").delete()
                                      .eq("company_id", co.id).eq("user_id", currentUser.id);
                                  } else {
                                    next.add(co.id);
                                    await supabase.from("company_follows").upsert(
                                      { company_id: co.id, user_id: currentUser.id },
                                      { onConflict: "company_id,user_id" }
                                    );
                                    setToast(`Following ${co.name}`);
                                  }
                                  setFollowedCompanies(next);
                                }}
                                className={`mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-colors ${
                                  followedCompanies.has(co.id)
                                    ? "bg-[#8B5CF6] text-white"
                                    : "bg-[#8B5CF6]/10 text-[#8B5CF6] group-hover:bg-[#8B5CF6] group-hover:text-white"
                                }`}
                              >
                                {followedCompanies.has(co.id) ? "Following" : "Follow"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </motion.div>
                  );
                }

                // ── Launches preview card ─────────────────────────────
                if (item.kind === "launches_preview") {
                  const launches = item.data as any[];
                  return (
                    <motion.div
                      key="launches-preview"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="p-4 rounded-3xl border-[#C5A059]/20 bg-gradient-to-br from-[#C5A059]/5 to-white overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] flex items-center gap-1.5">
                            <Icon name="Rocket" size={12} />
                            Today's Launches
                          </p>
                          <button
                            onClick={() => setFeedTab("launches")}
                            className="text-[9px] font-bold text-[#7A7A7A] hover:text-[#C5A059] transition-colors flex items-center gap-0.5"
                          >
                            View all <Icon name="ChevronRight" size={10} />
                          </button>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                          {launches.map((l: any) => (
                            <div
                              key={l.id}
                              onClick={() => setFeedTab("launches")}
                              className="shrink-0 w-[110px] cursor-pointer group"
                            >
                              <div className="w-full aspect-square rounded-xl bg-[#F3F1EC] border border-[#E5E3DB] overflow-hidden mb-2 flex items-center justify-center group-hover:border-[#C5A059]/40 transition-colors">
                                {l.cover_url
                                  ? <img src={l.cover_url} alt={l.headline} className="w-full h-full object-cover" />
                                  : <Icon name="Rocket" size={24} color="#C5A059" />
                                }
                              </div>
                              <p className="text-[11px] font-black text-[#202020] truncate leading-tight">{l.headline || l.product_title}</p>
                              <p className="text-[10px] text-[#7A7A7A] truncate mt-0.5 leading-tight">{l.tagline || ""}</p>
                              <div className="flex items-center gap-1 mt-1.5">
                                <Icon name="ChevronUp" size={10} color="#C5A059" />
                                <span className="text-[10px] font-black text-[#C5A059]">{l.upvotes_count || 0}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </motion.div>
                  );
                }

                // ── Collab spotlight card ─────────────────────────────
                if (item.kind === "collab_preview") {
                  const collabs = item.data as any[];
                  const STAGE_COLORS: Record<string, string> = {
                    idea: "#8B5CF6", mvp: "#F59E0B", growth: "#10B981", scale: "#3B82F6",
                  };
                  return (
                    <motion.div
                      key="collab-preview"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="p-4 rounded-3xl border-purple-200/60 bg-gradient-to-br from-purple-50/60 to-white overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 flex items-center gap-1.5">
                            <Icon name="Users" size={12} />
                            Open Collabs
                          </p>
                          <button
                            onClick={() => setFeedTab("collab")}
                            className="text-[9px] font-bold text-[#7A7A7A] hover:text-purple-600 transition-colors flex items-center gap-0.5"
                          >
                            Browse all <Icon name="ChevronRight" size={10} />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {collabs.map((c: any) => {
                            const stageColor = STAGE_COLORS[c.project_stage] || "#8B5CF6";
                            return (
                              <div
                                key={c.id}
                                onClick={() => setFeedTab("collab")}
                                className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-[#E5E3DB] cursor-pointer hover:border-purple-200 transition-colors"
                              >
                                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#F3F1EC] flex items-center justify-center">
                                  <Avatar src={c.creator_avatar} seed={c.user_id} size={32} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-black text-[#202020] truncate">{c.title}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span
                                      className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                                      style={{ color: stageColor, background: `${stageColor}18` }}
                                    >
                                      {c.project_stage}
                                    </span>
                                    {(c.roles_needed || []).slice(0, 2).map((r: string) => (
                                      <span key={r} className="text-[8px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-1.5 py-0.5 rounded-full truncate">{r}</span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <Icon name="Heart" size={10} color="#C5A059" />
                                  <span className="text-[10px] font-black text-[#C5A059]">{c.upvotes_count || 0}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    </motion.div>
                  );
                }

                // ── Open bounty card ──────────────────────────────────
                if (item.kind === "bounty") {
                  const b = item.data;
                  const diffColor = b.difficulty === "hard" ? "#EF4444" : b.difficulty === "medium" ? "#F59E0B" : "#10B981";
                  return (
                    <motion.div
                      key={`b-${b.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Card className="p-4 rounded-3xl border-[#10B981]/20 bg-gradient-to-br from-[#10B981]/5 to-white overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-[#10B981]/5 rounded-full -translate-y-6 translate-x-6" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full">
                                Open Bounty
                              </span>
                              {b.language && (
                                <span className="text-[9px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-2 py-0.5 rounded-full">
                                  {b.language}
                                </span>
                              )}
                              {b.difficulty && (
                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: diffColor + "18", color: diffColor }}>
                                  {b.difficulty}
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-[14px] text-[#202020] leading-snug line-clamp-2 mb-2">{b.title}</p>
                            {b.deadline && (
                              <p className="text-[10px] text-[#7A7A7A] flex items-center gap-1">
                                <Icon name="Clock" size={10} />
                                Deadline: {new Date(b.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[22px] font-black text-[#10B981] leading-none">{b.amount}</p>
                            <p className="text-[9px] font-bold text-[#10B981]/60 uppercase tracking-wider">credits</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); onGoToHub?.(); }}
                              className="mt-2 px-3 py-1.5 rounded-xl bg-[#10B981] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#0EA472] transition-colors"
                            >
                              Claim
                            </button>
                          </div>
                        </div>
                        {b.repo_url && (
                          <a
                            href={b.repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 flex items-center gap-1.5 text-[11px] text-[#7A7A7A] hover:text-[#202020] transition-colors"
                          >
                            <Icon name="Github" size={12} />
                            {b.repo_url.replace("https://github.com/", "")}
                          </a>
                        )}
                      </Card>
                    </motion.div>
                  );
                }

                // ── Product listing card ──────────────────────────────
                if (item.kind === "listing") {
                  const l = item.data;
                  return (
                    <motion.div
                      key={`l-${l.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Card className="p-0 overflow-hidden rounded-3xl border-[#C5A059]/15 bg-white">
                        <div className="flex items-stretch">
                          <div className="w-[88px] bg-[#F3F1EC] shrink-0 relative overflow-hidden">
                            {l.cover_url
                              ? <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover absolute inset-0" />
                              : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Icon name="Package" size={28} className="text-[#C5A059]/40" />
                                </div>
                              )
                            }
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10" />
                          </div>
                          <div className="flex-1 p-3.5">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-bold text-[13px] text-[#202020] leading-snug line-clamp-2 flex-1">{l.title}</p>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[#7A7A7A] bg-[#F3F1EC] px-1.5 py-0.5 rounded-full shrink-0">
                                {l.kind || "digital"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-auto pt-2">
                              <p className="text-[17px] font-black text-[#C5A059]">
                                ${((l.price_cents || 0) / 100).toFixed(2)}
                              </p>
                              <div className="flex items-center gap-1 text-[10px] text-[#7A7A7A]">
                                <Icon name="Eye" size={10} />
                                {l.views_count || 0}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[#F3F1EC]">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-[#C5A059] flex items-center gap-1">
                            <Icon name="Sparkles" size={10} />
                            Featured in Marketplace
                          </span>
                          <div className="flex-1" />
                          {l.sandbox_zip_url && <HomeForgeButton listing={l} />}
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenListing?.(l.id); }}
                            className="px-3 py-1 rounded-xl bg-[#C5A059] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#B8943F] transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </Card>
                    </motion.div>
                  );
                }

                // ── Company announcement card ─────────────────────────
                if (item.kind === "company_post") {
                  const p = item.data;
                  const co = p.company;
                  return (
                    <motion.div
                      key={`cp-${p.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Card
                        className="p-4 rounded-3xl border-[#8B5CF6]/15 bg-gradient-to-br from-[#8B5CF6]/3 to-white cursor-pointer"
                        onClick={() => co?.id && onOpenCompany?.(co.id)}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-[#8B5CF6]/10 overflow-hidden shrink-0 flex items-center justify-center">
                            {co?.logo_url
                              ? <img src={co.logo_url} alt={co.name} className="w-full h-full object-cover" />
                              : <span className="font-black text-[#8B5CF6] text-base">{co?.name?.[0] || "C"}</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[14px] text-[#202020]">{co?.name || "Company"}</span>
                              {co?.is_verified && <Icon name="BadgeCheck" size={13} className="text-[#C5A059] shrink-0" />}
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[#8B5CF6] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded-full ml-auto">
                                Announcement
                              </span>
                            </div>
                            <p className="text-[11px] text-[#7A7A7A]">@{co?.slug} · {timeAgo(p.created_at)}</p>
                          </div>
                        </div>
                        <p className="text-[13px] text-[#202020] leading-relaxed line-clamp-4">{p.content}</p>
                        {p.image_url && (
                          <img src={p.image_url} alt="" className="w-full rounded-2xl mt-3 object-cover max-h-48" />
                        )}
                        <div className="flex items-center gap-4 mt-3 text-[11px] text-[#7A7A7A]">
                          <span className="flex items-center gap-1"><Icon name="Heart" size={12} />{p.likes_count || 0}</span>
                          <span className="flex items-center gap-1"><Icon name="MessageCircle" size={12} />{p.comments_count || 0}</span>
                        </div>
                      </Card>
                    </motion.div>
                  );
                }

                // ── Closed contract card ──────────────────────────────
                if (item.kind === "contract") {
                  return (
                    <SystemContractCard
                      key={`c-${item.data.id}`}
                      ev={item.data}
                      onView={() =>
                        onOpenContent({
                          title: `Contract #${item.data.id.slice(0, 6)} · ${item.data.title}`,
                          content: `Paid ${item.data.amount} credits${
                            item.data.language ? " · " + item.data.language : ""
                          }. Review the code on GitHub for the full solution.`,
                          image_url: null,
                        })
                      }
                    />
                  );
                }
                const post = item.data;
                const isLiked = likedPosts.has(post.id);
                const isSaved = bookmarked.has(post.id);
                const isReposted = reposted.has(post.id);
                return (
                  <motion.div
                    layout
                    key={post.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                  >
                    <Card
                      className="p-0 overflow-hidden rounded-3xl border-[#C5A059]/12 bg-white"
                      onClick={() => openPost(post)}
                    >
                      <div className="flex items-start gap-3 px-4 pt-4 mb-3">
                        <Avatar seed={post.author_id} size={46} src={post.avatar_url} ring />
                        <div className="flex-1 min-w-0 mt-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[15px] tracking-tight leading-none text-[#202020] truncate">
                              {post.display_name}
                            </span>
                            {post.verified && (
                              <Icon name="BadgeCheck" size={15} color="#C5A059" className="shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[12.5px] font-medium text-[#C5A059] truncate">
                              @{post.username}
                            </span>
                            <span className="text-[#C5A059]/40 text-[11px]">·</span>
                            <span className="text-[11.5px] font-medium text-[#7A7A7A] shrink-0">
                              {timeAgo(post.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="relative shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuPostId(menuPostId === post.id ? null : post.id);
                            }}
                            className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-[#7A7A7A] hover:text-[#202020] hover:bg-[#F3F1EC] transition-colors"
                            aria-label="More options"
                          >
                            <Icon name="MoreHorizontal" size={18} />
                          </button>
                          <AnimatePresence>
                            {menuPostId === post.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                                transition={{ duration: 0.15 }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-9 z-30 w-44 bg-white rounded-2xl border border-[#C5A059]/15 shadow-xl shadow-[#202020]/10 overflow-hidden py-1"
                              >
                                {[
                                  { label: "Share decree", icon: "Share2", action: (e: any) => handleShare(post, e) },
                                  { label: "Copy link", icon: "Link2", action: (e: any) => copyLink(post, e) },
                                  { label: isSaved ? "Unsave" : "Save", icon: "Bookmark", action: (e: any) => toggleBookmark(post.id, e) },
                                  { label: "Mute author", icon: "VolumeX", action: (e: any) => { e.stopPropagation(); setMenuPostId(null); setToast("Author muted"); } },
                                  { label: "Report", icon: "Flag", action: (e: any) => { e.stopPropagation(); setMenuPostId(null); setToast("Report sent to the Senate"); } },
                                ].map((m) => (
                                  <button
                                    key={m.label}
                                    onClick={m.action}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold text-[#202020] hover:bg-[#F3F1EC] transition-colors"
                                  >
                                    <Icon name={m.icon as any} size={15} className="text-[#C5A059]" />
                                    {m.label}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      {post.content && (
                        <p className="text-[15px] text-[#202020] leading-[1.5] font-normal mb-3 whitespace-pre-wrap px-4">
                          {post.content}
                        </p>
                      )}
                      {post.image_url && (
                        <div
                          className="relative w-full aspect-[4/3] max-h-80 overflow-hidden mb-3 border-y border-[#C5A059]/10 select-none"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleDoubleLike(post);
                          }}
                        >
                          <img src={post.image_url} className="w-full h-full object-cover" alt="" />
                          {burstId === post.id && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <Icon
                                name="Heart"
                                size={92}
                                className="fill-white text-white drop-shadow-lg animate-heart-burst"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 pb-3.5 pt-1">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleLike(post.id, e)}
                            className={cn(
                              "flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full transition-colors",
                              isLiked ? "bg-[#C5A059]/12" : "hover:bg-[#F3F1EC]"
                            )}
                          >
                            <motion.div
                              animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <Icon
                                name="Heart"
                                size={18}
                                color={isLiked ? "#C5A059" : "#7A7A7A"}
                                className={cn(isLiked && "fill-[#C5A059]")}
                              />
                            </motion.div>
                            <span
                              className={cn(
                                "text-[13px] font-semibold tabular-nums",
                                isLiked ? "text-[#C5A059]" : "text-[#7A7A7A]"
                              )}
                            >
                              {post.likes_count || 0}
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPost(post);
                            }}
                            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full text-[#7A7A7A] hover:text-[#202020] hover:bg-[#F3F1EC] transition-colors"
                          >
                            <Icon name="MessageCircle" size={18} />
                            <span className="text-[13px] font-semibold tabular-nums">
                              {post.comments_count || 0}
                            </span>
                          </button>
                          <button
                            onClick={(e) => handleShare(post, e)}
                            className="flex items-center justify-center w-9 h-9 rounded-full text-[#7A7A7A] hover:text-[#202020] hover:bg-[#F3F1EC] transition-colors"
                            aria-label="Share"
                          >
                            <Icon name="Share2" size={17} />
                          </button>
                          <button
                            onClick={(e) => handleRepost(post.id, e)}
                            className={cn(
                              "flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full transition-colors",
                              isReposted ? "text-[#0EA5E9] bg-[#0EA5E9]/10" : "text-[#7A7A7A] hover:text-[#0EA5E9] hover:bg-[#0EA5E9]/8"
                            )}
                            aria-label="Repost"
                          >
                            <Icon name="Repeat2" size={17} />
                            {(post.reposts_count || 0) > 0 && (
                              <span className="text-[13px] font-semibold tabular-nums">
                                {post.reposts_count}
                              </span>
                            )}
                          </button>
                        </div>
                        <button
                          onClick={(e) => toggleBookmark(post.id, e)}
                          className={cn(
                            "flex items-center justify-center w-9 h-9 rounded-full transition-colors",
                            isSaved ? "text-[#C5A059] bg-[#C5A059]/12" : "text-[#7A7A7A] hover:text-[#202020] hover:bg-[#F3F1EC]"
                          )}
                          aria-label="Save"
                        >
                          <Icon name="Bookmark" size={17} className={cn(isSaved && "fill-[#C5A059]")} />
                        </button>
                      </div>
                    </Card>
                  </motion.div>
                );
              });
            })()
          ))}
          {feedTab !== "launches" && feedTab !== "collab" && posts.length === 0 && contracts.length === 0 && !loading && (
            <div className="text-center py-10 opacity-50">
              <Icon name="Database" size={40} className="mx-auto mb-3 text-[#C5A059]" />
              <p className="text-sm font-bold uppercase tracking-widest text-[#202020]">
                No decrees yet
              </p>
            </div>
          )}
        </AnimatePresence>

      </div>

      <AnimatePresence>
        {isComposerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#202020]/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-[480px] bg-[#FAF9F6] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-[#C5A059]/20"
            >
              <div className="h-14 border-b border-[#C5A059]/10 flex items-center justify-between px-4 shrink-0">
                <button
                  onClick={() => setIsComposerOpen(false)}
                  className="text-[#7A7A7A] font-bold text-[13px] uppercase tracking-widest px-2 py-1"
                >
                  Close
                </button>
                <div className="text-center leading-none">
                  <div className="font-bold text-[15px] text-[#202020] serif italic">New Decree</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#C5A059] mt-1">
                    {postAudience === "public" ? "To the Empire" : postAudience === "legion" ? "To the Legion" : "Inner Circle"}
                  </div>
                </div>
                <button
                  onClick={createPost}
                  disabled={(!newPost.trim() && !newPostImage.trim()) || newPost.length > MAX_LEN}
                  className="text-[13px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-[#C5A059] text-white disabled:opacity-40 disabled:bg-[#7A7A7A] shadow-sm shadow-[#C5A059]/30"
                >
                  Publish
                </button>
              </div>

              {/* Category pills */}
              <div className="px-4 pt-3 pb-1 flex gap-1.5 overflow-x-auto no-scrollbar">
                {([
                  ["decree", "Decree", "FileText"],
                  ["question", "Question", "HelpCircle"],
                  ["quote", "Quote", "Quote"],
                  ["insight", "Insight", "Sparkles"],
                  ["log", "Build Log", "Hammer"],
                ] as const).map(([id, label, icon]) => (
                  <button
                    key={id}
                    onClick={() => setPostCategory(id as any)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shrink-0 transition-all",
                      postCategory === id
                        ? "bg-[#202020] text-[#FAF9F6]"
                        : "bg-[#F3F1EC] text-[#7A7A7A] hover:text-[#202020]"
                    )}
                  >
                    <Icon name={icon as any} size={12} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-4 pt-3 pb-2 flex gap-3 overflow-y-auto">
                <Avatar seed={currentUser?.id} size={40} className="mt-1 shrink-0" />
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  <textarea
                    autoFocus
                    placeholder={
                      postCategory === "question" ? "Ask the Legion something worth answering…" :
                      postCategory === "quote" ? "Inscribe the words…" :
                      postCategory === "insight" ? "A thought worth keeping…" :
                      postCategory === "log" ? "What did you build today?" :
                      "What is happening in the empire?"
                    }
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    maxLength={MAX_LEN + 50}
                    className="w-full bg-transparent border-none outline-none resize-none text-[16px] leading-relaxed min-h-[120px] placeholder:text-[#7A7A7A]/70 serif"
                  />

                  {postCategory === "quote" && (
                    <input
                      type="text"
                      placeholder="Attribute to… (e.g. Seneca)"
                      value={quoteAuthor}
                      onChange={(e) => setQuoteAuthor(e.target.value)}
                      className="w-full bg-transparent border-b border-[#C5A059]/30 px-1 py-1.5 text-[13px] italic focus:outline-none focus:border-[#C5A059] text-[#7A7A7A]"
                    />
                  )}

                  {newPostImage && (
                    <div className="relative">
                      <img
                        src={newPostImage}
                        className="w-full max-h-56 object-cover rounded-2xl border border-[#C5A059]/20"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                      <button
                        onClick={() => setNewPostImage("")}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#202020]/70 backdrop-blur text-white flex items-center justify-center"
                        aria-label="Remove image"
                      >
                        <Icon name="X" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Toolbar */}
              <div className="px-3 pb-3 pt-2 border-t border-[#C5A059]/10 mt-auto flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-0.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#C5A059] hover:bg-[#C5A059]/10 disabled:opacity-50"
                    aria-label="Attach image"
                  >
                    {uploadingImage
                      ? <Icon name="Loader2" size={18} className="animate-spin" />
                      : <Icon name="ImagePlus" size={18} />}
                  </button>
                  <button
                    onClick={() => {
                      const url = window.prompt("Image URL");
                      if (url) setNewPostImage(url);
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#7A7A7A] hover:text-[#C5A059] hover:bg-[#C5A059]/10"
                    aria-label="Paste image URL"
                  >
                    <Icon name="Link" size={17} />
                  </button>
                  {/* Audience cycle */}
                  <button
                    onClick={() =>
                      setPostAudience(postAudience === "public" ? "legion" : postAudience === "legion" ? "inner" : "public")
                    }
                    className="ml-1 flex items-center gap-1.5 px-2.5 h-9 rounded-full text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] hover:text-[#C5A059] hover:bg-[#C5A059]/10"
                    aria-label="Change audience"
                  >
                    <Icon
                      name={postAudience === "public" ? "Globe" : postAudience === "legion" ? "Users" : "Lock"}
                      size={13}
                    />
                    {postAudience === "public" ? "Public" : postAudience === "legion" ? "Legion" : "Inner"}
                  </button>
                </div>

                {/* Character counter */}
                <div className="flex items-center gap-2 pr-1">
                  <div className="relative w-7 h-7">
                    <svg viewBox="0 0 28 28" className="w-7 h-7 -rotate-90">
                      <circle cx="14" cy="14" r="11" fill="none" stroke="#E5E3DB" strokeWidth="2.5" />
                      <circle
                        cx="14" cy="14" r="11" fill="none"
                        stroke={newPost.length > MAX_LEN ? "#C0392B" : newPost.length > MAX_LEN * 0.85 ? "#C5A059" : "#10B981"}
                        strokeWidth="2.5"
                        strokeDasharray={2 * Math.PI * 11}
                        strokeDashoffset={2 * Math.PI * 11 * (1 - Math.min(newPost.length / MAX_LEN, 1))}
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <span className={cn(
                    "text-[11px] font-bold tabular-nums",
                    newPost.length > MAX_LEN ? "text-[#C0392B]" : "text-[#7A7A7A]"
                  )}>
                    {MAX_LEN - newPost.length}
                  </span>
                </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#202020]/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-[480px] bg-[#FAF9F6] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90vh] sm:max-h-[800px] border border-[#C5A059]/20"
            >
              <div className="h-14 border-b border-[#E5E3DB] flex items-center justify-between px-4 shrink-0">
                <button onClick={() => setSelectedPost(null)} className="p-2 text-[#C5A059]">
                  <Icon name="ArrowLeft" />
                </button>
                <span className="font-bold text-[16px]">Decree</span>
                <div className="w-10" />
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-4 border-b border-[#E5E3DB]">
                  <div className="flex gap-3 mb-3">
                    <Avatar seed={selectedPost.author_id} size={44} src={selectedPost.avatar_url} />
                    <div className="flex-1 mt-0.5">
                      <div className="font-bold text-[15px]">{selectedPost.display_name}</div>
                      <div className="text-[13px] text-[#C5A059]">@{selectedPost.username}</div>
                    </div>
                  </div>
                  <p className="text-[16px] leading-[1.5] whitespace-pre-wrap">
                    {selectedPost.content}
                  </p>
                  {selectedPost.image_url && (
                    <img
                      src={selectedPost.image_url}
                      className="w-full rounded-2xl mt-3 border border-[#C5A059]/10"
                    />
                  )}
                </div>
                <div className="p-4 space-y-4">
                  {comments.length === 0 ? (
                    <p className="text-center text-[#7A7A7A] font-medium text-sm mt-8">
                      No comments yet. Be the first to speak.
                    </p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="flex gap-3">
                        <Avatar seed={c.author_id} size={36} src={c.avatar_url} />
                        <div className="flex-1 bg-[#F3F1EC] rounded-2xl rounded-tl-sm p-3 border border-[#E5E3DB]">
                          <div className="font-bold text-[13px] mb-1">{c.display_name}</div>
                          <p className="text-[14px] leading-relaxed">{c.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-[#E5E3DB] flex items-center gap-2 pb-6 shrink-0">
                <div className="flex-1 bg-[#F3F1EC] rounded-full flex items-center px-4 py-2 text-sm border border-transparent focus-within:border-[#C5A059]/50">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitComment()}
                    placeholder="Contribute to the discussion…"
                    className="flex-1 bg-transparent outline-none py-1"
                  />
                </div>
                <button
                  onClick={submitComment}
                  disabled={!newComment.trim()}
                  className="w-10 h-10 rounded-full bg-[#C5A059] flex items-center justify-center text-white disabled:opacity-50"
                >
                  <Icon name="Send" size={16} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <StoryComposer
        open={storyComposerOpen}
        onClose={() => setStoryComposerOpen(false)}
        currentUser={currentUser}
        onCreated={refetchStories}
      />

      {activeStoryId && (
        <StoryViewer
          stories={stories as any}
          initialId={activeStoryId}
          currentUserId={currentUser?.id}
          onClose={() => setActiveStoryId(null)}
          onDeleted={() => {
            setStories((prev) => prev.filter((s) => s.id !== activeStoryId));
            refetchStories();
          }}
        />
      )}

      {/* Click-away layer for the post context menu */}
      {menuPostId && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuPostId(null)} />
      )}

      {/* Lightweight toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#202020] text-white shadow-xl shadow-[#202020]/30"
          >
            <Icon name="Check" size={15} className="text-[#D4AF37]" />
            <span className="text-[12.5px] font-semibold whitespace-nowrap">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
