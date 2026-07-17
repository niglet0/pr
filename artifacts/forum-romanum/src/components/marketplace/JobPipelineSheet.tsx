import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, Skeleton, cn } from "../UI";
import { toast } from "sonner";

type Application = {
  id: string;
  listing_id: string;
  applicant_id: string;
  status: string;
  stage: string;
  cover_letter?: string;
  resume_url?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  applicant?: {
    display_name?: string;
    handle?: string;
    avatar_url?: string;
    username?: string;
  };
};

type Props = {
  listingId: string;
  listingTitle: string;
  sellerId: string;
  currentUser?: any;
  onClose: () => void;
};

const STAGES = [
  { id: "applied", label: "Applied", icon: "FileText", color: "#86868B" },
  { id: "shortlisted", label: "Shortlisted", icon: "Star", color: "#FF9F0A" },
  { id: "interview", label: "Interview", icon: "Video", color: "#0A84FF" },
  { id: "offer", label: "Offer", icon: "Award", color: "#8B5CF6" },
  { id: "hired", label: "Hired", icon: "CheckCircle2", color: "#34C759" },
  { id: "rejected", label: "Rejected", icon: "XCircle", color: "#FF3B30" },
];

function StageBadge({ stage }: { stage: string }) {
  const s = STAGES.find((x) => x.id === stage) || STAGES[0];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-tight"
      style={{ color: s.color, background: `${s.color}18` }}
    >
      <Icon name={s.icon as any} size={9} color={s.color} />
      {s.label}
    </span>
  );
}

