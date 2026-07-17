import React, { useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, cn } from "../UI";
import { toast } from "sonner";

type Question = {
  id: string;
  listing_id: string;
  asker_id: string;
  question: string;
  answer?: string | null;
  answerer_id?: string | null;
  is_accepted?: boolean;
  upvotes: number;
  answered_at?: string | null;
  created_at: string;
  asker?: { display_name?: string; handle?: string; avatar_url?: string } | null;
  answerer?: { display_name?: string; handle?: string; avatar_url?: string } | null;
};

type Props = {
  listingId: string;
  sellerId: string;
  questions: Question[];
  currentUser?: any;
  onRefresh: () => void;
};

export function QATab({ listingId, sellerId, questions, currentUser, onRefresh }: Props) {
  const [q, setQ] = useState("");
  const [answerForms, setAnswerForms] = useState<Record<string, string>>({});
  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"recent" | "popular">("popular");
  const [submitting, setSubmitting] = useState(false);

  const isSeller = currentUser?.id === sellerId;

  const askQuestion = async () => {
    if (!currentUser?.id) return void toast.error("Sign in to ask");
    if (!q.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("listing_questions")
      .insert({ listing_id: listingId, asker_id: currentUser.id, question: q.trim() });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setQ("");
      onRefresh();
      toast.success("Question posted");
    }
  };

  const postAnswer = async (questionId: string) => {
    const answerText = answerForms[questionId];
    if (!answerText?.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("listing_questions")
      .update({
        answer: answerText.trim(),
        answerer_id: currentUser?.id,
        answered_at: new Date().toISOString(),
        is_accepted: isSeller,
      })
      .eq("id", questionId);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setAnswerForms((f) => {
        const copy = { ...f };
        delete copy[questionId];
        return copy;
      });
      onRefresh();
      toast.success(isSeller ? "Answer posted" : "Answer submitted");
    }
  };

  const markAccepted = async (questionId: string) => {
    const { error } = await supabase
      .from("listing_questions")
      .update({ is_accepted: true })
      .eq("id", questionId);
    if (error) toast.error(error.message);
    else {
      onRefresh();
      toast.success("Marked as accepted answer");
    }
  };

  const toggleUpvote = async (questionId: string, isVoted: boolean) => {
    if (!currentUser?.id) return void toast.error("Sign in first");
    if (isVoted) {
      await supabase
        .from("question_upvotes")
        .delete()
        .eq("question_id", questionId)
        .eq("user_id", currentUser.id);
    } else {
      await supabase
        .from("question_upvotes")
        .insert({ question_id: questionId, user_id: currentUser.id });
    }
    setMyVotes((v) => ({ ...v, [questionId]: !isVoted }));
    onRefresh();
  };

  const sorted = [...questions].sort((a, b) => {
    if (sortBy === "popular") return (b.upvotes || 0) - (a.upvotes || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="mt-4 space-y-3">
      {/* Ask box */}
      <div className="p-3.5 space-y-2.5 rounded-2xl bg-white border border-black/[0.05]">
        <p className="text-[12.5px] font-semibold tracking-tight text-[#1D1D1F]">Ask a question</p>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={2}
          placeholder="Ask about setup, compatibility, licensing, or anything else…"
          className="w-full text-[14px] bg-[#F5F5F7] rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
        />
        <Button size="sm" onClick={askQuestion} disabled={submitting || !q.trim()}>
          <Icon name="MessageSquare" size={12} />
          {submitting ? "Posting…" : "Ask"}
        </Button>
      </div>

      {/* Sort */}
      {questions.length > 1 && (
        <div className="flex gap-2 px-1">
          {(["popular", "recent"] as const).map((s) => (
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
              {s === "popular" ? "Most voted" : "Most recent"}
            </button>
          ))}
        </div>
      )}

      {/* Question list */}
      {sorted.length === 0 ? (
        <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
          No questions yet. Ask the first one!
        </p>
      ) : (
        sorted.map((qi) => {
          const isVoted = myVotes[qi.id] ?? false;
          const showAnswerForm =
            answerForms[qi.id] !== undefined || (isSeller && !qi.answer);
          const canAnswer = !!currentUser?.id && !qi.answer;

          return (
            <div
              key={qi.id}
              className={cn(
                "p-3.5 space-y-2.5 rounded-2xl border",
                qi.is_accepted
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-white border-black/[0.05]",
              )}
            >
              {/* Question header */}
              <div className="flex items-start gap-3">
                {/* Upvote */}
                <button
                  onClick={() => toggleUpvote(qi.id, isVoted)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors shrink-0",
                    isVoted
                      ? "bg-[#0A84FF]/10 text-[#0A84FF]"
                      : "bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]",
                  )}
                >
                  <Icon name="ArrowUp" size={13} />
                  <span className="text-[11px] font-semibold">{qi.upvotes || 0}</span>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar src={qi.asker?.avatar_url} seed={qi.asker_id} size={22} />
                    <p className="text-[11.5px] text-[#86868B] font-medium tracking-tight">
                      {qi.asker?.display_name || qi.asker?.handle || "Anonymous"}
                    </p>
                    <p className="text-[11px] text-[#AEAEB2] tracking-tight">
                      {new Date(qi.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {qi.is_accepted && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                        <Icon name="CheckCircle2" size={9} color="#16a34a" />
                        Accepted
                      </span>
                    )}
                  </div>
                  <p className="text-[14.5px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">
                    {qi.question}
                  </p>
                </div>
              </div>

              {/* Answer */}
              {qi.answer ? (
                <div className="ml-10 p-3 rounded-xl bg-white border border-black/[0.05]">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar src={qi.answerer?.avatar_url} seed={qi.answerer_id || ""} size={20} />
                      <p className="text-[11.5px] font-semibold text-[#1D1D1F] tracking-tight">
                        {qi.answerer?.display_name || qi.answerer?.handle || "Seller"}
                      </p>
                      {qi.answerer_id === sellerId && (
                        <span className="text-[10px] font-semibold text-[#0A84FF] tracking-tight">
                          Seller
                        </span>
                      )}
                    </div>
                    {isSeller && !qi.is_accepted && (
                      <button
                        onClick={() => markAccepted(qi.id)}
                        className="text-[11px] font-medium text-emerald-600 tracking-tight flex items-center gap-1"
                      >
                        <Icon name="CheckCircle2" size={11} color="#16a34a" />
                        Mark accepted
                      </button>
                    )}
                  </div>
                  <p className="text-[13.5px] text-[#3A3A3C] tracking-tight leading-relaxed">
                    {qi.answer}
                  </p>
                </div>
              ) : (
                <div className="ml-10">
                  {/* Show answer form for seller or any authenticated user */}
                  {canAnswer ? (
                    answerForms[qi.id] !== undefined ? (
                      <div className="flex gap-2">
                        <textarea
                          value={answerForms[qi.id]}
                          onChange={(e) =>
                            setAnswerForms((f) => ({ ...f, [qi.id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Write your answer…"
                          className="flex-1 text-[13.5px] bg-[#F5F5F7] rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
                        />
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" onClick={() => postAnswer(qi.id)} disabled={submitting}>
                            Post
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setAnswerForms((f) => {
                                const copy = { ...f };
                                delete copy[qi.id];
                                return copy;
                              })
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAnswerForms((f) => ({ ...f, [qi.id]: "" }))}
                        className="text-[12px] font-medium text-[#0A84FF] tracking-tight flex items-center gap-1"
                      >
                        <Icon name="MessageSquarePlus" size={12} />
                        {isSeller ? "Answer" : "Answer this question"}
                      </button>
                    )
                  ) : (
                    <p className="text-[12px] text-[#86868B] tracking-tight italic">
                      Awaiting a reply…
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
