import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon, Skeleton, cn } from "../UI";
import { toast } from "sonner";
import { ImageUploader } from "./ImageUploader";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Company = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  website?: string | null;
  founded_year?: number | null;
  team_size?: string | null;
  industry?: string | null;
  location?: string | null;
  stage?: string | null;
  is_verified: boolean;
  is_hiring: boolean;
  followers_count: number;
  tagline?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  pitch_deck_url?: string | null;
  tags?: string[] | null;
  total_sales?: number;
  total_revenue_cents?: number;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: string;
  title?: string | null;
  joined_at: string;
  user?: { display_name?: string; handle?: string; avatar_url?: string } | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  kind: string;
  image_url?: string | null;
  created_at: string;
};

type Props = {
  ownerId: string;
  onClose: () => void;
  currentUser?: any;
};

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const STAGES = ["idea", "pre-seed", "seed", "series-a", "growth", "established"];
const SIZES  = ["1-5", "6-20", "21-50", "51-200", "201-500", "500+"];

const STAGE_META: Record<string, { label: string; color: string }> = {
  idea:        { label: "Idea",        color: "#8B5CF6" },
  "pre-seed":  { label: "Pre-seed",    color: "#F59E0B" },
  seed:        { label: "Seed",        color: "#10B981" },
  "series-a":  { label: "Series A",    color: "#0A84FF" },
  growth:      { label: "Growth",      color: "#34C759" },
  established: { label: "Established", color: "#C5A059" },
};

const KIND_META: Record<string, { label: string; icon: string; color: string }> = {
  update:    { label: "Update",    icon: "Megaphone", color: "#0A84FF" },
  milestone: { label: "Milestone", icon: "Award",    color: "#C5A059" },
  hiring:    { label: "Hiring",    icon: "UserPlus", color: "#10B981" },
  product:   { label: "Product",   icon: "Package",  color: "#8B5CF6" },
};