export function JobPipelineSheet({
  listingId,
  listingTitle,
  sellerId,
  currentUser,
  onClose,
}: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [noteText, setNoteText] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSeller = currentUser?.id === sellerId;

  const fetchApplications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("job_applications")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      const applicantIds = [...new Set(data.map((a: any) => a.applicant_id))];
      const { data: users } = await supabase
        .from("users")
        .select("id, display_name, handle, avatar_url, username")
        .in("id", applicantIds);

      const userMap: Record<string, any> = {};
      (users || []).forEach((u) => (userMap[u.id] = u));
      setApplications(
        data.map((a: any) => ({ ...a, applicant: userMap[a.applicant_id] })),
      );
    } else {
      setApplications([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApplications();
  }, [listingId]);

  const updateStage = async (id: string, stage: string) => {
    setSubmitting(true);
    const { error } = await supabase
      .from("job_applications")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      fetchApplications();
      if (selected?.id === id) setSelected((a) => a ? { ...a, stage } : null);
      toast.success("Stage updated");
    }
  };

  const saveNote = async (id: string) => {
    setSubmitting(true);
    const { error } = await supabase
      .from("job_applications")
      .update({ notes: noteText, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      fetchApplications();
      toast.success("Note saved");
    }
  };

  const stageCounts = STAGES.reduce(
    (acc, s) => {
      acc[s.id] = applications.filter((a) => (a.stage || "applied") === s.id).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const visible = stageFilter
    ? applications.filter((a) => (a.stage || "applied") === stageFilter)
    : applications;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 200 }}
      className="absolute inset-0 z-[140] bg-[#F5F5F7] flex flex-col"
    >
      <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
        <button
          onClick={onClose}
          className="text-[#0A84FF] tap-scale flex items-center text-[15px] tracking-tight"
        >
          <Icon name="ChevronLeft" size={22} />
          <span className="-ml-1">Back</span>
        </button>
        <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] truncate max-w-[180px]">
          Applicants
        </span>
        <div className="w-10 text-right">
          <span className="text-[13px] font-semibold text-[#86868B] tracking-tight">
            {applications.length}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={72} rounded={14} />
            ))}
          </div>
        ) : (
          <>
            {/* Pipeline funnel */}
            <div className="p-4 space-y-3">
              <div className="p-3 rounded-2xl bg-white border border-black/[0.05]">
                <p className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-3">
                  Pipeline
                </p>
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                  <button
                    onClick={() => setStageFilter(null)}
                    className={cn(
                      "shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors",
                      !stageFilter
                        ? "bg-[#1D1D1F] text-white"
                        : "bg-[#F5F5F7] text-[#86868B]",
                    )}
                  >
                    <span className="text-[16px] font-bold">{applications.length}</span>
                    All
                  </button>
                  {STAGES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStageFilter(stageFilter === s.id ? null : s.id)}
                      className={cn(
                        "shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors",
                        stageFilter === s.id
                          ? "text-white"
                          : "bg-[#F5F5F7] text-[#86868B]",
                      )}
                      style={stageFilter === s.id ? { background: s.color } : {}}
                    >
                      <span className="text-[16px] font-bold">{stageCounts[s.id] || 0}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Applicant list */}
              {visible.length === 0 ? (
                <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
                  {stageFilter ? `No ${stageFilter} applicants.` : "No applications yet."}
                </p>
              ) : (
                <div className="space-y-2">
                  {visible.map((app) => (
                    <div
                      key={app.id}
                      onClick={() => {
                        setSelected(app);
                        setNoteText(app.notes || "");
                      }}
                      className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-black/[0.05] cursor-pointer hover:border-black/10 transition-colors tap-scale"
                    >
                      <Avatar
                        src={app.applicant?.avatar_url}
                        seed={app.applicant_id}
                        size={44}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-[14px] font-semibold text-[#1D1D1F] tracking-tight truncate">
                            {app.applicant?.display_name ||
                              app.applicant?.handle ||
                              app.applicant?.username ||
                              "Applicant"}
                          </p>
                          <StageBadge stage={app.stage || "applied"} />
                        </div>
                        <p className="text-[11.5px] text-[#86868B] tracking-tight mt-0.5">
                          @{app.applicant?.handle || app.applicant?.username || "anon"} ·{" "}
                          {new Date(app.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                        {app.cover_letter && (
                          <p className="text-[12px] text-[#6E6E73] mt-1 line-clamp-1 tracking-tight">
                            {app.cover_letter}
                          </p>
                        )}
                      </div>
                      <Icon name="ChevronRight" size={14} color="#C7C7CC" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Applicant detail overlay */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 26, stiffness: 220 }}
                  className="absolute inset-0 bg-[#F5F5F7] flex flex-col z-10"
                >
                  <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
                    <button
                      onClick={() => setSelected(null)}
                      className="text-[#0A84FF] tap-scale flex items-center text-[15px] tracking-tight"
                    >
                      <Icon name="ChevronLeft" size={22} />
                      <span className="-ml-1">Back</span>
                    </button>
                    <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F]">
                      Application
                    </span>
                    <div className="w-10" />
                  </header>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-24">
                    {/* Applicant header */}
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-black/[0.05]">
                      <Avatar
                        src={selected.applicant?.avatar_url}
                        seed={selected.applicant_id}
                        size={56}
                      />
                      <div className="flex-1">
                        <p className="text-[16px] font-semibold text-[#1D1D1F] tracking-tight">
                          {selected.applicant?.display_name ||
                            selected.applicant?.handle ||
                            "Applicant"}
                        </p>
                        <p className="text-[12.5px] text-[#86868B] tracking-tight mt-0.5">
                          @{selected.applicant?.handle || selected.applicant?.username || "anon"}
                        </p>
                        <div className="mt-2">
                          <StageBadge stage={selected.stage || "applied"} />
                        </div>
                      </div>
                    </div>

                    {/* Stage manager */}
                    {isSeller && (
                      <div className="p-4 rounded-2xl bg-white border border-black/[0.05]">
                        <p className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-3">
                          Move to stage
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {STAGES.map((s) => {
                            const isActive = (selected.stage || "applied") === s.id;
                            return (
                              <button
                                key={s.id}
                                onClick={() => updateStage(selected.id, s.id)}
                                disabled={isActive || submitting}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold tracking-tight transition-colors",
                                  isActive ? "text-white cursor-default" : "bg-[#F5F5F7] text-[#1D1D1F]",
                                )}
                                style={isActive ? { background: s.color } : {}}
                              >
                                <Icon name={s.icon as any} size={11} color={isActive ? "white" : s.color} />
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Cover letter */}
                    {selected.cover_letter && (
                      <div className="p-4 rounded-2xl bg-white border border-black/[0.05]">
                        <p className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-2">
                          Cover letter
                        </p>
                        <p className="text-[14px] text-[#1D1D1F] leading-relaxed tracking-tight">
                          {selected.cover_letter}
                        </p>
                      </div>
                    )}

                    {/* Resume */}
                    {selected.resume_url && (
                      <a
                        href={selected.resume_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-black/[0.05]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/10 flex items-center justify-center">
                          <Icon name="FileText" size={16} color="#0A84FF" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[13.5px] font-semibold text-[#1D1D1F] tracking-tight">
                            Resume / CV
                          </p>
                          <p className="text-[12px] text-[#86868B] tracking-tight">
                            View attached document
                          </p>
                        </div>
                        <Icon name="ExternalLink" size={14} color="#0A84FF" />
                      </a>
                    )}

                    {/* Notes */}
                    {isSeller && (
                      <div className="p-4 rounded-2xl bg-white border border-black/[0.05] space-y-2">
                        <p className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase">
                          Private notes
                        </p>
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          rows={3}
                          placeholder="Interview notes, impressions, next steps…"
                          className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveNote(selected.id)}
                          disabled={submitting}
                        >
                          Save note
                        </Button>
                      </div>
                    )}

                    {/* Timeline */}
                    <div className="p-4 rounded-2xl bg-white border border-black/[0.05]">
                      <p className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-3">
                        Timeline
                      </p>
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-[#34C759]" />
                          <p className="text-[13px] text-[#1D1D1F] tracking-tight">
                            Applied on{" "}
                            {new Date(selected.created_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        {selected.updated_at && selected.updated_at !== selected.created_at && (
                          <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                            <p className="text-[13px] text-[#1D1D1F] tracking-tight">
                              Last updated{" "}
                              {new Date(selected.updated_at).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Apply form — used by applicants in listing detail                   */
/* ------------------------------------------------------------------ */

type ApplyFormProps = {
  listingId: string;
  currentUser?: any;
  onApplied: () => void;
};

export function ApplyForm({ listingId, currentUser, onApplied }: ApplyFormProps) {
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apply = async () => {
    if (!currentUser?.id) return void toast.error("Sign in to apply");
    setSubmitting(true);
    const { error } = await supabase.from("job_applications").insert({
      listing_id: listingId,
      applicant_id: currentUser.id,
      cover_letter: coverLetter.trim() || null,
      resume_url: resumeUrl.trim() || null,
      stage: "applied",
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      if (error.code === "23505") toast.error("You've already applied");
      else toast.error(error.message);
    } else {
      onApplied();
      toast.success("Application sent!");
    }
  };

  return (
    <div className="space-y-2.5">
      <textarea
        value={coverLetter}
        onChange={(e) => setCoverLetter(e.target.value)}
        rows={3}
        placeholder="Cover letter (optional) — share why you're a great fit…"
        className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
      />
      <input
        value={resumeUrl}
        onChange={(e) => setResumeUrl(e.target.value)}
        placeholder="Resume / portfolio URL (optional)"
        className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight"
      />
      <Button onClick={apply} disabled={submitting} className="w-full">
        <Icon name="Send" size={14} />
        {submitting ? "Sending…" : "Submit application"}
      </Button>
    </div>
  );
}

