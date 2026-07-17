import React, { useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Button, Icon } from "../UI";
import { toast } from "sonner";

type Props = {
  listingId: string;
  sellerId: string;
  installationGuide?: string | null;
  requirements?: string[] | null;
  similarTech?: string[] | null;
  currentUser?: any;
  onUpdated: () => void;
};

function renderGuide(text: string): React.ReactNode[] {
  const parts = text.split("```");
  const elements: React.ReactNode[] = [];
  parts.forEach((part, idx) => {
    if (idx % 2 === 1) {
      const lines = part.split("\n");
      const lang = lines[0].trim();
      const code = lines.slice(1).join("\n").trim();
      elements.push(
        <div key={`code-${idx}`} className="rounded-2xl bg-[#1D1D1F] overflow-hidden my-2">
          {lang && (
            <div className="px-3 py-1.5 text-[10.5px] font-semibold text-[#86868B] uppercase tracking-widest border-b border-white/10">
              {lang}
            </div>
          )}
          <pre className="p-3 text-[12.5px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap">
            <code>{code}</code>
          </pre>
        </div>,
      );
    } else {
      part.split("\n").forEach((line, li) => {
        if (line.startsWith("## ")) {
          elements.push(<h2 key={`h2-${idx}-${li}`} className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight mt-4 mb-1.5">{line.slice(3)}</h2>);
        } else if (line.startsWith("# ")) {
          elements.push(<h1 key={`h1-${idx}-${li}`} className="text-[18px] font-semibold text-[#1D1D1F] tracking-tight mt-4 mb-1.5">{line.slice(2)}</h1>);
        } else if (line.startsWith("### ")) {
          elements.push(<h3 key={`h3-${idx}-${li}`} className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight mt-3 mb-1">{line.slice(4)}</h3>);
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          elements.push(
            <div key={`li-${idx}-${li}`} className="flex items-start gap-2 my-1">
              <span className="text-[#0A84FF] text-[14px] shrink-0">·</span>
              <span className="text-[13.5px] text-[#1D1D1F] tracking-tight">{line.slice(2)}</span>
            </div>,
          );
        } else {
          const numbered = line.match(/^(\d+)\.\s+(.+)/);
          if (numbered) {
            elements.push(
              <div key={`num-${idx}-${li}`} className="flex items-start gap-2 my-1">
                <span className="text-[12px] font-bold text-[#0A84FF] w-5 shrink-0 mt-0.5">{numbered[1]}.</span>
                <span className="text-[13.5px] text-[#1D1D1F] tracking-tight">{numbered[2]}</span>
              </div>,
            );
          } else if (!line.trim()) {
            elements.push(<div key={`br-${idx}-${li}`} className="h-1.5" />);
          } else if (line.includes("`")) {
            const iparts = line.split(/(`[^`]+`)/g);
            elements.push(
              <p key={`p-${idx}-${li}`} className="text-[13.5px] text-[#1D1D1F] tracking-tight leading-relaxed my-0.5">
                {iparts.map((ip, pi) =>
                  ip.startsWith("`") && ip.endsWith("`") ? (
                    <code key={pi} className="font-mono text-[12px] bg-[#F2F2F4] px-1.5 py-0.5 rounded-md text-[#E60023]">
                      {ip.slice(1, -1)}
                    </code>
                  ) : (
                    <span key={pi}>{ip}</span>
                  ),
                )}
              </p>,
            );
          } else {
            elements.push(
              <p key={`p-${idx}-${li}`} className="text-[13.5px] text-[#1D1D1F] tracking-tight leading-relaxed my-0.5">
                {line}
              </p>,
            );
          }
        }
      });
    }
  });
  return elements;
}

export function InstallGuideTab({
  listingId,
  sellerId,
  installationGuide,
  requirements,
  similarTech,
  currentUser,
  onUpdated,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [guide, setGuide] = useState(installationGuide || "");
  const [reqs, setReqs] = useState((requirements || []).join("\n"));
  const [similar, setSimilar] = useState((similarTech || []).join(", "));
  const [submitting, setSubmitting] = useState(false);

  const isSeller = currentUser?.id === sellerId;

  const save = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from("marketplace_listings")
      .update({
        installation_guide: guide.trim() || null,
        requirements: reqs
          ? reqs.split("\n").map((r) => r.trim()).filter(Boolean)
          : [],
        similar_tech: similar
          ? similar.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      })
      .eq("id", listingId);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setEditing(false);
      onUpdated();
      toast.success("Installation guide updated");
    }
  };

  if (!installationGuide && !isSeller) {
    return (
      <div className="mt-6 text-center py-10">
        <div className="w-12 h-12 rounded-2xl bg-[#F2F2F4] flex items-center justify-center mx-auto mb-3">
          <Icon name="BookOpen" size={20} color="#86868B" />
        </div>
        <p className="text-[13.5px] text-[#86868B] tracking-tight">No installation guide yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Seller edit toggle */}
      {isSeller && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase">
            Installation Guide
          </p>
          <button
            onClick={() => (editing ? save() : setEditing(true))}
            disabled={submitting}
            className="text-[13px] font-medium text-[#0A84FF] tracking-tight"
          >
            {editing ? (submitting ? "Saving…" : "Save") : "Edit"}
          </button>
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-[11.5px] font-semibold text-[#86868B] tracking-tight block mb-1.5">
              Guide (Markdown supported)
            </label>
            <textarea
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              rows={10}
              placeholder={"## Quick Start\n\n```bash\nnpm install my-package\n```\n\n1. Configure env vars\n2. Run migrations\n3. Start the dev server"}
              className="w-full text-[13.5px] font-mono bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
            />
          </div>
          <div>
            <label className="text-[11.5px] font-semibold text-[#86868B] tracking-tight block mb-1.5">
              Requirements (one per line)
            </label>
            <textarea
              value={reqs}
              onChange={(e) => setReqs(e.target.value)}
              rows={4}
              placeholder={"Node.js 18+\nPostgreSQL 14+\nSupabase account"}
              className="w-full text-[13.5px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
            />
          </div>
          <div>
            <label className="text-[11.5px] font-semibold text-[#86868B] tracking-tight block mb-1.5">
              Similar technologies (comma-separated)
            </label>
            <input
              value={similar}
              onChange={(e) => setSimilar(e.target.value)}
              placeholder="Shadcn UI, Tailwind, Prisma"
              className="w-full text-[13.5px] bg-[#F5F5F7] rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={submitting}>
              {submitting ? "Saving…" : "Save guide"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Requirements */}
          {requirements && requirements.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05]">
              <h4 className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-3">
                Requirements
              </h4>
              <ul className="space-y-2">
                {requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <Icon name="CheckCircle2" size={14} color="#34C759" className="mt-0.5 shrink-0" />
                    <span className="text-[14px] text-[#1D1D1F] tracking-tight">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Guide */}
          {installationGuide && (
            <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05]">
              <h4 className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-3">
                Setup Instructions
              </h4>
              <div className="space-y-1.5">
                {renderGuide(installationGuide)}
              </div>
            </div>
          )}

          {/* Similar tech */}
          {similarTech && similarTech.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05]">
              <h4 className="text-[12px] font-semibold text-[#86868B] tracking-tight uppercase mb-2.5">
                Similar technologies
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {similarTech.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-full bg-[#F5F5F7] text-[12.5px] font-medium text-[#1D1D1F] tracking-tight border border-black/[0.06]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isSeller && !installationGuide && (
            <Button variant="outline" onClick={() => setEditing(true)} className="w-full">
              <Icon name="Plus" size={13} />
              Add installation guide
            </Button>
          )}
        </>
      )}
    </div>
  );
}