type Tab = "about" | "products" | "jobs" | "team" | "updates";

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function CompanyProfileSheet({ ownerId, onClose, currentUser }: Props) {
  const [company, setCompany]         = useState<Company | null>(null);
  const [listings, setListings]       = useState<any[]>([]);
  const [members, setMembers]         = useState<Member[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editing, setEditing]         = useState(false);
  const [tab, setTab]                 = useState<Tab>("about");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  const isOwner = currentUser?.id === ownerId;

  /* form state */
  const [form, setForm] = useState({
    name: "", slug: "", bio: "", tagline: "", website: "",
    founded_year: "", team_size: "", industry: "", location: "",
    stage: "startup", is_hiring: false,
    logo_url: "", banner_url: "",
    twitter_url: "", linkedin_url: "", github_url: "", pitch_deck_url: "",
    tags: "",
  });

  /* new announcement */
  const [newAnnTitle, setNewAnnTitle] = useState("");
  const [newAnnBody,  setNewAnnBody]  = useState("");
  const [newAnnKind,  setNewAnnKind]  = useState("update");
  const [postingAnn,  setPostingAnn]  = useState(false);

  /* team invite */
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviteTitle,  setInviteTitle]  = useState("");
  const [inviteRole,   setInviteRole]   = useState("member");
  const [inviting,     setInviting]     = useState(false);
  const [showInvite,   setShowInvite]   = useState(false);

  /* ---------------------------------------------------------------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [cRes, lRes] = await Promise.all([
      supabase.from("company_profiles").select("*").eq("owner_id", ownerId).single(),
      supabase
        .from("marketplace_listings")
        .select("*")
        .eq("seller_id", ownerId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const c: Company | null = cRes.data;
    setCompany(c);
    setListings(lRes.data || []);

    if (c) {
      setForm({
        name: c.name || "", slug: c.slug || "", bio: c.bio || "",
        tagline: c.tagline || "", website: c.website || "",
        founded_year: c.founded_year?.toString() || "",
        team_size: c.team_size || "", industry: c.industry || "",
        location: c.location || "", stage: c.stage || "startup",
        is_hiring: c.is_hiring || false,
        logo_url: c.logo_url || "", banner_url: c.banner_url || "",
        twitter_url: c.twitter_url || "", linkedin_url: c.linkedin_url || "",
        github_url: c.github_url || "", pitch_deck_url: c.pitch_deck_url || "",
        tags: (c.tags || []).join(", "),
      });

      /* followers / members / announcements in parallel */
      const [mRes, aRes] = await Promise.all([
        supabase
          .from("company_members")
          .select("*, user:user_id(display_name, handle, avatar_url)")
          .eq("company_id", c.id)
          .order("joined_at"),
        supabase
          .from("company_announcements")
          .select("*")
          .eq("company_id", c.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setMembers((mRes.data || []) as Member[]);
      setAnnouncements(aRes.data || []);

      /* check if current user follows */
      if (currentUser?.id) {
        const { data: fData } = await supabase
          .from("company_follows")
          .select("user_id")
          .eq("company_id", c.id)
          .eq("user_id", currentUser.id)
          .single();
        setIsFollowing(!!fData);
      }
    } else if (currentUser) {
      setForm((f) => ({
        ...f,
        name: currentUser.display_name || currentUser.handle || "",
        slug: (currentUser.handle || currentUser.username || "")
          .toLowerCase().replace(/\s+/g, "-"),
      }));
    }
    setLoading(false);
  }, [ownerId, currentUser?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------------------------------------------------------------- */
  const saveCompany = async () => {
    if (!form.name.trim() || !form.slug.trim())
      return void toast.error("Name and slug are required");

    setSubmitting(true);
    const payload: Record<string, any> = {
      owner_id:      ownerId,
      name:          form.name.trim(),
      slug:          form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
      bio:           form.bio.trim() || null,
      tagline:       form.tagline.trim() || null,
      website:       form.website.trim() || null,
      founded_year:  form.founded_year ? parseInt(form.founded_year) : null,
      team_size:     form.team_size || null,
      industry:      form.industry.trim() || null,
      location:      form.location.trim() || null,
      stage:         form.stage,
      is_hiring:     form.is_hiring,
      logo_url:      form.logo_url.trim() || null,
      banner_url:    form.banner_url.trim() || null,
      twitter_url:   form.twitter_url.trim() || null,
      linkedin_url:  form.linkedin_url.trim() || null,
      github_url:    form.github_url.trim() || null,
      pitch_deck_url: form.pitch_deck_url.trim() || null,
      tags:          form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      updated_at:    new Date().toISOString(),
    };

    const { error } = company
      ? await supabase.from("company_profiles").update(payload).eq("id", company.id)
      : await supabase.from("company_profiles").insert(payload);

    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setEditing(false);
      fetchData();
      toast.success(company ? "Company updated" : "Company created!");
    }
  };

  /* ---------------------------------------------------------------- */
  const toggleFollow = async () => {
    if (!currentUser?.id || !company) return void toast.error("Sign in to follow");
    if (isOwner) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from("company_follows")
        .delete().eq("company_id", company.id).eq("user_id", currentUser.id);
      setIsFollowing(false);
      setCompany((c) => c ? { ...c, followers_count: Math.max(0, c.followers_count - 1) } : c);
    } else {
      await supabase.from("company_follows")
        .insert({ company_id: company.id, user_id: currentUser.id });
      setIsFollowing(true);
      setCompany((c) => c ? { ...c, followers_count: c.followers_count + 1 } : c);
    }
    setFollowLoading(false);
  };

  /* ---------------------------------------------------------------- */
  const postAnnouncement = async () => {
    if (!newAnnTitle.trim() || !newAnnBody.trim() || !company)
      return void toast.error("Title and body required");
    setPostingAnn(true);
    const { error } = await supabase.from("company_announcements").insert({
      company_id: company.id,
      author_id:  currentUser.id,
      title:      newAnnTitle.trim(),
      body:       newAnnBody.trim(),
      kind:       newAnnKind,
    });
    setPostingAnn(false);
    if (error) toast.error(error.message);
    else {
      setNewAnnTitle("");
      setNewAnnBody("");
      setNewAnnKind("update");
      fetchData();
      toast.success("Posted!");
    }
  };

  /* ---------------------------------------------------------------- */
  const inviteMember = async () => {
    if (!inviteHandle.trim() || !company) return;
    setInviting(true);
    const handle = inviteHandle.trim().replace(/^@/, "");
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .or(`handle.eq.${handle},username.eq.${handle}`)
      .single();

    if (!userRow) {
      toast.error("User not found");
      setInviting(false);
      return;
    }
    const { error } = await supabase.from("company_members").insert({
      company_id: company.id,
      user_id:    userRow.id,
      role:       inviteRole,
      title:      inviteTitle.trim() || null,
    });
    setInviting(false);
    if (error) {
      if (error.code === "23505") toast.error("Already a member");
      else toast.error(error.message);
    } else {
      setInviteHandle("");
      setInviteTitle("");
      setShowInvite(false);
      fetchData();
      toast.success("Member added!");
    }
  };

  /* ---------------------------------------------------------------- */
  const removeMember = async (memberId: string) => {
    if (!company) return;
    const { error } = await supabase.from("company_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else { fetchData(); toast.success("Member removed"); }
  };

  /* ---------------------------------------------------------------- */
  const deleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from("company_announcements").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { fetchData(); toast.success("Deleted"); }
  };

  /* ---------------------------------------------------------------- */
  const jobListings     = listings.filter((l) => l.kind === "job");
  const productListings = listings.filter((l) => l.kind !== "job");
  const stageMeta       = company?.stage ? STAGE_META[company.stage] : null;

  /* ---------------------------------------------------------------- */
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 200 }}
      className="absolute inset-0 z-[130] bg-[#F5F5F7] flex flex-col"
    >
      {/* Header */}
      <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
        <button
          onClick={onClose}
          className="text-[#0A84FF] tap-scale flex items-center text-[15px] tracking-tight"
        >
          <Icon name="ChevronLeft" size={22} />
          <span className="-ml-1">Back</span>
        </button>
        <span className="text-[13px] font-semibold tracking-tight text-[#1D1D1F] truncate max-w-[180px]">
          {company?.name || "Company"}
        </span>
        {isOwner && (
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-[#0A84FF] text-[13.5px] font-medium tracking-tight"
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
        {!isOwner && <div className="w-10" />}
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            <Skeleton height={120} rounded={16} />
            <Skeleton height={80} rounded={14} />
            <Skeleton height={80} rounded={14} />
          </div>
        ) : (
          <>
            {/* -------- No company yet (owner) -------- */}
            {!company && isOwner && !editing && (
              <div className="p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F2F2F4] mx-auto flex items-center justify-center mb-4">
                  <Icon name="Building2" size={26} color="#1D1D1F" />
                </div>
                <h2 className="text-[18px] font-semibold tracking-tight text-[#1D1D1F]">
                  Create your company page
                </h2>
                <p className="text-[13.5px] text-[#86868B] mt-1.5 mb-5 tracking-tight leading-relaxed max-w-xs mx-auto">
                  Showcase your company, products, and job openings in one place.
                </p>
                <Button onClick={() => setEditing(true)}>
                  <Icon name="Plus" size={14} />
                  Create company page
                </Button>
              </div>
            )}

            {/* -------- No company (visitor) -------- */}
            {!company && !isOwner && (
              <div className="p-6 text-center">
                <Icon name="Building2" size={40} color="#86868B" />
                <p className="text-[14px] text-[#86868B] mt-3 tracking-tight">
                  No company page yet.
                </p>
              </div>
            )}

            {/* -------- Edit form -------- */}
            <AnimatePresence>
              {editing && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="p-4 space-y-3 pb-24"
                >
                  {/* Banner upload */}
                  <div>
                    <p className="text-[12px] font-medium text-[#1D1D1F] tracking-tight mb-1.5">
                      Banner image
                    </p>
                    <ImageUploader
                      bucket="forum-media"
                      pathPrefix={`companies/${ownerId}/banner`}
                      existingUrl={form.banner_url || null}
                      aspect="banner"
                      label="Upload banner"
                      onUploaded={(url) => setForm((f) => ({ ...f, banner_url: url }))}
                      onClear={() => setForm((f) => ({ ...f, banner_url: "" }))}
                    />
                  </div>

                  {/* Logo upload */}
                  <div>
                    <p className="text-[12px] font-medium text-[#1D1D1F] tracking-tight mb-1.5">
                      Logo
                    </p>
                    <ImageUploader
                      bucket="forum-media"
                      pathPrefix={`companies/${ownerId}/logo`}
                      existingUrl={form.logo_url || null}
                      aspect="square"
                      label="Upload logo"
                      onUploaded={(url) => setForm((f) => ({ ...f, logo_url: url }))}
                      onClear={() => setForm((f) => ({ ...f, logo_url: "" }))}
                      className="max-w-[120px]"
                    />
                  </div>

                  {/* Text fields */}
                  {[
                    { label: "Company name *", key: "name", placeholder: "Acme Corp" },
                    { label: "Slug (URL-friendly) *", key: "slug", placeholder: "acme-corp" },
                    { label: "Tagline", key: "tagline", placeholder: "One line that says it all" },
                    { label: "Industry", key: "industry", placeholder: "SaaS, Fintech, Dev Tools…" },
                    { label: "Location", key: "location", placeholder: "San Francisco, CA" },
                    { label: "Website", key: "website", placeholder: "https://acme.com" },
                    { label: "Founded year", key: "founded_year", placeholder: "2021" },
                    { label: "Twitter / X URL", key: "twitter_url", placeholder: "https://x.com/acmecorp" },
                    { label: "LinkedIn URL", key: "linkedin_url", placeholder: "https://linkedin.com/company/acme" },
                    { label: "GitHub URL", key: "github_url", placeholder: "https://github.com/acmecorp" },
                    { label: "Pitch deck URL", key: "pitch_deck_url", placeholder: "https://…" },
                    { label: "Tags (comma separated)", key: "tags", placeholder: "TypeScript, AI, B2B" },
                  ].map((f) => (
                    <label key={f.key} className="block">
                      <span className="text-[12px] font-medium text-[#1D1D1F] tracking-tight block mb-1">
                        {f.label}
                      </span>
                      <input
                        value={(form as any)[f.key]}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full text-[14px] bg-white border border-black/[0.08] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight"
                      />
                    </label>
                  ))}

                  <label className="block">
                    <span className="text-[12px] font-medium text-[#1D1D1F] tracking-tight block mb-1">
                      About
                    </span>
                    <textarea
                      value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      rows={4}
                      placeholder="What your company does, who you serve…"
                      className="w-full text-[14px] bg-white border border-black/[0.08] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[12px] font-medium text-[#1D1D1F] tracking-tight block mb-1">
                        Stage
                      </span>
                      <select
                        value={form.stage}
                        onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
                        className="w-full text-[13px] bg-white border border-black/[0.08] rounded-xl px-3 py-2.5 outline-none tracking-tight"
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[12px] font-medium text-[#1D1D1F] tracking-tight block mb-1">
                        Team size
                      </span>
                      <select
                        value={form.team_size}
                        onChange={(e) => setForm((f) => ({ ...f, team_size: e.target.value }))}
                        className="w-full text-[13px] bg-white border border-black/[0.08] rounded-xl px-3 py-2.5 outline-none tracking-tight"
                      >
                        <option value="">—</option>
                        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="flex items-center gap-2.5 bg-white rounded-xl px-3 py-3 border border-black/[0.06]">
                    <input
                      type="checkbox"
                      checked={form.is_hiring}
                      onChange={(e) => setForm((f) => ({ ...f, is_hiring: e.target.checked }))}
                      className="rounded accent-[#10B981]"
                    />
                    <div>
                      <p className="text-[13.5px] font-medium text-[#1D1D1F] tracking-tight">
                        We're hiring
                      </p>
                      <p className="text-[11.5px] text-[#86868B] tracking-tight">
                        Show a hiring badge on your profile
                      </p>
                    </div>
                  </label>

                  <Button onClick={saveCompany} disabled={submitting} className="w-full">
                    {submitting ? "Saving…" : company ? "Save changes" : "Create company"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* -------- Company view -------- */}
            {company && !editing && (
              <>
                {/* Banner */}
                <div className="h-32 bg-gradient-to-br from-[#1D1D1F] to-[#48484A] relative shrink-0">
                  {company.banner_url && (
                    <img
                      src={company.banner_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                </div>

                {/* Identity */}
                <div className="px-5 -mt-8 pb-3">
                  <div className="flex items-end justify-between mb-3">
                    <div className="w-16 h-16 rounded-2xl bg-white border-2 border-white shadow flex items-center justify-center overflow-hidden">
                      {company.logo_url ? (
                        <img
                          src={company.logo_url}
                          alt={company.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Icon name="Building2" size={24} color="#86868B" />
                      )}
                    </div>

                    {/* Follow / action button */}
                    {!isOwner && currentUser && (
                      <Button
                        variant={isFollowing ? "outline" : undefined}
                        size="sm"
                        onClick={toggleFollow}
                        disabled={followLoading}
                        className="mb-1"
                      >
                        {isFollowing ? (
                          <><Icon name="UserCheck" size={13} /> Following</>
                        ) : (
                          <><Icon name="UserPlus" size={13} /> Follow</>
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-[#1D1D1F]">
                      {company.name}
                    </h1>
                    {company.is_verified && (
                      <Icon name="BadgeCheck" size={18} color="#0A84FF" />
                    )}
                    {company.is_hiring && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[10.5px] font-bold text-emerald-700">
                        <Icon name="Users" size={9} color="#16a34a" />
                        Hiring
                      </span>
                    )}
                  </div>

                  {company.tagline && (
                    <p className="text-[13.5px] text-[#86868B] tracking-tight mt-0.5">
                      {company.tagline}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {stageMeta && (
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full tracking-tight"
                        style={{ background: `${stageMeta.color}18`, color: stageMeta.color }}
                      >
                        {stageMeta.label}
                      </span>
                    )}
                    {company.industry && (
                      <span className="text-[12px] text-[#86868B] font-medium tracking-tight">
                        {company.industry}
                      </span>
                    )}
                    {company.location && (
                      <span className="flex items-center gap-0.5 text-[12px] text-[#86868B] tracking-tight">
                        <Icon name="MapPin" size={10} />
                        {company.location}
                      </span>
                    )}
                  </div>

                  {/* Social links */}
                  <div className="flex gap-3 mt-2">
                    {company.website && (
                      <a href={company.website} target="_blank" rel="noreferrer"
                        className="text-[#86868B] hover:text-[#0A84FF] transition-colors">
                        <Icon name="Globe" size={16} />
                      </a>
                    )}
                    {company.twitter_url && (
                      <a href={company.twitter_url} target="_blank" rel="noreferrer"
                        className="text-[#86868B] hover:text-[#1D9BF0] transition-colors">
                        <Icon name={"Twitter" as any} size={16} />
                      </a>
                    )}
                    {company.linkedin_url && (
                      <a href={company.linkedin_url} target="_blank" rel="noreferrer"
                        className="text-[#86868B] hover:text-[#0A66C2] transition-colors">
                        <Icon name={"Linkedin" as any} size={16} />
                      </a>
                    )}
                    {company.github_url && (
                      <a href={company.github_url} target="_blank" rel="noreferrer"
                        className="text-[#86868B] hover:text-[#1D1D1F] transition-colors">
                        <Icon name={"Github" as any} size={16} />
                      </a>
                    )}
                    {company.pitch_deck_url && (
                      <a href={company.pitch_deck_url} target="_blank" rel="noreferrer"
                        className="text-[#86868B] hover:text-[#8B5CF6] transition-colors"
                        title="Pitch deck">
                        <Icon name="Presentation" size={16} />
                      </a>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-2 mt-3 bg-white rounded-2xl border border-black/[0.05] p-3">
                    {[
                      { v: company.followers_count || 0, l: "Followers" },
                      { v: productListings.length,       l: "Products" },
                      { v: jobListings.length,           l: "Jobs" },
                      { v: members.length + 1,           l: "Team" },
                    ].map(({ v, l }) => (
                      <div key={l} className="text-center">
                        <div className="text-[16px] font-bold tracking-tight text-[#1D1D1F]">
                          {v}
                        </div>
                        <div className="text-[10px] font-medium text-[#86868B] tracking-tight">
                          {l}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tags */}
                  {company.tags && company.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {company.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F5F7] text-[#1D1D1F] tracking-tight"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex border-b border-black/[0.06] px-3 overflow-x-auto no-scrollbar">
                  {(["about", "products", "jobs", "team", "updates"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "relative shrink-0 px-3 py-2.5 text-[13px] font-medium tracking-tight capitalize",
                        tab === t ? "text-[#1D1D1F] font-semibold" : "text-[#86868B]",
                      )}
                    >
                      {t}
                      {t === "jobs" && jobListings.length > 0 && (
                        <span className="ml-1 text-[10px] font-bold text-[#0A84FF]">
                          {jobListings.length}
                        </span>
                      )}
                      {t === "updates" && announcements.length > 0 && (
                        <span className="ml-1 text-[10px] font-bold text-[#8B5CF6]">
                          {announcements.length}
                        </span>
                      )}
                      {tab === t && (
                        <span className="absolute left-1 right-1 -bottom-px h-[2px] bg-[#1D1D1F] rounded-full" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="px-4 pb-28 pt-4 space-y-3">

                  {/* ---- ABOUT ---- */}
                  {tab === "about" && (
                    <>
                      {company.bio && (
                        <div className="p-4 rounded-2xl bg-white border border-black/[0.05]">
                          <p className="text-[14px] text-[#1D1D1F] leading-relaxed tracking-tight">
                            {company.bio}
                          </p>
                        </div>
                      )}
                      <div className="p-4 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
                        {[
                          { label: "Founded",  value: company.founded_year,  icon: "Calendar" },
                          { label: "Team",     value: company.team_size ? `${company.team_size} people` : null, icon: "Users" },
                          { label: "Location", value: company.location,      icon: "MapPin" },
                          { label: "Website",  value: company.website,       icon: "Globe", link: true },
                        ].filter((r) => r.value).map((r) => (
                          <div key={r.label} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-[#F5F5F7] flex items-center justify-center shrink-0">
                              <Icon name={r.icon as any} size={13} color="#86868B" />
                            </div>
                            {r.link ? (
                              <a
                                href={r.value as string}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[13.5px] font-medium text-[#0A84FF] tracking-tight truncate"
                              >
                                {(r.value as string).replace(/^https?:\/\//, "")}
                              </a>
                            ) : (
                              <span className="text-[13.5px] font-medium text-[#1D1D1F] tracking-tight">
                                {r.value}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* ---- PRODUCTS ---- */}
                  {tab === "products" && (
                    <div className="space-y-2.5">
                      {productListings.length === 0 ? (
                        <div className="py-12 text-center">
                          <Icon name="Package" size={32} color="#C7C7CC" />
                          <p className="text-[13px] text-[#86868B] text-center mt-2 tracking-tight">
                            No products yet.
                          </p>
                        </div>
                      ) : (
                        productListings.map((l: any) => (
                          <div
                            key={l.id}
                            className="flex gap-3 p-3 rounded-2xl bg-white border border-black/[0.05]"
                          >
                            <div className="w-[52px] h-[52px] rounded-xl bg-[#F5F5F7] overflow-hidden shrink-0 flex items-center justify-center">
                              {l.cover_url ? (
                                <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
                              ) : (
                                <Icon name="Package" size={18} color="#86868B" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13.5px] font-semibold text-[#1D1D1F] tracking-tight truncate">
                                {l.title}
                              </p>
                              <p className="text-[12px] text-[#86868B] tracking-tight mt-0.5 line-clamp-1">
                                {l.summary}
                              </p>
                              {l.price_cents > 0 ? (
                                <p className="text-[12px] font-bold text-[#1D1D1F] mt-1 tracking-tight">
                                  ${(l.price_cents / 100).toFixed(2)}
                                </p>
                              ) : (
                                <p className="text-[11px] font-bold text-emerald-600 mt-1 tracking-tight uppercase">
                                  Free
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ---- JOBS ---- */}
                  {tab === "jobs" && (
                    <div className="space-y-2.5">
                      {jobListings.length === 0 ? (
                        <div className="py-12 text-center">
                          <Icon name="Briefcase" size={32} color="#C7C7CC" />
                          <p className="text-[13px] text-[#86868B] text-center mt-2 tracking-tight">
                            No open positions.
                          </p>
                        </div>
                      ) : (
                        jobListings.map((l: any) => (
                          <div
                            key={l.id}
                            className="p-4 rounded-2xl bg-white border border-black/[0.05]"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center shrink-0">
                                <Icon name="Briefcase" size={16} color="#8B5CF6" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-[#1D1D1F] tracking-tight">
                                  {l.title}
                                </p>
                                <p className="text-[12px] text-[#86868B] tracking-tight mt-0.5">
                                  {l.category?.replace(/_/g, " ")}
                                  {l.location && ` · ${l.location}`}
                                </p>
                                {l.pricing_model !== "free" && l.price_cents > 0 && (
                                  <p className="text-[12px] font-semibold text-[#1D1D1F] mt-1 tracking-tight">
                                    ${(l.price_cents / 100).toLocaleString()}/mo
                                  </p>
                                )}
                              </div>
                            </div>
                            {l.summary && (
                              <p className="mt-2 text-[12.5px] text-[#6E6E73] tracking-tight line-clamp-2">
                                {l.summary}
                              </p>
                            )}
                            {!isOwner && (
                              <div className="mt-3">
                                <button className="w-full py-2 rounded-xl bg-[#8B5CF6]/10 text-[#8B5CF6] text-[13px] font-semibold tracking-tight hover:bg-[#8B5CF6]/20 transition-colors">
                                  View & Apply
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ---- TEAM ---- */}
                  {tab === "team" && (
                    <div className="space-y-2.5">
                      {/* owner */}
                      <TeamCard
                        avatarUrl={undefined}
                        seed={ownerId}
                        name="Owner"
                        handle=""
                        role="owner"
                        title="Founder"
                        badge="👑"
                      />

                      {members.map((m) => (
                        <div key={m.id} className="relative">
                          <TeamCard
                            avatarUrl={m.user?.avatar_url}
                            seed={m.user_id}
                            name={m.user?.display_name || m.user?.handle || "Member"}
                            handle={m.user?.handle || ""}
                            role={m.role}
                            title={m.title}
                          />
                          {isOwner && (
                            <button
                              onClick={() => removeMember(m.id)}
                              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
                            >
                              <Icon name="X" size={12} />
                            </button>
                          )}
                        </div>
                      ))}

                      {members.length === 0 && !isOwner && (
                        <p className="text-[13px] text-[#86868B] text-center py-6 tracking-tight">
                          No other team members yet.
                        </p>
                      )}

                      {/* Invite section (owner only) */}
                      {isOwner && (
                        <div className="pt-2">
                          {!showInvite ? (
                            <button
                              onClick={() => setShowInvite(true)}
                              className="w-full py-2.5 rounded-2xl border-2 border-dashed border-black/10 text-[13px] font-medium text-[#86868B] flex items-center justify-center gap-2 hover:border-black/20 transition-colors"
                            >
                              <Icon name="UserPlus" size={14} />
                              Add team member
                            </button>
                          ) : (
                            <div className="p-4 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
                              <p className="text-[12px] font-semibold text-[#86868B] uppercase tracking-tight">
                                Add member
                              </p>
                              <input
                                value={inviteHandle}
                                onChange={(e) => setInviteHandle(e.target.value)}
                                placeholder="@username or handle"
                                className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none tracking-tight"
                              />
                              <input
                                value={inviteTitle}
                                onChange={(e) => setInviteTitle(e.target.value)}
                                placeholder="Title (e.g. Lead Engineer)"
                                className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none tracking-tight"
                              />
                              <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                className="w-full text-[13px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none tracking-tight"
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={inviteMember}
                                  disabled={inviting || !inviteHandle.trim()}
                                  className="flex-1"
                                >
                                  {inviting ? "Adding…" : "Add"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowInvite(false)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---- UPDATES ---- */}
                  {tab === "updates" && (
                    <div className="space-y-3">
                      {/* Post form (owner only) */}
                      {isOwner && (
                        <div className="p-4 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
                          <p className="text-[12px] font-semibold text-[#86868B] uppercase tracking-tight">
                            Post update
                          </p>
                          <div className="flex gap-1.5 flex-wrap">
                            {Object.entries(KIND_META).map(([k, m]) => (
                              <button
                                key={k}
                                onClick={() => setNewAnnKind(k)}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-colors",
                                  newAnnKind === k
                                    ? "bg-[#1D1D1F] text-white"
                                    : "bg-[#F5F5F7] text-[#86868B]",
                                )}
                              >
                                <Icon name={m.icon as any} size={10} />
                                {m.label}
                              </button>
                            ))}
                          </div>
                          <input
                            value={newAnnTitle}
                            onChange={(e) => setNewAnnTitle(e.target.value)}
                            placeholder="Title"
                            className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none tracking-tight"
                          />
                          <textarea
                            value={newAnnBody}
                            onChange={(e) => setNewAnnBody(e.target.value)}
                            rows={3}
                            placeholder="What's new at your company?"
                            className="w-full text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none tracking-tight resize-none"
                          />
                          <Button
                            onClick={postAnnouncement}
                            disabled={postingAnn || !newAnnTitle.trim() || !newAnnBody.trim()}
                            className="w-full"
                          >
                            <Icon name="Send" size={13} />
                            {postingAnn ? "Posting…" : "Post update"}
                          </Button>
                        </div>
                      )}

                      {announcements.length === 0 ? (
                        <div className="py-12 text-center">
                          <Icon name="Megaphone" size={32} color="#C7C7CC" />
                          <p className="text-[13px] text-[#86868B] mt-2 tracking-tight">
                            No updates yet.
                          </p>
                        </div>
                      ) : (
                        announcements.map((ann) => {
                          const km = KIND_META[ann.kind] || KIND_META.update;
                          return (
                            <div
                              key={ann.id}
                              className="p-4 rounded-2xl bg-white border border-black/[0.05]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <span
                                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                                    style={{ background: `${km.color}18` }}
                                  >
                                    <Icon name={km.icon as any} size={12} color={km.color} />
                                  </span>
                                  <span
                                    className="text-[10.5px] font-bold uppercase tracking-widest"
                                    style={{ color: km.color }}
                                  >
                                    {km.label}
                                  </span>
                                  <span className="text-[10.5px] text-[#86868B] tracking-tight">
                                    {new Date(ann.created_at).toLocaleDateString("en-US", {
                                      month: "short", day: "numeric",
                                    })}
                                  </span>
                                </div>
                                {isOwner && (
                                  <button
                                    onClick={() => deleteAnnouncement(ann.id)}
                                    className="text-[#C7C7CC] hover:text-red-400 transition-colors shrink-0"
                                  >
                                    <Icon name="Trash2" size={13} />
                                  </button>
                                )}
                              </div>
                              <p className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight mb-1">
                                {ann.title}
                              </p>
                              <p className="text-[13.5px] text-[#6E6E73] leading-relaxed tracking-tight">
                                {ann.body}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                </div>
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Team card helper                                                     */
/* ------------------------------------------------------------------ */

function TeamCard({
  avatarUrl, seed, name, handle, role, title, badge,
}: {
  avatarUrl?: string;
  seed: string;
  name: string;
  handle: string;
  role: string;
  title?: string | null;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-black/[0.05]">
      <Avatar src={avatarUrl} seed={seed} size={44} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-semibold text-[#1D1D1F] tracking-tight truncate">
            {name}
          </p>
          {badge && <span>{badge}</span>}
        </div>
        {handle && (
          <p className="text-[12px] text-[#86868B] tracking-tight">@{handle}</p>
        )}
        {title && (
          <p className="text-[11.5px] text-[#86868B] tracking-tight mt-0.5">{title}</p>
        )}
      </div>
      <span
        className={cn(
          "text-[10.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
          role === "owner" ? "bg-[#C5A059]/15 text-[#C5A059]"
          : role === "admin" ? "bg-[#0A84FF]/10 text-[#0A84FF]"
          : "bg-[#F5F5F7] text-[#86868B]",
        )}
      >
        {role}
      </span>
    </div>
  );
}
