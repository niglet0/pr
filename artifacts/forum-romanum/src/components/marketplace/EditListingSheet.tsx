import React, { useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Button, Icon } from "../UI";
import { toast } from "sonner";
import { ImageUploader } from "./ImageUploader";

const PRODUCT_CATEGORIES = [
  "application", "website", "saas", "mobile_app", "api", "bot",
  "script", "template", "component", "library", "source_code",
  "domain", "asset", "service",
];
const PRICING_MODELS = ["sale", "rent", "subscription", "free", "open_source", "hourly", "fixed"];

type Props = {
  listing: any;
  currentUser: any;
  onClose: () => void;
  onUpdated: () => void;
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium tracking-tight text-[#1D1D1F] mb-1.5 block">
        {label} {required && <span className="text-[#FF3B30]">*</span>}
      </span>
      {children}
    </label>
  );
}

export function EditListingSheet({ listing, currentUser, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState(listing.title || "");
  const [summary, setSummary] = useState(listing.summary || "");
  const [description, setDescription] = useState(listing.description || "");
  const [coverUrl, setCoverUrl] = useState(listing.cover_url || "");
  const [galleryUrls, setGalleryUrls] = useState<string[]>(listing.gallery || []);
  const [demoUrl, setDemoUrl] = useState(listing.demo_url || "");
  const [githubUrl, setGithubUrl] = useState(listing.github_url || "");
  const [docUrl, setDocUrl] = useState(listing.documentation_url || "");
  const [category, setCategory] = useState(listing.category || "");
  const [pricingModel, setPricingModel] = useState(listing.pricing_model || "sale");
  const [price, setPrice] = useState(listing.price_cents ? String(listing.price_cents / 100) : "");
  const [techStack, setTechStack] = useState((listing.tech_stack || []).join(", "));
  const [tags, setTags] = useState((listing.tags || []).join(", "));
  const [features, setFeatures] = useState((listing.features || []).join("\n"));
  const [license, setLicense] = useState(listing.license || "MIT");
  const [installGuide, setInstallGuide] = useState(listing.installation_guide || "");
  const [requirements, setRequirements] = useState((listing.requirements || []).join("\n"));
  const [status, setStatus] = useState(listing.status || "active");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inputCls = "w-full bg-white border border-black/[0.06] px-3.5 py-3 rounded-[14px] text-[14px] text-[#1D1D1F] outline-none focus:border-black/20 focus:shadow-[0_0_0_4px_rgba(0,0,0,0.04)] transition-all placeholder:text-[#86868B]";

  const save = async () => {
    if (!title.trim()) return void toast.error("Title required");
    setSubmitting(true);
    const { error } = await supabase
      .from("marketplace_listings")
      .update({
        title: title.trim(),
        summary: summary.trim() || null,
        description: description.trim() || null,
        cover_url: coverUrl.trim() || null,
        gallery: galleryUrls.filter(Boolean),
        demo_url: demoUrl.trim() || null,
        github_url: githubUrl.trim() || null,
        documentation_url: docUrl.trim() || null,
        category: category || null,
        pricing_model: pricingModel,
        price_cents: Math.round((parseFloat(price) || 0) * 100),
        tech_stack: techStack ? techStack.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        tags: tags ? tags.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        features: features ? features.split("\n").map((s: string) => s.trim()).filter(Boolean) : [],
        license,
        installation_guide: installGuide.trim() || null,
        requirements: requirements ? requirements.split("\n").map((s: string) => s.trim()).filter(Boolean) : [],
        status,
      })
      .eq("id", listing.id);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Listing updated");
      onUpdated();
      onClose();
    }
  };

  const deleteListing = async () => {
    if (!confirm("Delete this listing permanently?")) return;
    setDeleting(true);
    const { error } = await supabase
      .from("marketplace_listings")
      .delete()
      .eq("id", listing.id);
    setDeleting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Listing deleted");
      onUpdated();
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-[150] bg-[#F5F5F7] flex flex-col"
    >
      <header className="h-12 px-3 flex items-center justify-between shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.05]">
        <button onClick={onClose} className="text-[#0A84FF] tap-scale w-10 h-10 flex items-center justify-center">
          <Icon name="X" size={22} />
        </button>
        <span className="text-[15px] font-semibold tracking-tight text-[#1D1D1F]">Edit Listing</span>
        <button
          onClick={deleteListing}
          disabled={deleting}
          className="text-[#FF3B30] text-[13px] font-medium tracking-tight pr-1"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="active">Active (visible)</option>
            <option value="draft">Draft (hidden)</option>
            <option value="archived">Archived</option>
          </select>
        </Field>

        <Field label="Title" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Notion-style SaaS starter" className={inputCls} />
        </Field>
        <Field label="Short summary">
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line pitch" className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="What it does, who it's for…" className={`${inputCls} min-h-[110px] resize-none`} />
        </Field>
        {listing.kind === "product" && (
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </Field>
        )}
        <Field label="Pricing model">
          <select value={pricingModel} onChange={(e) => setPricingModel(e.target.value)} className={inputCls}>
            {PRICING_MODELS.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
          </select>
        </Field>
        {pricingModel !== "free" && pricingModel !== "open_source" && (
          <Field label="Price (USD)">
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="99" className={inputCls} />
          </Field>
        )}
        <Field label="Cover image">
          <ImageUploader
            bucket="forum-media"
            pathPrefix={`listings/${listing.id}/cover`}
            existingUrl={coverUrl || null}
            aspect="wide"
            label="Upload cover image"
            onUploaded={(url) => setCoverUrl(url)}
            onClear={() => setCoverUrl("")}
          />
        </Field>
        <Field label="Gallery images (up to 4)">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <ImageUploader
                key={i}
                bucket="forum-media"
                pathPrefix={`listings/${listing.id}/gallery`}
                existingUrl={galleryUrls[i] || null}
                aspect="wide"
                label={`Image ${i + 1}`}
                onUploaded={(url) => {
                  setGalleryUrls((prev) => {
                    const next = [...prev];
                    next[i] = url;
                    return next;
                  });
                }}
                onClear={() => {
                  setGalleryUrls((prev) => {
                    const next = [...prev];
                    next[i] = "";
                    return next.filter(Boolean);
                  });
                }}
              />
            ))}
          </div>
        </Field>
        <Field label="Live demo URL">
          <input value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://demo.example.com" className={inputCls} />
        </Field>
        <Field label="GitHub URL">
          <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/…" className={inputCls} />
        </Field>
        <Field label="Documentation URL">
          <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://docs.example.com" className={inputCls} />
        </Field>
        <Field label="Tech stack (comma-separated)">
          <input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, TypeScript, Postgres" className={inputCls} />
        </Field>
        <Field label="Features (one per line)">
          <textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={3} placeholder={"Auth included\nStripe billing"} className={`${inputCls} min-h-[80px] resize-none`} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ai, productivity, b2b" className={inputCls} />
        </Field>
        {(listing.kind === "product" || listing.kind === "project") && (
          <>
            <Field label="Requirements (one per line)">
              <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} placeholder={"Node.js 18+\nPostgreSQL 14+"} className={`${inputCls} min-h-[80px] resize-none`} />
            </Field>
            <Field label="Installation guide (Markdown)">
              <textarea value={installGuide} onChange={(e) => setInstallGuide(e.target.value)} rows={5} placeholder={"## Quick Start\n\n```bash\nnpm install\nnpm run dev\n```"} className={`${inputCls} min-h-[110px] resize-none font-mono text-[13px]`} />
            </Field>
          </>
        )}
        <Field label="License">
          <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="MIT, Commercial, etc." className={inputCls} />
        </Field>
      </div>

      <div className="border-t border-black/[0.06] bg-white/95 backdrop-blur-xl p-4 shrink-0">
        <Button onClick={save} disabled={submitting} className="w-full">
          <Icon name="Check" size={14} />
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </motion.div>
  );
}
