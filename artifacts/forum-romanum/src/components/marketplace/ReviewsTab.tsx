import React, { useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, cn } from "../UI";
import { toast } from "sonner";

type Review = {
  id: string;
  listing_id: string;
  reviewer_id: string;
  rating: number;
  body: string;
  seller_reply?: string | null;
  seller_reply_at?: string | null;
  helpful_count: number;
  is_verified_purchase: boolean;
  created_at: string;
  updated_at?: string | null;
  reviewer?: { display_name?: string; handle?: string; avatar_url?: string } | null;
};

type Props = {
  listingId: string;
  sellerId: string;
  reviews: Review[];
  currentUser?: any;
  onRefresh: () => void;
};

export function ReviewsTab({ listingId, sellerId, reviews, currentUser, onRefresh }: Props) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editRating, setEditRating] = useState(5);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"recent" | "helpful">("recent");

  const isSeller = currentUser?.id === sellerId;
  const myReview = reviews.find((r) => r.reviewer_id === currentUser?.id);

  const submitReview = async () => {
    if (!currentUser?.id) return void toast.error("Sign in to review");
    if (!body.trim()) return void toast.error("Write something first");
    setSubmitting(true);
    const { error } = await supabase.from("listing_reviews").upsert(
      { listing_id: listingId, reviewer_id: currentUser.id, rating, body },
      { onConflict: "listing_id,reviewer_id" },
    );
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setBody("");
      setRating(5);
      onRefresh();
      toast.success("Review posted");
    }
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("listing_reviews")
      .update({ rating: editRating, body: editBody, updated_at: new Date().toISOString() })
      .eq("id", editId);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setEditId(null);
      onRefresh();
      toast.success("Review updated");
    }
  };

  const deleteReview = async (id: string) => {
    const { error } = await supabase.from("listing_reviews").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      onRefresh();
      toast.success("Review deleted");
    }
  };

  const postSellerReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("listing_reviews")
      .update({ seller_reply: replyText, seller_reply_at: new Date().toISOString() })
      .eq("id", reviewId);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setReplyId(null);
      setReplyText("");
      onRefresh();
      toast.success("Reply posted");
    }
  };

  const toggleHelpful = async (reviewId: string, isVoted: boolean) => {
    if (!currentUser?.id) return void toast.error("Sign in first");
    if (isVoted) {
      await supabase
        .from("review_helpful_votes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", currentUser.id);
    } else {
      await supabase
        .from("review_helpful_votes")
        .insert({ review_id: reviewId, user_id: currentUser.id });
    }
    setMyVotes((v) => ({ ...v, [reviewId]: !isVoted }));
    onRefresh();
  };

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const sorted = [...reviews].sort((a, b) => {
    if (sortBy === "helpful") return (b.helpful_count || 0) - (a.helpful_count || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="mt-4 space-y-3">
      {/* Rating Summary */}
      {reviews.length > 0 && (
        <div className="p-4 rounded-2xl bg-white border border-black/[0.05] flex items-center gap-5">
          <div className="text-center">
            <div className="text-[42px] font-semibold tracking-tight text-[#1D1D1F] leading-none">
              {avgRating}
            </div>
            <div className="flex items-center justify-center gap-0.5 mt-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon
                  key={i}
                  name="Star"
                  size={10}
                  color={i < Math.round(parseFloat(avgRating || "0")) ? "#FFB100" : "#E5E5EA"}
                />
              ))}
            </div>
            <p className="text-[11px] text-[#86868B] font-medium tracking-tight mt-1">
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </p>
          </div>
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviews.filter((r) => r.rating === star).length;
              const pct = reviews.length ? (count / reviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#86868B] font-medium w-2">{star}</span>
                  <div className="flex-1 h-1.5 bg-[#F2F2F4] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FFB100] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[#86868B] w-4">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Write a review (only if not already reviewed) */}
      {!myReview && currentUser?.id && currentUser.id !== sellerId && (
        <div className="p-3.5 space-y-2.5 rounded-2xl bg-white border border-black/[0.05]">
          <p className="text-[12.5px] font-semibold tracking-tight text-[#1D1D1F]">Write a review</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className="tap-scale">
                <Icon name="Star" size={22} color={n <= rating ? "#FFB100" : "#E5E5EA"} />
              </button>
            ))}
            <span className="ml-2 text-[12px] text-[#86868B] font-medium tracking-tight">
              {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Share your experience…"
            className="w-full text-[14px] bg-[#F5F5F7] rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
          />
          <Button size="sm" onClick={submitReview} disabled={submitting}>
            {submitting ? "Posting…" : "Post review"}
          </Button>
        </div>
      )}

      {/* Sort */}
      {reviews.length > 1 && (
        <div className="flex gap-2 px-1">
          {(["recent", "helpful"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                "text-[12px] font-medium tracking-tight px-3 py-1.5 rounded-full transition-colors",
                sortBy === s
                  ? "bg-[#1D1D1F] text-white"
                  : "bg-white border border-black/[0.06] text-[#86868B]",
              )}
            >
              {s === "recent" ? "Most recent" : "Most helpful"}
            </button>
          ))}
        </div>
      )}

      {/* Review list */}
      {sorted.length === 0 ? (
        <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
          No reviews yet. Be the first!
        </p>
      ) : (
        sorted.map((r) => {
          const isOwn = currentUser?.id === r.reviewer_id;
          const isVoted = myVotes[r.id] ?? false;
          const editing = editId === r.id;
          const replying = replyId === r.id;

          return (
            <div key={r.id} className="p-3.5 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={r.reviewer?.avatar_url}
                    seed={r.reviewer_id}
                    size={34}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13.5px] font-semibold tracking-tight text-[#1D1D1F]">
                        {r.reviewer?.display_name || r.reviewer?.handle || "Anonymous"}
                      </p>
                      {r.is_verified_purchase && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-[10px] font-semibold text-emerald-700 tracking-tight">
                          <Icon name="BadgeCheck" size={9} color="#16a34a" />
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#86868B] tracking-tight">
                      {new Date(r.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                {isOwn && !editing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditId(r.id);
                        setEditBody(r.body);
                        setEditRating(r.rating);
                      }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[#86868B] hover:bg-[#F5F5F7]"
                    >
                      <Icon name="Pencil" size={12} />
                    </button>
                    <button
                      onClick={() => deleteReview(r.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[#FF3B30] hover:bg-red-50"
                    >
                      <Icon name="Trash2" size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Stars */}
              {!editing && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} name="Star" size={13} color={i < r.rating ? "#FFB100" : "#E5E5EA"} />
                  ))}
                </div>
              )}

              {/* Body / Edit */}
              {editing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setEditRating(n)}>
                        <Icon name="Star" size={18} color={n <= editRating ? "#FFB100" : "#E5E5EA"} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    className="w-full text-[14px] bg-[#F5F5F7] rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} disabled={submitting}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[14px] text-[#1D1D1F] tracking-tight leading-relaxed">{r.body}</p>
              )}

              {/* Seller reply */}
              {r.seller_reply && (
                <div className="mt-1 p-2.5 rounded-xl bg-[#F5F5F7] border-l-2 border-[#0A84FF]">
                  <p className="text-[11px] font-semibold text-[#0A84FF] tracking-tight mb-1">
                    Seller reply
                  </p>
                  <p className="text-[13.5px] text-[#3A3A3C] tracking-tight leading-relaxed">
                    {r.seller_reply}
                  </p>
                </div>
              )}

              {/* Footer actions */}
              {!editing && (
                <div className="flex items-center justify-between pt-0.5">
                  <button
                    onClick={() => toggleHelpful(r.id, isVoted)}
                    className={cn(
                      "flex items-center gap-1.5 text-[12px] font-medium tracking-tight px-2.5 py-1.5 rounded-full transition-colors",
                      isVoted
                        ? "bg-[#0A84FF]/10 text-[#0A84FF]"
                        : "bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]",
                    )}
                  >
                    <Icon name="ThumbsUp" size={12} />
                    Helpful ({r.helpful_count || 0})
                  </button>
                  {isSeller && !r.seller_reply && (
                    <button
                      onClick={() => {
                        setReplyId(r.id);
                        setReplyText("");
                      }}
                      className="text-[12px] font-medium text-[#0A84FF] tracking-tight"
                    >
                      Reply
                    </button>
                  )}
                </div>
              )}

              {/* Seller reply form */}
              {replying && (
                <div className="flex gap-2 mt-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="Write a reply…"
                    className="flex-1 text-[13.5px] bg-[#F5F5F7] rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
                  />
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" onClick={() => postSellerReply(r.id)} disabled={submitting}>
                      Post
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setReplyId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
