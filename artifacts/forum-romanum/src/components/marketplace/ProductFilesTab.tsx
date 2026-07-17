import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Button, Icon, cn } from "../UI";
import { toast } from "sonner";

const FILE_LABELS: Record<string, string> = {
  source_code: "Source Code",
  zip: "ZIP Archive",
  apk: "APK",
  template: "Template",
  assets: "Assets",
  documentation: "Documentation",
  other: "Other",
};

type ProductFile = {
  id: string;
  listing_id: string;
  seller_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  label: string;
  version: string;
  download_count: number;
  created_at: string;
};

type Props = {
  listingId: string;
  sellerId: string;
  currentUser?: any;
};

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

export function ProductFilesTab({ listingId, sellerId, currentUser }: Props) {
  const [files, setFiles] = useState<ProductFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("source_code");
  const [uploadVersion, setUploadVersion] = useState("1.0.0");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isSeller = currentUser?.id === sellerId;

  const fetchData = async () => {
    setLoading(true);

    // Check purchase status
    if (currentUser?.id && !isSeller) {
      const { data: order } = await supabase
        .from("listing_orders")
        .select("id")
        .eq("listing_id", listingId)
        .eq("buyer_id", currentUser.id)
        .in("status", ["completed", "active"])
        .limit(1);
      setHasPurchased((order || []).length > 0);
    }

    // Fetch files (RLS will filter for non-buyers)
    const { data } = await supabase
      .from("product_files")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });
    setFiles(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [listingId, currentUser?.id]);

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id) return;

    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) return void toast.error("File must be under 500 MB");

    setUploading(true);
    const path = `${currentUser.id}/${listingId}/${Date.now()}_${file.name}`;

    const { error: storageError } = await supabase.storage
      .from("marketplace-files")
      .upload(path, file, { upsert: false });

    if (storageError) {
      setUploading(false);
      return void toast.error(storageError.message);
    }

    const { error: dbError } = await supabase.from("product_files").insert({
      listing_id: listingId,
      seller_id: currentUser.id,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      file_type: file.type,
      label: uploadLabel,
      version: uploadVersion,
    });

    setUploading(false);
    if (dbError) {
      await supabase.storage.from("marketplace-files").remove([path]);
      toast.error(dbError.message);
    } else {
      fetchData();
      toast.success("File uploaded");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadFile = async (file: ProductFile) => {
    if (!currentUser?.id) return void toast.error("Sign in first");
    if (!isSeller && !hasPurchased) return void toast.error("Purchase required to download");

    setDownloadingId(file.id);
    const { data, error } = await supabase.storage
      .from("marketplace-files")
      .createSignedUrl(file.file_path, 300); // 5-minute expiry

    if (error || !data?.signedUrl) {
      setDownloadingId(null);
      return void toast.error("Could not generate download link");
    }

    // Track download
    await supabase.from("file_downloads").insert({
      file_id: file.id,
      user_id: currentUser.id,
      order_id: null,
    });
    await supabase
      .from("product_files")
      .update({ download_count: file.download_count + 1 })
      .eq("id", file.id);

    // Trigger download
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadingId(null);
    fetchData();
    toast.success("Download started");
  };

  const deleteFile = async (file: ProductFile) => {
    await supabase.storage.from("marketplace-files").remove([file.file_path]);
    await supabase.from("product_files").delete().eq("id", file.id);
    fetchData();
    toast.success("File removed");
  };

  if (loading) {
    return (
      <div className="mt-4 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-[#F5F5F7] animate-pulse" />
        ))}
      </div>
    );
  }

  const canDownload = isSeller || hasPurchased;

  return (
    <div className="mt-4 space-y-3">
      {/* Access gate */}
      {!isSeller && !hasPurchased && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <Icon name="Lock" size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13.5px] font-semibold text-amber-900 tracking-tight">Purchase required</p>
            <p className="text-[12.5px] text-amber-800 tracking-tight mt-0.5 leading-relaxed">
              Purchase this product to unlock secure download access for all included files.
            </p>
          </div>
        </div>
      )}

      {/* Seller upload panel */}
      {isSeller && (
        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
          <p className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">Upload a file</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-[#86868B] tracking-tight block mb-1">
                File type
              </label>
              <select
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                className="w-full text-[13px] bg-[#F5F5F7] rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-black/10 tracking-tight"
              >
                {Object.entries(FILE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-[#86868B] tracking-tight block mb-1">
                Version
              </label>
              <input
                value={uploadVersion}
                onChange={(e) => setUploadVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full text-[13px] bg-[#F5F5F7] rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-black/10 tracking-tight font-mono"
              />
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.tar,.gz,.rar,.apk,.ipa,.pdf,.doc,.docx,.png,.jpg,.svg,.ai,.sketch,.fig"
            onChange={uploadFile}
            className="hidden"
            id="file-upload-input"
          />
          <label
            htmlFor="file-upload-input"
            className={cn(
              "flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed text-[13.5px] font-medium tracking-tight cursor-pointer transition-colors",
              uploading
                ? "border-[#0A84FF]/30 text-[#0A84FF] bg-[#0A84FF]/5"
                : "border-black/[0.1] text-[#86868B] hover:border-[#0A84FF]/40 hover:text-[#0A84FF] hover:bg-[#0A84FF]/5",
            )}
          >
            <Icon name={uploading ? "Loader2" : "Upload"} size={14} className={uploading ? "animate-spin" : ""} />
            {uploading ? "Uploading…" : "Choose file (ZIP, APK, source, etc.)"}
          </label>
          <p className="text-[11px] text-[#86868B] tracking-tight">Max 500 MB per file</p>
        </div>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <p className="text-[13px] text-[#86868B] text-center py-8 tracking-tight">
          {isSeller ? "Upload your first file above." : "No files available yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-black/[0.05]"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-[#F5F5F7] flex items-center justify-center shrink-0">
                <Icon
                  name={
                    f.label === "apk"
                      ? "Smartphone"
                      : f.label === "documentation"
                        ? "FileText"
                        : "Archive"
                  }
                  size={18}
                  color="#86868B"
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[#1D1D1F] tracking-tight truncate">
                  {f.file_name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-medium text-[#86868B] tracking-tight">
                    {FILE_LABELS[f.label] || f.label}
                  </span>
                  <span className="text-[#C7C7CC]">·</span>
                  <span className="text-[11px] font-mono text-[#86868B]">v{f.version}</span>
                  <span className="text-[#C7C7CC]">·</span>
                  <span className="text-[11px] text-[#86868B]">{formatBytes(f.file_size)}</span>
                  {isSeller && (
                    <>
                      <span className="text-[#C7C7CC]">·</span>
                      <span className="text-[11px] text-[#86868B] flex items-center gap-0.5">
                        <Icon name="Download" size={9} />
                        {f.download_count}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {canDownload ? (
                  <button
                    onClick={() => downloadFile(f)}
                    disabled={downloadingId === f.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A84FF] text-white text-[12.5px] font-semibold tracking-tight tap-scale disabled:opacity-60"
                  >
                    <Icon
                      name={downloadingId === f.id ? "Loader2" : "Download"}
                      size={12}
                      className={downloadingId === f.id ? "animate-spin" : ""}
                    />
                    {downloadingId === f.id ? "…" : "Download"}
                  </button>
                ) : (
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F5F5F7] text-[#86868B] text-[12.5px] font-semibold tracking-tight">
                    <Icon name="Lock" size={11} />
                    Locked
                  </div>
                )}
                {isSeller && (
                  <button
                    onClick={() => deleteFile(f)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[#FF3B30] hover:bg-red-50"
                  >
                    <Icon name="Trash2" size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
