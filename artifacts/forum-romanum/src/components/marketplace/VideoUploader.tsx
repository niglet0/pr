import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Icon, cn } from "../UI";
import { toast } from "sonner";

type UploaderProps = {
  currentUserId: string;
  listingId?: string;
  existingUrl?: string | null;
  existingStoragePath?: string | null;
  onUploaded: (publicUrl: string, storagePath: string) => void;
};

const MAX_DURATION_SEC = 180;
const MAX_SIZE_BYTES = 200 * 1024 * 1024;

export function VideoUploader({
  currentUserId,
  listingId,
  existingUrl,
  existingStoragePath,
  onUploaded,
}: UploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl || null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE_BYTES) { toast.error("Video must be under 200 MB"); return; }
    setPreview(URL.createObjectURL(file));
    setPendingFile(file);
    setProgress(0);
  };

  const handleMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    setDuration(dur);
    if (dur > MAX_DURATION_SEC) {
      toast.error(`Video must be under 3 minutes (yours: ${Math.floor(dur / 60)}m ${Math.floor(dur % 60)}s)`);
      setPendingFile(null);
      setPreview(existingUrl || null);
    }
  };

  const uploadVideo = async () => {
    if (!pendingFile) return;
    if (duration && duration > MAX_DURATION_SEC) return void toast.error("Video exceeds 3-minute limit");
    setUploading(true);
    setProgress(10);
    const ext = pendingFile.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `${currentUserId}/${listingId || "draft"}/${Date.now()}.${ext}`;
    if (existingStoragePath) {
      await supabase.storage.from("marketplace-videos").remove([existingStoragePath]);
    }
    setProgress(30);
    const { error } = await supabase.storage.from("marketplace-videos").upload(path, pendingFile, {
      contentType: pendingFile.type,
      upsert: false,
    });
    if (error) { setUploading(false); setProgress(0); return void toast.error(error.message); }
    setProgress(90);
    const { data: urlData } = await supabase.storage
      .from("marketplace-videos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    setProgress(100);
    setUploading(false);
    setPendingFile(null);
    if (urlData?.signedUrl) { onUploaded(urlData.signedUrl, path); toast.success("Video uploaded"); }
    else toast.error("Upload succeeded but URL generation failed");
  };

  const clearVideo = () => {
    setPreview(null);
    setPendingFile(null);
    setDuration(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <video
            ref={videoRef}
            src={preview}
            controls
            className="w-full h-full object-contain"
            onLoadedMetadata={handleMetadata}
          />
          <button
            onClick={clearVideo}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white"
          >
            <Icon name="X" size={13} />
          </button>
          {duration && duration <= MAX_DURATION_SEC && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-[11px] text-white font-medium">
              {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")} / 3:00
            </div>
          )}
        </div>
      ) : (
        <label
          htmlFor="video-upload-input"
          className="flex flex-col items-center justify-center gap-2 h-32 rounded-2xl border-2 border-dashed border-black/10 bg-[#F5F5F7] cursor-pointer hover:border-[#0A84FF]/40 hover:bg-[#0A84FF]/5 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
            <Icon name="Video" size={18} color="#0A84FF" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">Upload demo video</p>
            <p className="text-[11.5px] text-[#86868B] tracking-tight mt-0.5">MP4, WEBM or MOV · Max 3 min · 200 MB</p>
          </div>
        </label>
      )}
      <input ref={fileRef} id="video-upload-input" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleFileSelect} className="hidden" />
      {uploading && (
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-[#E5E5EA] overflow-hidden">
            <div className="h-full bg-[#0A84FF] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11.5px] text-[#86868B] text-center tracking-tight">Uploading… {progress}%</p>
        </div>
      )}
      {pendingFile && !uploading && (
        <div className="flex gap-2">
          <button
            onClick={uploadVideo}
            disabled={!!(duration && duration > MAX_DURATION_SEC)}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[13.5px] font-semibold tracking-tight text-white transition-colors flex items-center justify-center gap-1.5",
              duration && duration > MAX_DURATION_SEC ? "bg-[#FF3B30] cursor-not-allowed" : "bg-[#0A84FF] hover:bg-[#0066CC]",
            )}
          >
            <Icon name="Upload" size={13} />
            {duration && duration > MAX_DURATION_SEC ? "Too long" : "Upload to storage"}
          </button>
          <button onClick={clearVideo} className="px-3 py-2.5 rounded-xl text-[13.5px] font-semibold tracking-tight text-[#86868B] bg-[#F5F5F7]">
            Cancel
          </button>
        </div>
      )}
      <p className="text-[11px] text-[#86868B] text-center tracking-tight">
        Or{" "}
        <button
          type="button"
          onClick={() => {
            const url = prompt("Paste video URL (YouTube, Loom, direct link):");
            if (url) { setPreview(url); onUploaded(url, ""); }
          }}
          className="text-[#0A84FF] font-medium"
        >
          paste a URL instead
        </button>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* VideoPlayer — for listing detail view                               */
/* ------------------------------------------------------------------ */

type PlayerProps = { url?: string | null; storagePath?: string | null };

export function VideoPlayer({ url, storagePath }: PlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setSignedUrl(url || null);
      return;
    }
    setLoading(true);
    supabase.storage
      .from("marketplace-videos")
      .createSignedUrl(storagePath, 3600)
      .then(({ data, error: err }: { data: { signedUrl: string } | null; error: unknown }) => {
        setLoading(false);
        if (err) setError("Could not load video");
        else setSignedUrl(data?.signedUrl || null);
      });
  }, [storagePath, url]);

  if (!url && !storagePath) return null;

  if (loading) {
    return (
      <div className="aspect-video rounded-2xl bg-[#F5F5F7] flex items-center justify-center">
        <Icon name="Loader2" size={24} color="#86868B" className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="aspect-video rounded-2xl bg-[#F5F5F7] flex flex-col items-center justify-center gap-2">
        <Icon name="VideoOff" size={22} color="#86868B" />
        <p className="text-[12px] text-[#86868B] tracking-tight">{error}</p>
      </div>
    );
  }
  if (!signedUrl) return null;

  const isYouTube = signedUrl.includes("youtube.com") || signedUrl.includes("youtu.be");
  const isLoom = signedUrl.includes("loom.com");

  if (isYouTube || isLoom) {
    let embedUrl = signedUrl;
    if (isYouTube) {
      const match = signedUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
      if (match) embedUrl = `https://www.youtube.com/embed/${match[1]}`;
    } else {
      embedUrl = signedUrl.replace("loom.com/share/", "loom.com/embed/");
    }
    return (
      <div className="aspect-video rounded-2xl overflow-hidden">
        <iframe src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" allowFullScreen />
      </div>
    );
  }

  return (
    <div className="aspect-video rounded-2xl overflow-hidden bg-black">
      <video src={signedUrl} controls className="w-full h-full object-contain" preload="metadata" />
    </div>
  );
}
