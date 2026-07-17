import React, { useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Button, Icon, cn } from "../UI";
import { toast } from "sonner";

type Version = {
  id: string;
  listing_id: string;
  version: string;
  changelog: string;
  is_major: boolean;
  release_date: string;
  created_at: string;
};

type Props = {
  listingId: string;
  sellerId: string;
  currentUser?: any;
};

export function VersionHistoryTab({ listingId, sellerId, currentUser }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [newChangelog, setNewChangelog] = useState("");
  const [isMajor, setIsMajor] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isSeller = currentUser?.id === sellerId;

  const fetchVersions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("listing_versions")
      .select("*")
      .eq("listing_id", listingId)
      .order("release_date", { ascending: false });
    setVersions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchVersions();
  }, [listingId]);

  const addVersion = async () => {
    if (!newVersion.trim() || !newChangelog.trim()) {
      return void toast.error("Version number and changelog are required");
    }
    setSubmitting(true);
    const { error } = await supabase.from("listing_versions").insert({
      listing_id: listingId,
      version: newVersion.trim(),
      changelog: newChangelog.trim(),
      is_major: isMajor,
      release_date: new Date().toISOString(),
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setAdding(false);
      setNewVersion("");
      setNewChangelog("");
      setIsMajor(false);
      fetchVersions();
      toast.success("Version added");
    }
  };

  const deleteVersion = async (id: string) => {
    const { error } = await supabase.from("listing_versions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      fetchVersions();
      toast.success("Version removed");
    }
  };

  if (loading) {
    return (
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-[#F5F5F7] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Add version button for seller */}
      {isSeller && (
        <div>
          {!adding ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              className="w-full"
            >
              <Icon name="Plus" size={13} />
              Add release
            </Button>
          ) : (
            <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
              <p className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">New release</p>
              <div className="flex gap-2">
                <input
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="e.g. 2.1.0"
                  className="flex-1 text-[14px] bg-[#F5F5F7] rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-black/10 tracking-tight"
                />
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#86868B] tracking-tight shrink-0">
                  <input
                    type="checkbox"
                    checked={isMajor}
                    onChange={(e) => setIsMajor(e.target.checked)}
                    className="rounded"
                  />
                  Major
                </label>
              </div>
              <textarea
                value={newChangelog}
                onChange={(e) => setNewChangelog(e.target.value)}
                rows={4}
                placeholder={"What's changed:\n- Fixed login bug\n- Added dark mode\n- Performance improvements"}
                className="w-full text-[14px] bg-[#F5F5F7] rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none font-mono"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addVersion} disabled={submitting}>
                  {submitting ? "Adding…" : "Publish release"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Version list */}
      {versions.length === 0 ? (
        <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
          No versions published yet.
        </p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[22px] top-5 bottom-5 w-px bg-black/[0.06]" />

          <div className="space-y-4">
            {versions.map((v, idx) => (
              <div key={v.id} className="flex gap-3">
                {/* Timeline dot */}
                <div className="relative flex-shrink-0 flex flex-col items-center">
                  <div
                    className={cn(
                      "w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center z-10",
                      idx === 0
                        ? "border-[#0A84FF] bg-[#0A84FF]"
                        : v.is_major
                          ? "border-[#1D1D1F] bg-[#1D1D1F]"
                          : "border-[#C7C7CC] bg-white",
                    )}
                  >
                    {idx === 0 && (
                      <Icon name="Star" size={8} color="white" />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05]">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[15px] font-semibold tracking-tight font-mono",
                              idx === 0 ? "text-[#0A84FF]" : "text-[#1D1D1F]",
                            )}
                          >
                            v{v.version}
                          </span>
                          {v.is_major && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#1D1D1F] text-[10px] font-semibold text-white tracking-tight">
                              Major
                            </span>
                          )}
                          {idx === 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#0A84FF]/10 text-[10px] font-semibold text-[#0A84FF] tracking-tight">
                              Latest
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#86868B] tracking-tight mt-0.5">
                          {new Date(v.release_date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      {isSeller && (
                        <button
                          onClick={() => deleteVersion(v.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[#FF3B30] hover:bg-red-50"
                        >
                          <Icon name="X" size={11} />
                        </button>
                      )}
                    </div>

                    {/* Changelog parsed as list */}
                    <div className="space-y-1">
                      {v.changelog
                        .split("\n")
                        .filter((l) => l.trim())
                        .map((line, i) => {
                          const cleaned = line.replace(/^[-•*]\s*/, "").trim();
                          return (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-[#0A84FF] mt-0.5 shrink-0 text-[12px]">·</span>
                              <p className="text-[13.5px] text-[#3A3A3C] tracking-tight leading-snug">
                                {cleaned}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
